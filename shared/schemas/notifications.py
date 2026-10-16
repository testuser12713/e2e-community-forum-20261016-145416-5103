"""Subscription and notification schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SubscriptionState(BaseModel):
    subscribed: bool


class NotificationOut(BaseModel):
    id: int
    kind: str
    thread_id: int | None
    comment_id: int | None
    actor_username: str | None
    created_at: datetime
    read_at: datetime | None


class NotificationReadRequest(BaseModel):
    ids: list[int] | None = None


class UnreadCount(BaseModel):
    count: int
