"""Reports on threads and comments, and the moderation queue."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.pagination import paginate
from app.ratelimit import enforce_write_limit
from app.routers.moderation import require_active_user
from app.security import require_role
from app.services.audit import record_audit
from shared.db import get_db
from shared.models import Comment, Report, Thread, User
from shared.schemas.common import Page
from shared.schemas.reports import ReportCreate, ReportOut, ReportResolve

router = APIRouter(tags=["reports"])

moderator_only = [Depends(require_role("moderator", "admin"))]

# The reasons the forum offers in its report dialog (see the design's
# ``thread-detail.html``; the admin queue renders them verbatim).
REPORT_REASONS = (
    "Spam",
    "Belästigung",
    "Hassrede",
    "Falsche Kategorie",
    "Sonstiges",
)


def _excerpt(text: str | None, limit: int = 200) -> str:
    """A single-line, truncated preview of reported content."""
    collapsed = " ".join((text or "").split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def _report_out(db: Session, report: Report) -> ReportOut:
    """Build the API shape of a report, resolving the reported content."""
    excerpt = ""
    if report.content_type == "thread":
        thread = db.get(Thread, report.content_id)
        if thread is not None:
            excerpt = _excerpt(thread.title)
        content_url = f"/threads/{report.content_id}"
    else:
        comment = db.get(Comment, report.content_id)
        if comment is not None:
            excerpt = _excerpt(comment.body_markdown)
            content_url = f"/threads/{comment.thread_id}#comment-{comment.id}"
        else:
            content_url = f"/comments/{report.content_id}"
    return ReportOut(
        id=report.id,
        content_type=report.content_type,
        content_id=report.content_id,
        reason=report.reason,
        note=report.note,
        status=report.status,
        created_at=report.created_at,
        reporter_username=report.reporter.username if report.reporter else "",
        content_excerpt=excerpt,
        content_url=content_url,
    )


def _reported_author_id(db: Session, content_type: str, content_id: int) -> int | None:
    """The author of the reported content, or None when it does not exist."""
    if content_type == "thread":
        thread = db.get(Thread, content_id)
        return None if thread is None or thread.deleted else thread.author_id
    comment = db.get(Comment, content_id)
    return None if comment is None or comment.deleted else comment.author_id


def _soft_delete_content(db: Session, report: Report) -> None:
    """Hide the reported content without removing its trail."""
    if report.content_type == "thread":
        thread = db.get(Thread, report.content_id)
        if thread is not None:
            thread.deleted = True
    else:
        comment = db.get(Comment, report.content_id)
        if comment is not None:
            comment.deleted = True


@router.post("/api/reports", response_model=ReportOut, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("report_create"),
) -> ReportOut:
    if payload.reason not in REPORT_REASONS:
        raise api_error(
            "validation_error",
            "Some fields are invalid",
            422,
            {"reason": "The reason is not one of the predefined report reasons"},
        )

    author_id = _reported_author_id(db, payload.content_type, payload.content_id)
    if author_id is None:
        raise api_error(
            "not_found",
            f"The reported {payload.content_type} does not exist",
            404,
        )
    if author_id == user.id:
        raise api_error("own_content", "You cannot report your own content", 403)

    existing = db.scalars(
        select(Report).where(
            Report.reporter_id == user.id,
            Report.content_type == payload.content_type,
            Report.content_id == payload.content_id,
        )
    ).first()
    if existing is not None:
        raise api_error("already_reported", "You have already reported this content", 409)

    report = Report(
        reporter_id=user.id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        reason=payload.reason,
        note=payload.note,
        status="open",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _report_out(db, report)


@router.get("/api/admin/reports", response_model=Page[ReportOut], dependencies=moderator_only)
def list_reports(
    status: str = Query("open", pattern="^(open|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[ReportOut]:
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc())
    if status == "open":
        stmt = stmt.where(Report.status == "open")

    result = paginate(db, stmt, page=page, page_size=page_size)
    return Page[ReportOut](
        items=[_report_out(db, report) for report in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.post("/api/admin/reports/{id}/resolve", response_model=ReportOut)
def resolve_report(
    id: int,
    payload: ReportResolve,
    db: Session = Depends(get_db),
    moderator: User = Depends(require_role("moderator", "admin")),
) -> ReportOut:
    report = db.get(Report, id)
    if report is None:
        raise api_error("not_found", "The report does not exist", 404)

    if payload.action == "remove_content":
        _soft_delete_content(db, report)
        report.status = "resolved"
        audit_action = "report.remove_content"
    else:
        report.status = "dismissed"
        audit_action = "report.dismiss"

    report.resolved_by_id = moderator.id
    report.resolved_at = datetime.now(UTC)
    record_audit(
        db,
        moderator.id,
        audit_action,
        "report",
        report.id,
        {
            "action": payload.action,
            "content_type": report.content_type,
            "content_id": report.content_id,
        },
    )
    db.commit()
    db.refresh(report)
    return _report_out(db, report)
