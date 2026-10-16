"""The paginated thread listings with the new/top/hot sort orders.

``new`` orders by ``created_at`` descending, ``top`` by the cached ``score``
column, and ``hot`` by the ``hot_score`` column the worker's hot job maintains.
The listing never computes or writes the hot score itself. Pinned threads come
first, soft-deleted threads never appear, and ``comment_count`` counts the
non-deleted comments of the thread.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.pagination import paginate
from shared.db import get_db
from shared.models import Category, Comment, Thread
from shared.schemas.common import Page, UserBrief
from shared.schemas.threads import ThreadSummary

router = APIRouter(tags=["threads"])


def _order_by(sort: str) -> tuple[Any, ...]:
    """The ``ORDER BY`` clause for a sort order, pinned threads first.

    A pinned flag leads every order so pinned threads stay on top of the list;
    ``Thread.id`` is the final tie-breaker that keeps the pages stable.
    """
    if sort == "top":
        return (
            Thread.pinned.desc(),
            Thread.score.desc(),
            Thread.created_at.desc(),
            Thread.id.desc(),
        )
    if sort == "hot":
        return (
            Thread.pinned.desc(),
            Thread.hot_score.desc(),
            Thread.created_at.desc(),
            Thread.id.desc(),
        )
    return (Thread.pinned.desc(), Thread.created_at.desc(), Thread.id.desc())


def _comment_counts(db: Session, thread_ids: list[int]) -> dict[int, int]:
    """The number of non-deleted comments per thread, for the given ids."""
    if not thread_ids:
        return {}
    rows = db.execute(
        select(Comment.thread_id, func.count(Comment.id))
        .where(Comment.thread_id.in_(thread_ids), Comment.deleted.is_(False))
        .group_by(Comment.thread_id)
    ).all()
    return dict(rows)


def _to_summary(thread: Thread, comment_count: int) -> ThreadSummary:
    return ThreadSummary(
        id=thread.id,
        category_id=thread.category_id,
        category_slug=thread.category.slug,
        category_name=thread.category.name,
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
        author=UserBrief(
            id=thread.author.id,
            username=thread.author.username,
            karma=thread.author.karma,
        ),
    )


@router.get("/api/threads", response_model=Page[ThreadSummary])
def list_threads(
    category: str | None = Query(None, description="category slug"),
    sort: str = Query("new", pattern="^(new|top|hot)$"),
    tag: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[ThreadSummary]:
    stmt: Select[Any] = (
        select(Thread)
        .options(selectinload(Thread.category), selectinload(Thread.author))
        .join(Category, Category.id == Thread.category_id)
        .where(Thread.deleted.is_(False))
    )
    if category:
        stmt = stmt.where(Category.slug == category)
    if tag:
        stmt = stmt.where(Thread.tags.contains([tag]))
    stmt = stmt.order_by(*_order_by(sort))

    page_data = paginate(db, stmt, page, page_size)
    threads: list[Thread] = page_data["items"]
    counts = _comment_counts(db, [thread.id for thread in threads])
    items = [_to_summary(thread, counts.get(thread.id, 0)) for thread in threads]

    return Page[ThreadSummary](
        items=items,
        total=page_data["total"],
        page=page_data["page"],
        page_size=page_data["page_size"],
        pages=page_data["pages"],
    )
