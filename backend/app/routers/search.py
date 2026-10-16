"""Full-text search over threads.

``GET /api/search`` runs PostgreSQL's full-text search over the ``threads``
table: the query is parsed with ``websearch_to_tsquery`` and matched against the
generated ``search_vector`` (title plus body), the rows are ranked by relevance
and soft-deleted threads are excluded. An optional category slug and an optional
tag narrow the result further. The answer is the contract's
``Page[ThreadSummary]``.

Relevance is the search surface's order; the pinned-first rule describes the
category listings, so a pinned but poorly matching thread does not outrank a
better match here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.errors import api_error
from app.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, paginate
from shared.db import get_db
from shared.models import Category, Comment, Thread
from shared.schemas.common import Page, UserBrief
from shared.schemas.threads import ThreadSummary

router = APIRouter(tags=["search"])

SEARCH_LANGUAGE = "english"


def _comment_counts(db: Session, thread_ids: list[int]) -> dict[int, int]:
    """The number of non-deleted comments per thread, for the given ids.

    Counted live over the comment rows, never read from the cached
    ``Thread.comment_count`` column, so search agrees with the forum listing.
    """
    if not thread_ids:
        return {}
    rows = db.execute(
        select(Comment.thread_id, func.count(Comment.id))
        .where(Comment.thread_id.in_(thread_ids), Comment.deleted.is_(False))
        .group_by(Comment.thread_id)
    ).all()
    return dict(rows)


def _thread_summary(thread: Thread, comment_count: int) -> ThreadSummary:
    """Map a thread row (with its category and author loaded) to ``ThreadSummary``."""
    category = thread.category
    author = thread.author
    return ThreadSummary(
        id=thread.id,
        category_id=thread.category_id,
        category_slug=category.slug,
        category_name=category.name,
        title=thread.title,
        tags=list(thread.tags or []),
        score=thread.score,
        comment_count=comment_count,
        hot_score=thread.hot_score,
        pinned=thread.pinned,
        locked=thread.locked,
        deleted=thread.deleted,
        edited_at=thread.edited_at,
        created_at=thread.created_at,
        author=UserBrief(id=author.id, username=author.username, karma=author.karma),
    )


@router.get("/api/search", response_model=Page[ThreadSummary])
def search_threads(
    q: str = Query(..., description="full-text search query"),
    category: str | None = Query(None, description="category slug"),
    tag: str | None = Query(None, description="tag to require"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> Page[ThreadSummary]:
    """Search non-deleted threads by relevance, optionally filtered."""
    term = q.strip()
    if not term:
        raise api_error(
            "validation_error",
            "The search query must not be empty",
            422,
            {"q": "Enter a search term"},
        )

    category_slug = category.strip() if category and category.strip() else None
    tag_name = tag.strip() if tag and tag.strip() else None

    tsquery = func.websearch_to_tsquery(SEARCH_LANGUAGE, term)
    rank = func.ts_rank(Thread.search_vector, tsquery)

    stmt = (
        select(Thread)
        .options(joinedload(Thread.category), joinedload(Thread.author))
        .where(Thread.deleted.is_(False), Thread.search_vector.op("@@")(tsquery))
        .order_by(rank.desc(), Thread.created_at.desc(), Thread.id.desc())
    )
    if category_slug is not None:
        stmt = stmt.join(Category, Thread.category_id == Category.id).where(
            Category.slug == category_slug
        )
    if tag_name is not None:
        stmt = stmt.where(Thread.tags.contains([tag_name]))

    page_data = paginate(db, stmt, page, page_size)
    threads = page_data["items"]
    counts = _comment_counts(db, [thread.id for thread in threads])
    items = [_thread_summary(thread, counts.get(thread.id, 0)) for thread in threads]
    return Page[ThreadSummary](
        items=items,
        total=page_data["total"],
        page=page_data["page"],
        page_size=page_data["page_size"],
        pages=page_data["pages"],
    )
