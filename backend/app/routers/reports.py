"""Reports on threads and comments, and the moderation queue."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.errors import not_implemented
from app.ratelimit import enforce_write_limit
from app.routers.moderation import require_active_user
from app.security import require_role
from shared.db import get_db
from shared.schemas.common import Page
from shared.schemas.reports import ReportCreate, ReportOut, ReportResolve

router = APIRouter(tags=["reports"])

moderator_only = [Depends(require_role("moderator", "admin"))]


@router.post("/api/reports", response_model=ReportOut, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    _user: object = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("report_create"),
) -> ReportOut:
    raise not_implemented("reporting (#20)")


@router.get("/api/admin/reports", response_model=Page[ReportOut], dependencies=moderator_only)
def list_reports(
    status: str = Query("open", pattern="^(open|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[ReportOut]:
    raise not_implemented("the moderation queue (#20)")


@router.post(
    "/api/admin/reports/{id}/resolve", response_model=ReportOut, dependencies=moderator_only
)
def resolve_report(id: int, payload: ReportResolve, db: Session = Depends(get_db)) -> ReportOut:
    raise not_implemented("resolving reports (#20)")
