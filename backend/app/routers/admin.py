"""The admin dashboard's statistics and the audit log."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.errors import not_implemented
from app.security import require_role
from shared.db import get_db
from shared.schemas.admin import AdminStats, AuditEntry
from shared.schemas.common import Page

router = APIRouter(tags=["admin"])

moderator_only = [Depends(require_role("moderator", "admin"))]


@router.get("/api/admin/stats", response_model=AdminStats, dependencies=moderator_only)
def admin_stats(db: Session = Depends(get_db)) -> AdminStats:
    raise not_implemented("the admin statistics (#21)")


@router.get("/api/admin/audit-log", response_model=Page[AuditEntry], dependencies=moderator_only)
def audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AuditEntry]:
    raise not_implemented("the audit log (#21)")
