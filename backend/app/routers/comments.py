"""Nested comments on threads."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.errors import not_implemented
from app.ratelimit import enforce_write_limit
from app.routers.moderation import require_active_user
from shared.db import get_db
from shared.schemas.comments import CommentCreate, CommentNode, CommentUpdate
from shared.schemas.common import Page

router = APIRouter(tags=["comments"])


@router.get("/api/threads/{id}/comments", response_model=Page[CommentNode])
def list_comments(
    id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[CommentNode]:
    raise not_implemented("the comment tree (#15)")


@router.post("/api/threads/{id}/comments", response_model=CommentNode, status_code=201)
def create_comment(
    id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("comment_create"),
) -> CommentNode:
    raise not_implemented("commenting (#15)")


@router.patch("/api/comments/{id}", response_model=CommentNode)
def update_comment(
    id: int,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("comment_update"),
) -> CommentNode:
    raise not_implemented("comment editing (#15)")


@router.delete("/api/comments/{id}", status_code=204)
def delete_comment(
    id: int,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
) -> None:
    raise not_implemented("comment deletion (#15)")
