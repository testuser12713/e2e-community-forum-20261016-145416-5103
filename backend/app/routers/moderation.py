"""Moderation tools: bans, roles, pinned/locked/moved threads — and the guard
every write endpoint uses to keep banned users from writing."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.pagination import paginate
from app.security import get_current_user, require_role
from app.services.audit import record_audit
from shared.db import get_db
from shared.models import Ban, Category, Thread, User
from shared.schemas.admin import BanRequest, RoleUpdate, UserAdmin
from shared.schemas.common import Page, UserBrief
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


def active_moderator(
    user: User = Depends(require_role("moderator", "admin")), db: Session = Depends(get_db)
) -> User:
    """Dependency: a moderator or admin whose own account is not banned."""
    if active_ban(db, user.id) is not None:
        raise api_error("banned", "Your account is banned — writing is disabled", 403)
    return user


def _thread_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    """Non-deleted thread counts per user, for the given user ids."""
    if not user_ids:
        return {}
    rows = db.execute(
        select(Thread.author_id, func.count())
        .where(Thread.author_id.in_(user_ids), Thread.deleted.is_(False))
        .group_by(Thread.author_id)
    ).all()
    return dict(rows)


def _user_admin(db: Session, user: User, thread_count: int | None = None) -> UserAdmin:
    """Map a user row plus its currently active ban onto ``UserAdmin``."""
    ban = active_ban(db, user.id)
    if thread_count is None:
        thread_count = _thread_counts(db, [user.id]).get(user.id, 0)
    return UserAdmin(
        id=user.id,
        username=user.username,
        email=user.email,
        bio=user.bio,
        role=user.role,
        karma=user.karma,
        created_at=user.created_at,
        banned_until=ban.expires_at if ban is not None else None,
        ban_reason=ban.reason if ban is not None else None,
        is_banned=ban is not None,
        thread_count=thread_count,
    )


def _require_user(db: Session, user_id: int) -> User:
    """The user, or the contract's 404."""
    user = db.get(User, user_id)
    if user is None:
        raise api_error("not_found", "This user does not exist", 404, {"id": "unknown user"})
    return user


def _require_thread(db: Session, thread_id: int) -> Thread:
    """A live thread, or the contract's 404 (unknown and removed alike)."""
    thread = db.get(Thread, thread_id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "The thread does not exist", 404, {"id": "unknown thread"})
    return thread


def _thread_summary(thread: Thread) -> ThreadSummary:
    """Map a thread row (with its category and author loaded) onto ``ThreadSummary``."""
    category = thread.category
    author = thread.author
    return ThreadSummary(
        id=thread.id,
        category_id=thread.category_id,
        category_slug=category.slug,
        category_name=category.name,
        title=thread.title,
        tags=list(thread.tags or []),
        score=thread.score,
        comment_count=thread.comment_count,
        hot_score=thread.hot_score,
        pinned=thread.pinned,
        locked=thread.locked,
        deleted=thread.deleted,
        edited_at=thread.edited_at,
        created_at=thread.created_at,
        author=UserBrief(id=author.id, username=author.username, karma=author.karma),
    )


def _revoke_active_bans(db: Session, user_id: int) -> None:
    """Mark every ban still in force for the user as revoked (lazy expiry aware)."""
    now = datetime.now(UTC)
    for ban in db.scalars(
        select(Ban).where(Ban.user_id == user_id, Ban.revoked_at.is_(None))
    ).all():
        if ban.expires_at is None or ban.expires_at > now:
            ban.revoked_at = now


@router.post("/api/admin/users/{id}/ban", response_model=UserAdmin)
def ban_user(
    id: int,
    payload: BanRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> UserAdmin:
    """Ban a user with a reason and an optional expiry; replaces any active ban."""
    user = _require_user(db, id)
    _revoke_active_bans(db, id)
    db.add(Ban(user_id=id, reason=payload.reason, expires_at=payload.expires_at))
    record_audit(
        db,
        actor.id,
        "user.ban",
        "user",
        id,
        {"reason": payload.reason, "expires_at": payload.expires_at},
    )
    db.commit()
    db.refresh(user)
    return _user_admin(db, user)


@router.delete("/api/admin/users/{id}/ban", response_model=UserAdmin)
def unban_user(
    id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> UserAdmin:
    """Lift every ban still in force for the user."""
    user = _require_user(db, id)
    _revoke_active_bans(db, id)
    record_audit(db, actor.id, "user.unban", "user", id, {})
    db.commit()
    db.refresh(user)
    return _user_admin(db, user)


@router.patch("/api/admin/users/{id}/role", response_model=UserAdmin)
def change_role(
    id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> UserAdmin:
    """Change a user's role; every change lands in the audit log."""
    user = _require_user(db, id)
    previous_role = user.role
    user.role = payload.role
    record_audit(
        db,
        actor.id,
        "user.role",
        "user",
        id,
        {"role": payload.role, "previous_role": previous_role},
    )
    db.commit()
    db.refresh(user)
    return _user_admin(db, user)


@router.get("/api/admin/users", response_model=Page[UserAdmin], dependencies=moderator_only)
def list_users(
    q: str | None = Query(None),
    role: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[UserAdmin]:
    """Search users by username or e-mail, filter by role, newest first."""
    stmt = select(User).order_by(User.id.desc())
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.username.ilike(pattern), User.email.ilike(pattern)))
    if role:
        stmt = stmt.where(User.role == role)
    result = paginate(db, stmt, page, page_size)
    users: list[User] = result["items"]
    counts = _thread_counts(db, [user.id for user in users])
    result["items"] = [_user_admin(db, user, counts.get(user.id, 0)) for user in users]
    return Page[UserAdmin](**result)


@router.post("/api/admin/threads/{id}/pin", response_model=ThreadSummary)
def pin_thread(
    id: int,
    payload: ThreadPin,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> ThreadSummary:
    """Pin or unpin a thread; a pinned thread leads its category."""
    thread = _require_thread(db, id)
    thread.pinned = payload.pinned
    record_audit(db, actor.id, "thread.pin", "thread", id, {"pinned": payload.pinned})
    db.commit()
    db.refresh(thread)
    return _thread_summary(thread)


@router.post("/api/admin/threads/{id}/lock", response_model=ThreadSummary)
def lock_thread(
    id: int,
    payload: ThreadLock,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> ThreadSummary:
    """Lock or unlock a thread; a locked thread accepts no new comments."""
    thread = _require_thread(db, id)
    thread.locked = payload.locked
    record_audit(db, actor.id, "thread.lock", "thread", id, {"locked": payload.locked})
    db.commit()
    db.refresh(thread)
    return _thread_summary(thread)


@router.post("/api/admin/threads/{id}/move", response_model=ThreadSummary)
def move_thread(
    id: int,
    payload: ThreadMove,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> ThreadSummary:
    """Move a thread into another category; 404 for an unknown category."""
    thread = _require_thread(db, id)
    category = db.get(Category, payload.category_id)
    if category is None:
        raise api_error(
            "not_found",
            "The category does not exist",
            404,
            {"category_id": "unknown category"},
        )
    thread.category_id = category.id
    record_audit(db, actor.id, "thread.move", "thread", id, {"category_id": category.id})
    db.commit()
    db.refresh(thread)
    return _thread_summary(thread)


@router.delete("/api/admin/threads/{id}", status_code=204)
def remove_thread(
    id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(active_moderator),
) -> None:
    """A moderator's removal of a thread: a soft delete that keeps its replies."""
    thread = _require_thread(db, id)
    thread.deleted = True
    record_audit(db, actor.id, "thread.remove", "thread", id, {})
    db.commit()
    return None
