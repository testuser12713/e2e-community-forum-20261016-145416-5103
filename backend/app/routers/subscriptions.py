"""Subscriptions to threads."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.errors import not_implemented
from shared.db import get_db
from shared.schemas.notifications import SubscriptionState

router = APIRouter(tags=["subscriptions"])


@router.get("/api/threads/{id}/subscription", response_model=SubscriptionState)
def read_subscription(id: int, db: Session = Depends(get_db)) -> SubscriptionState:
    raise not_implemented("subscriptions (#3)")


@router.post("/api/threads/{id}/subscription", status_code=204)
def subscribe(id: int, db: Session = Depends(get_db)) -> None:
    raise not_implemented("subscriptions (#3)")


@router.delete("/api/threads/{id}/subscription", status_code=204)
def unsubscribe(id: int, db: Session = Depends(get_db)) -> None:
    raise not_implemented("subscriptions (#3)")
