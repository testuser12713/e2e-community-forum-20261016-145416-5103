"""Report request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportAction = Literal["remove_content", "dismiss"]


class ReportCreate(BaseModel):
    content_type: Literal["thread", "comment"]
    content_id: int
    reason: str = Field(min_length=1, max_length=64)
    note: str | None = None


class ReportResolve(BaseModel):
    action: ReportAction


class ReportOut(BaseModel):
    id: int
    content_type: str
    content_id: int
    reason: str
    note: str | None
    status: str
    created_at: datetime
    reporter_username: str
    content_excerpt: str
    content_url: str
