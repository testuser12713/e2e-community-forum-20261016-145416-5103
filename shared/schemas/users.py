"""User and profile schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from shared.schemas.comments import CommentSummary
from shared.schemas.threads import ThreadSummary


class UserOut(BaseModel):
    """The signed-in user's own account."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    bio: str | None
    role: str
    karma: int
    created_at: datetime


class MeUpdate(BaseModel):
    bio: str | None = None


class PublicProfile(BaseModel):
    username: str
    bio: str | None
    karma: int
    created_at: datetime
    threads: list[ThreadSummary]
    comments: list[CommentSummary]
