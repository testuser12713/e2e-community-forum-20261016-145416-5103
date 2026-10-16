"""The signed-in user's notifications and their unread counter."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.errors import not_implemented
from shared.db import get_db
from shared.schemas.common import Page
from shared.schemas.notifications import NotificationOut, NotificationReadRequest, UnreadCount

router = APIRouter(tags=["notifications"])


@router.get("/api/notifications", response_model=Page[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[NotificationOut]:
    raise not_implemented("the notification list (#3)")


@router.get("/api/notifications/unread-count", response_model=UnreadCount)
def unread_count(db: Session = Depends(get_db)) -> UnreadCount:
    raise not_implemented("the unread counter (#3)")


@router.post("/api/notifications/read", status_code=204)
def mark_read(payload: NotificationReadRequest, db: Session = Depends(get_db)) -> None:
    raise not_implemented("marking notifications read (#3)")
