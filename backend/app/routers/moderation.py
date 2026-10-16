"""Moderation tools: bans, roles, pinned/locked/moved threads — and the guard
every write endpoint uses to keep banned users from writing."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import api_error, not_implemented
from app.security import get_current_user, require_role
from shared.db import get_db
from shared.models import Ban, User
from shared.schemas.admin import BanRequest, RoleUpdate, UserAdmin
from shared.schemas.common import Page
from shared.schemas.threads import ThreadLock, ThreadMove, ThreadPin, ThreadSummary

router = APIRouter(tags=["moderation"])

moderator_only = [Depends(require_role("moderator", "admin"))]


def active_ban(db: Session, user_id: int) -> Ban | None:
    """The user's current ban, if one is in force."""
    now = datetime.now(UTC)
    return db.scalars(
        select(Ban)
        .where(
            Ban.user_id == user_id,
            Ban.revoked_at.is_(None),
            or_(Ban.expires_at.is_(None), Ban.expires_at > now),
        )
        .order_by(Ban.created_at.desc())
    ).first()


def require_active_user(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    """Dependency: a banned user may read, but every write answers 403."""
    if active_ban(db, user.id) is not None:
        raise api_error("banned", "Your account is banned — writing is disabled", 403)
    return user


@router.post("/api/admin/users/{id}/ban", response_model=UserAdmin, dependencies=moderator_only)
def ban_user(id: int, payload: BanRequest, db: Session = Depends(get_db)) -> UserAdmin:
    raise not_implemented("bans (#25)")


@router.delete("/api/admin/users/{id}/ban", response_model=UserAdmin, dependencies=moderator_only)
def unban_user(id: int, db: Session = Depends(get_db)) -> UserAdmin:
    raise not_implemented("bans (#25)")


@router.patch("/api/admin/users/{id}/role", response_model=UserAdmin, dependencies=moderator_only)
def change_role(id: int, payload: RoleUpdate, db: Session = Depends(get_db)) -> UserAdmin:
    raise not_implemented("role changes (#25)")


@router.get("/api/admin/users", response_model=Page[UserAdmin], dependencies=moderator_only)
def list_users(
    q: str | None = Query(None),
    role: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[UserAdmin]:
    raise not_implemented("user administration (#25)")


@router.post(
    "/api/admin/threads/{id}/pin", response_model=ThreadSummary, dependencies=moderator_only
)
def pin_thread(id: int, payload: ThreadPin, db: Session = Depends(get_db)) -> ThreadSummary:
    raise not_implemented("thread moderation (#25)")


@router.post(
    "/api/admin/threads/{id}/lock", response_model=ThreadSummary, dependencies=moderator_only
)
def lock_thread(id: int, payload: ThreadLock, db: Session = Depends(get_db)) -> ThreadSummary:
    raise not_implemented("thread moderation (#25)")


@router.post(
    "/api/admin/threads/{id}/move", response_model=ThreadSummary, dependencies=moderator_only
)
def move_thread(id: int, payload: ThreadMove, db: Session = Depends(get_db)) -> ThreadSummary:
    raise not_implemented("thread moderation (#25)")


@router.delete("/api/admin/threads/{id}", status_code=204, dependencies=moderator_only)
def remove_thread(id: int, db: Session = Depends(get_db)) -> None:
    raise not_implemented("thread moderation (#25)")
