"""Thread request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from shared.schemas.common import UserBrief


class ThreadCreate(BaseModel):
    category_id: int
    title: str = Field(min_length=3, max_length=200)
    body_markdown: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list, max_length=5)


class ThreadUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    body_markdown: str | None = Field(default=None, min_length=1)
    tags: list[str] | None = Field(default=None, max_length=5)


class ThreadSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    category_slug: str
    category_name: str
    title: str
    tags: list[str]
    score: int
    comment_count: int
    hot_score: float
    pinned: bool
    locked: bool
    deleted: bool
    edited_at: datetime | None
    created_at: datetime
    author: UserBrief


class ThreadDetail(ThreadSummary):
    body_markdown: str
    body_html: str


class ThreadPin(BaseModel):
    pinned: bool


class ThreadLock(BaseModel):
    locked: bool


class ThreadMove(BaseModel):
    category_id: int
