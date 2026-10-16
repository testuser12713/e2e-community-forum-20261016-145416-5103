"""Votes on threads and comments.

A user holds at most one vote per piece of content. The request carries
``value`` 1 (upvote), -1 (downvote) or 0 (withdraw). Sending the same value
again removes the vote; switching between 1 and -1 moves the score by two. A
user may not vote on their own content, and a banned user may not vote at all
(both answer 403). Every change updates the content's cached ``score`` and the
author's ``karma``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.routers.moderation import require_active_user
from app.services.karma import recompute_comment_score, recompute_karma, recompute_thread_score
from shared.db import get_db
from shared.models import Comment, Thread, User, Vote
from shared.schemas.votes import VoteRequest, VoteResult

router = APIRouter(tags=["votes"])


def _set_vote(
    db: Session,
    *,
    user_id: int,
    value: int,
    thread_id: int | None = None,
    comment_id: int | None = None,
) -> int:
    """Store, change or withdraw the caller's single vote and return it (0 = none)."""
    target = Vote.thread_id == thread_id if thread_id is not None else Vote.comment_id == comment_id
    existing = db.scalars(select(Vote).where(Vote.user_id == user_id).where(target)).first()

    if value == 0 or (existing is not None and existing.value == value):
        if existing is not None:
            db.delete(existing)
        effective = 0
    elif existing is None:
        db.add(Vote(user_id=user_id, thread_id=thread_id, comment_id=comment_id, value=value))
        effective = value
    else:
        existing.value = value
        effective = value
    db.flush()
    return effective


def _vote_thread(db: Session, user: User, thread_id: int, value: int) -> tuple[int, int]:
    thread = db.get(Thread, thread_id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "Thread not found", 404)
    if thread.author_id == user.id:
        raise api_error("forbidden", "You cannot vote on your own content", 403)

    effective = _set_vote(db, user_id=user.id, value=value, thread_id=thread.id)
    score = recompute_thread_score(db, thread)
    recompute_karma(db, thread.author_id)
    db.commit()
    return score, effective


def _vote_comment(db: Session, user: User, comment_id: int, value: int) -> tuple[int, int]:
    comment = db.get(Comment, comment_id)
    if comment is None or comment.deleted:
        raise api_error("not_found", "Comment not found", 404)
    if comment.author_id == user.id:
        raise api_error("forbidden", "You cannot vote on your own content", 403)

    effective = _set_vote(db, user_id=user.id, value=value, comment_id=comment.id)
    score = recompute_comment_score(db, comment)
    recompute_karma(db, comment.author_id)
    db.commit()
    return score, effective


@router.put("/api/threads/{id}/vote", response_model=VoteResult)
def vote_thread(
    id: int,
    payload: VoteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> VoteResult:
    score, my_vote = _vote_thread(db, user, id, payload.value)
    return VoteResult(score=score, my_vote=my_vote)


@router.put("/api/comments/{id}/vote", response_model=VoteResult)
def vote_comment(
    id: int,
    payload: VoteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> VoteResult:
    score, my_vote = _vote_comment(db, user, id, payload.value)
    return VoteResult(score=score, my_vote=my_vote)
