"""Votes on threads and comments."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.errors import not_implemented
from app.routers.moderation import require_active_user
from shared.db import get_db
from shared.schemas.votes import VoteRequest, VoteResult

router = APIRouter(tags=["votes"])


@router.put("/api/threads/{id}/vote", response_model=VoteResult)
def vote_thread(
    id: int,
    payload: VoteRequest,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
) -> VoteResult:
    raise not_implemented("thread voting (#31)")


@router.put("/api/comments/{id}/vote", response_model=VoteResult)
def vote_comment(
    id: int,
    payload: VoteRequest,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
) -> VoteResult:
    raise not_implemented("comment voting (#31)")
