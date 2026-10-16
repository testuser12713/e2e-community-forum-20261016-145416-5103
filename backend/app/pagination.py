"""Pagination helpers: every list endpoint answers total count and page count."""

from __future__ import annotations

import math
from typing import Any

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def normalize_page(page: int, page_size: int) -> tuple[int, int]:
    """Clamp page and page size into the contract's range."""
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), MAX_PAGE_SIZE))
    return page, page_size


def paginate(
    db: Session,
    stmt: Select[Any],
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Run a select paginated, returning the contract's list envelope.

    ``items`` holds the raw rows; the caller maps them onto its response schema.
    """
    page, page_size = normalize_page(page, page_size)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)).all()
    return {
        "items": list(rows),
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


def page_params(
    page: int = Query(1, ge=1, description="1-based page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
) -> tuple[int, int]:
    """Reusable query-parameter dependency: ``page`` and ``page_size``."""
    return normalize_page(page, page_size)
