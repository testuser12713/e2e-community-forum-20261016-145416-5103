"""The signed-in user's notifications and their unread counter.

These endpoints only READ and mark what the worker's notification job writes:
the API never creates a notification. ``GET /api/notifications`` returns the
caller's own notifications, newest first, with an optional ``unread_only``
filter; ``GET /api/notifications/unread-count`` returns how many are unread;
``POST /api/notifications/read`` marks the given ids — or every unread one when
``ids`` is omitted — as read.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.pagination import paginate
from app.security import get_current_user
from shared.db import get_db
from shared.models import Notification, User
from shared.schemas.common import Page
from shared.schemas.notifications import NotificationOut, NotificationReadRequest, UnreadCount

router = APIRouter(tags=["notifications"])


def _to_out(notification: Notification) -> NotificationOut:
    """Map a notification row onto the contract's shape, resolving the actor name."""
    return NotificationOut(
        id=notification.id,
        kind=notification.kind,
        thread_id=notification.thread_id,
        comment_id=notification.comment_id,
        actor_username=notification.actor.username if notification.actor is not None else None,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


@router.get("/api/notifications", response_model=Page[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[NotificationOut]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())

    result = paginate(db, stmt, page, page_size)
    return Page[NotificationOut](
        items=[_to_out(row) for row in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get("/api/notifications/unread-count", response_model=UnreadCount)
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UnreadCount:
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return UnreadCount(count=int(count or 0))


@router.post("/api/notifications/read", status_code=204)
def mark_read(
    payload: NotificationReadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    stmt = (
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    if payload.ids is not None:
        stmt = stmt.where(Notification.id.in_(payload.ids))
    db.execute(stmt)
    db.commit()
