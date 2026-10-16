"""Thread creation, reading, editing and soft deletion.

A thread carries a sanitised Markdown body: ``body_html`` is produced by
``shared.markdown.render_markdown``, which renders CommonMark with raw HTML
disabled and strips anything executable. Editing your own thread stamps
``edited_at``; deleting it is a soft delete (``deleted: true``), so its comments
stay in place. Creating or editing a body that mentions another user enqueues a
single ``notify`` job.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.ratelimit import enforce_write_limit
from app.routers.moderation import require_active_user
from shared.db import get_db
from shared.jobs import enqueue_job
from shared.markdown import render_markdown
from shared.models import Category, Comment, Thread, User
from shared.schemas.common import UserBrief
from shared.schemas.threads import ThreadCreate, ThreadDetail, ThreadUpdate

router = APIRouter(tags=["threads"])

_MENTION_RE = re.compile(r"@([A-Za-z0-9_]{1,32})")


def _extract_mentions(text: str, actor_username: str) -> list[str]:
    """The unique @-mentions of a body, in order, without the author's own name."""
    mentions: list[str] = []
    for name in _MENTION_RE.findall(text or ""):
        if name == actor_username or name in mentions:
            continue
        mentions.append(name)
    return mentions


def _normalize_tags(tags: list[str]) -> list[str]:
    """Trim the tags, drop blanks and duplicates, and cap them at five."""
    seen: list[str] = []
    for tag in tags:
        cleaned = tag.strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen[:5]


def _comment_count(db: Session, thread_id: int) -> int:
    """The number of non-deleted comments of a thread, counted live."""
    return (
        db.scalar(
            select(func.count(Comment.id)).where(
                Comment.thread_id == thread_id, Comment.deleted.is_(False)
            )
        )
        or 0
    )


def _detail(thread: Thread, db: Session) -> ThreadDetail:
    """Map a thread row onto the contract's ``ThreadDetail``."""
    author: User = thread.author
    return ThreadDetail(
        id=thread.id,
        category_id=thread.category_id,
        category_slug=thread.category.slug,
        category_name=thread.category.name,
        title=thread.title,
        tags=list(thread.tags or []),
        score=thread.score,
        comment_count=_comment_count(db, thread.id),
        hot_score=thread.hot_score,
        pinned=thread.pinned,
        locked=thread.locked,
        deleted=thread.deleted,
        edited_at=thread.edited_at,
        created_at=thread.created_at,
        author=UserBrief(id=author.id, username=author.username, karma=author.karma),
        body_markdown=thread.body_markdown,
        body_html=render_markdown(thread.body_markdown),
    )


@router.post("/api/threads", response_model=ThreadDetail, status_code=201)
def create_thread(
    payload: ThreadCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("thread_create"),
) -> ThreadDetail:
    """Create a thread in an existing category; 404 for an unknown category."""
    category = db.get(Category, payload.category_id)
    if category is None:
        raise api_error(
            "not_found",
            "The category does not exist",
            404,
            {"category_id": "unknown category"},
        )

    thread = Thread(
        category_id=category.id,
        author_id=user.id,
        title=payload.title,
        body_markdown=payload.body_markdown,
        tags=_normalize_tags(payload.tags),
    )
    db.add(thread)
    db.flush()

    mentions = _extract_mentions(payload.body_markdown, user.username)
    if mentions:
        enqueue_job(
            db,
            "notify",
            {
                "thread_id": thread.id,
                "comment_id": None,
                "actor_id": user.id,
                "mentions": mentions,
            },
        )

    db.commit()
    db.refresh(thread)
    return _detail(thread, db)


@router.get("/api/threads/{id}", response_model=ThreadDetail)
def read_thread(id: int, db: Session = Depends(get_db)) -> ThreadDetail:
    """The thread page; 404 for an unknown or soft-deleted thread."""
    thread = db.get(Thread, id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "Thread not found", 404)
    return _detail(thread, db)


@router.patch("/api/threads/{id}", response_model=ThreadDetail)
def update_thread(
    id: int,
    payload: ThreadUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("thread_update"),
) -> ThreadDetail:
    """Edit the caller's own thread; 403 for someone else's, 404 for unknown."""
    thread = db.get(Thread, id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "Thread not found", 404)
    if thread.author_id != user.id:
        raise api_error("forbidden", "You can only edit your own threads", 403)

    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        thread.title = data["title"]
    if "body_markdown" in data:
        thread.body_markdown = data["body_markdown"]
    if "tags" in data:
        thread.tags = _normalize_tags(data["tags"] or [])

    if data:
        thread.edited_at = datetime.now(UTC)
        db.flush()

        mentions = _extract_mentions(thread.body_markdown, user.username)
        if "body_markdown" in data and mentions:
            enqueue_job(
                db,
                "notify",
                {
                    "thread_id": thread.id,
                    "comment_id": None,
                    "actor_id": user.id,
                    "mentions": mentions,
                },
            )

    db.commit()
    db.refresh(thread)
    return _detail(thread, db)


@router.delete("/api/threads/{id}", status_code=204)
def delete_thread(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> None:
    """Soft-delete the caller's own thread; 403 for someone else's."""
    thread = db.get(Thread, id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "Thread not found", 404)
    if thread.author_id != user.id:
        raise api_error("forbidden", "You can only delete your own threads", 403)

    thread.deleted = True
    db.commit()
    return None
