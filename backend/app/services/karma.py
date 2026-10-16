"""Karma and the cached score columns.

Karma is the sum of the votes received on everything a user has written —
their threads and their comments. Whenever a vote changes, the affected
content's cached ``score`` column is recomputed from its votes and the author's
``karma`` is recomputed from the votes on all of their content, so
``GET /api/users/{username}`` serves a value that is always current.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shared.models import Comment, Thread, User, Vote


def _sum_votes(db: Session, column) -> int:
    """The sum of every vote cast upon the rows matched by ``column``."""
    total = db.scalar(select(func.coalesce(func.sum(Vote.value), 0)).where(column))
    return int(total or 0)


def recompute_thread_score(db: Session, thread: Thread) -> int:
    """Set ``thread.score`` from its votes and return the new score."""
    thread.score = _sum_votes(db, Vote.thread_id == thread.id)
    db.flush()
    return thread.score


def recompute_comment_score(db: Session, comment: Comment) -> int:
    """Set ``comment.score`` from its votes and return the new score."""
    comment.score = _sum_votes(db, Vote.comment_id == comment.id)
    db.flush()
    return comment.score


def recompute_karma(db: Session, user_id: int) -> int:
    """Recompute a user's karma from the votes on their threads and comments."""
    thread_karma = db.scalar(
        select(func.coalesce(func.sum(Vote.value), 0))
        .join(Thread, Vote.thread_id == Thread.id)
        .where(Thread.author_id == user_id)
    )
    comment_karma = db.scalar(
        select(func.coalesce(func.sum(Vote.value), 0))
        .join(Comment, Vote.comment_id == Comment.id)
        .where(Comment.author_id == user_id)
    )

    user = db.get(User, user_id)
    if user is None:
        return 0
    user.karma = int(thread_karma or 0) + int(comment_karma or 0)
    db.flush()
    return user.karma
