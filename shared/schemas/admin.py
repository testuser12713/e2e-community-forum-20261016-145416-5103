"""Administration schemas: users, bans, roles, statistics and the audit log."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from shared.schemas.users import UserOut


class UserAdmin(UserOut):
    banned_until: datetime | None
    ban_reason: str | None
    is_banned: bool


class BanRequest(BaseModel):
    reason: str = Field(min_length=1)
    expires_at: datetime | None = None


class RoleUpdate(BaseModel):
    role: Literal["user", "moderator", "admin"]


class AdminStats(BaseModel):
    users_today: int
    users_7d: int
    threads_today: int
    threads_7d: int
    comments_today: int
    comments_7d: int
    open_reports: int


class AuditEntry(BaseModel):
    id: int
    actor_username: str | None
    action: str
    target_type: str
    target_id: int | None
    details: str
    created_at: datetime
