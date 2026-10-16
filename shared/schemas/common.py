"""Schemas shared across resources: pagination, the error envelope and leaf shapes."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class Page[T](BaseModel):
    """Every list endpoint answers this envelope."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class ErrorDetail(BaseModel):
    code: str
    message: str
    fields: dict[str, str] = {}


class ErrorOut(BaseModel):
    """The body of every API failure."""

    error: ErrorDetail


class UserBrief(BaseModel):
    """Identity of a user as embedded in threads, comments and notifications."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    karma: int
