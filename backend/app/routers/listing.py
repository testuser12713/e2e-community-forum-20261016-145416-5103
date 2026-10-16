"""The paginated thread listings with the new/top/hot sort orders."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.errors import not_implemented
from shared.schemas.common import Page
from shared.schemas.threads import ThreadSummary

router = APIRouter(tags=["threads"])


@router.get("/api/threads", response_model=Page[ThreadSummary])
def list_threads(
    category: str | None = Query(None, description="category slug"),
    sort: str = Query("new", pattern="^(new|top|hot)$"),
    tag: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[ThreadSummary]:
    raise not_implemented("the thread listing (#18)")
