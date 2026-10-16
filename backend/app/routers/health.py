"""Liveness/readiness of the API, including the database connection."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.errors import api_error
from shared.db import get_db

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    """Report the API and its database as reachable."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise api_error("db_unavailable", "The database is not reachable", 503) from exc
    return {"status": "ok", "db": "ok"}
