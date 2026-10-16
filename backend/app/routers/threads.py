"""Thread creation, reading, editing and soft deletion."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.errors import not_implemented
from app.ratelimit import enforce_write_limit
from app.routers.moderation import require_active_user
from shared.db import get_db
from shared.schemas.threads import ThreadCreate, ThreadDetail, ThreadUpdate

router = APIRouter(tags=["threads"])


@router.post("/api/threads", response_model=ThreadDetail, status_code=201)
def create_thread(
    payload: ThreadCreate,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("thread_create"),
) -> ThreadDetail:
    raise not_implemented("thread creation (#32)")


@router.get("/api/threads/{id}", response_model=ThreadDetail)
def read_thread(id: int, db: Session = Depends(get_db)) -> ThreadDetail:
    raise not_implemented("the thread page (#32)")


@router.patch("/api/threads/{id}", response_model=ThreadDetail)
def update_thread(
    id: int,
    payload: ThreadUpdate,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("thread_update"),
) -> ThreadDetail:
    raise not_implemented("thread editing (#32)")


@router.delete("/api/threads/{id}", status_code=204)
def delete_thread(
    id: int,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
) -> None:
    raise not_implemented("thread deletion (#32)")
