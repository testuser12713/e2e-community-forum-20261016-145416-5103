"""The admin dashboard's statistics and the audit log.

Every route here is guarded by ``require_role("moderator", "admin")``. The
dashboard counts users, threads and comments created today and over the last
seven days plus the current open reports; the audit log lists the moderation and
administration actions that ``app.services.audit`` records, newest first.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.pagination import paginate
from app.security import require_role
from shared.db import get_db
from shared.models import AuditLog, Comment, Report, Thread, User
from shared.schemas.admin import AdminStats, AuditEntry
from shared.schemas.common import Page

router = APIRouter(tags=["admin"])

moderator_only = [Depends(require_role("moderator", "admin"))]


def _count_since(
    db: Session, model: type[User] | type[Thread] | type[Comment], since: datetime
) -> int:
    """Rows of ``model`` created at or after ``since``."""
    return db.scalar(select(func.count()).select_from(model).where(model.created_at >= since)) or 0


def _audit_entry(entry: AuditLog) -> AuditEntry:
    """Map an audit row onto ``AuditEntry``, resolving the actor's username."""
    return AuditEntry(
        id=entry.id,
        actor_username=entry.actor.username if entry.actor is not None else None,
        action=entry.action,
        target_type=entry.target_type,
        target_id=entry.target_id,
        details=entry.details or "",
        created_at=entry.created_at,
    )


@router.get("/api/admin/stats", response_model=AdminStats, dependencies=moderator_only)
def admin_stats(db: Session = Depends(get_db)) -> AdminStats:
    """Counts for the dashboard: today, the last seven days and open reports."""
    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    open_reports = (
        db.scalar(select(func.count()).select_from(Report).where(Report.status == "open")) or 0
    )
    return AdminStats(
        users_today=_count_since(db, User, day_start),
        users_7d=_count_since(db, User, week_start),
        threads_today=_count_since(db, Thread, day_start),
        threads_7d=_count_since(db, Thread, week_start),
        comments_today=_count_since(db, Comment, day_start),
        comments_7d=_count_since(db, Comment, week_start),
        open_reports=open_reports,
    )


@router.get("/api/admin/audit-log", response_model=Page[AuditEntry], dependencies=moderator_only)
def audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AuditEntry]:
    """The audit log, newest first, paginated."""
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.actor))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    )
    result = paginate(db, stmt, page, page_size)
    result["items"] = [_audit_entry(entry) for entry in result["items"]]
    return Page[AuditEntry](**result)
