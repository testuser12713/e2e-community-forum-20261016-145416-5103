"""Comment request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from shared.schemas.common import UserBrief


class CommentCreate(BaseModel):
    body_markdown: str = Field(min_length=1)
    parent_id: int | None = None


class CommentUpdate(BaseModel):
    body_markdown: str = Field(min_length=1)


class CommentSummary(BaseModel):
    """A comment as listed on a profile page."""

    id: int
    thread_id: int
    thread_title: str
    excerpt: str
    created_at: datetime


class CommentNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    parent_id: int | None
    depth: int
    body_markdown: str
    body_html: str
    score: int
    my_vote: int
    deleted: bool
    edited_at: datetime | None
    created_at: datetime
    author: UserBrief | None
    children: list[CommentNode] = []
