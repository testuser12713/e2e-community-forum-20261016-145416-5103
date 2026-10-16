"""The signed-in user's account and public profiles.

``GET /api/users/{username}`` serves the contract's ``PublicProfile``: the
user's bio and karma (read straight off the ``users`` row — karma is maintained
by the votes feature, never computed here), plus their non-deleted threads and
comments, newest first.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalize_page
from app.security import get_current_user
from shared.db import get_db
from shared.models import Category, Comment, Thread, User
from shared.schemas.comments import CommentSummary
from shared.schemas.common import UserBrief
from shared.schemas.threads import ThreadSummary
from shared.schemas.users import MeUpdate, PublicProfile, UserOut

router = APIRouter(tags=["users"])

EXCERPT_LENGTH = 200


def _excerpt(body_markdown: str, limit: int = EXCERPT_LENGTH) -> str:
    """A short, single-line plain-text preview of a comment body."""
    text = " ".join(body_markdown.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _thread_summary(thread: Thread, category: Category, author: User) -> ThreadSummary:
    """Map a thread row (with its category and author) onto ``ThreadSummary``."""
    return ThreadSummary(
        id=thread.id,
        category_id=thread.category_id,
        category_slug=category.slug,
        category_name=category.name,
        title=thread.title,
        tags=list(thread.tags or []),
        score=thread.score,
        comment_count=thread.comment_count,
        hot_score=thread.hot_score,
        pinned=thread.pinned,
        locked=thread.locked,
        deleted=thread.deleted,
        edited_at=thread.edited_at,
        created_at=thread.created_at,
        author=UserBrief(id=author.id, username=author.username, karma=author.karma),
    )


@router.get("/api/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> UserOut:
    """The signed-in user's own account."""
    return UserOut.model_validate(user)


@router.patch("/api/me", response_model=UserOut)
def update_me(
    payload: MeUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Update the signed-in user's editable profile fields (the bio)."""
    data = payload.model_dump(exclude_unset=True)
    if "bio" in data:
        user.bio = data["bio"]
        db.add(user)
        db.commit()
        db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/api/users/{username}", response_model=PublicProfile)
def read_profile(
    username: str,
    page: int = Query(1, ge=1, description="1-based page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> PublicProfile:
    """The public profile of any user; 404 for an unknown username."""
    user = db.scalars(select(User).where(User.username == username)).first()
    if user is None:
        raise api_error("not_found", "This user does not exist", 404)

    page, page_size = normalize_page(page, page_size)
    offset = (page - 1) * page_size

    thread_rows = db.execute(
        select(Thread, Category)
        .join(Category, Thread.category_id == Category.id)
        .where(Thread.author_id == user.id, Thread.deleted.is_(False))
        .order_by(Thread.created_at.desc(), Thread.id.desc())
        .limit(page_size)
        .offset(offset)
    ).all()
    threads = [_thread_summary(thread, category, user) for thread, category in thread_rows]

    comment_rows = db.execute(
        select(Comment, Thread.title)
        .join(Thread, Comment.thread_id == Thread.id)
        .where(Comment.author_id == user.id, Comment.deleted.is_(False))
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(page_size)
        .offset(offset)
    ).all()
    comments = [
        CommentSummary(
            id=comment.id,
            thread_id=comment.thread_id,
            thread_title=thread_title,
            excerpt=_excerpt(comment.body_markdown),
            created_at=comment.created_at,
        )
        for comment, thread_title in comment_rows
    ]

    return PublicProfile(
        username=user.username,
        bio=user.bio,
        karma=user.karma,
        created_at=user.created_at,
        threads=threads,
        comments=comments,
    )
