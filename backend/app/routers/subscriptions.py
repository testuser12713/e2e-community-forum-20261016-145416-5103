"""Subscriptions to threads.

A signed-in user can subscribe to (and unsubscribe from) a thread. Both writes
are idempotent: subscribing twice keeps exactly one row, unsubscribing a thread
that was never subscribed still answers 204. The ``GET`` reports whether the
caller currently subscribes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.routers.moderation import require_active_user
from app.security import get_current_user
from shared.db import get_db
from shared.models import Subscription, Thread, User
from shared.schemas.notifications import SubscriptionState

router = APIRouter(tags=["subscriptions"])


def _require_thread(db: Session, thread_id: int) -> Thread:
    """The thread, or the contract's 404."""
    thread = db.get(Thread, thread_id)
    if thread is None:
        raise api_error("not_found", "The thread does not exist", 404, {"id": "unknown thread"})
    return thread


@router.get("/api/threads/{id}/subscription", response_model=SubscriptionState)
def read_subscription(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubscriptionState:
    _require_thread(db, id)
    existing = db.scalar(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.thread_id == id,
        )
    )
    return SubscriptionState(subscribed=existing is not None)


@router.post("/api/threads/{id}/subscription", status_code=204)
def subscribe(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> None:
    _require_thread(db, id)
    existing = db.scalar(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.thread_id == id,
        )
    )
    if existing is None:
        db.add(Subscription(user_id=user.id, thread_id=id))
        db.commit()


@router.delete("/api/threads/{id}/subscription", status_code=204)
def unsubscribe(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> None:
    _require_thread(db, id)
    existing = db.scalar(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.thread_id == id,
        )
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
