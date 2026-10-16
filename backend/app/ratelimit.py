"""Per-user write rate limiting.

``enforce_write_limit(action)`` returns a FastAPI dependency the write endpoints
declare. It keeps a fixed-window counter per ``(user, action)`` in the
``rate_limits`` table: the first write of a window inserts the counter row,
every later write bumps its ``count`` under ``SELECT ... FOR UPDATE``. A write
over the limit answers the contract's 429 envelope and carries a ``Retry-After``
header naming the whole seconds until the window frees up again.

The window length and the number of allowed writes are read lazily from the
environment (``RATE_LIMIT_WINDOW_SECONDS`` and ``RATE_LIMIT_MAX_WRITES``) so a
deployment can tune them without a code change and tests can shrink them.
"""

from __future__ import annotations

import math
import os
from datetime import UTC, datetime, timedelta

from fastapi import Depends
from fastapi.params import Depends as DependsParam
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import api_error
from app.security import get_current_user
from shared.db import get_db
from shared.models import RateLimit, User

DEFAULT_WINDOW_SECONDS = 60
DEFAULT_MAX_WRITES = 10


def _env_int(name: str, default: int) -> int:
    """A positive integer from the environment, else the given default."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _window_seconds() -> int:
    return _env_int("RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS)


def _max_writes() -> int:
    return _env_int("RATE_LIMIT_MAX_WRITES", DEFAULT_MAX_WRITES)


def _current_window(db: Session, user_id: int, action: str) -> RateLimit | None:
    """The newest counter row for this user and action, locked for update."""
    return db.scalars(
        select(RateLimit)
        .where(RateLimit.user_id == user_id, RateLimit.action == action)
        .order_by(RateLimit.window_start.desc(), RateLimit.id.desc())
        .limit(1)
        .with_for_update()
    ).first()


def _consume(db: Session, user_id: int, action: str) -> None:
    """Count one write and raise the 429 envelope once the limit is exceeded."""
    for attempt in range(2):
        window_seconds = _window_seconds()
        max_writes = _max_writes()
        now = datetime.now(UTC)

        row = _current_window(db, user_id, action)
        if row is not None and now < row.window_start + timedelta(seconds=window_seconds):
            if row.count >= max_writes:
                retry_after = max(
                    1,
                    math.ceil(
                        (row.window_start + timedelta(seconds=window_seconds) - now).total_seconds()
                    ),
                )
                db.rollback()
                raise api_error(
                    "rate_limited",
                    "Too many writes in a short time — please wait before trying again",
                    429,
                    headers={"Retry-After": str(retry_after)},
                )
            row.count += 1
        else:
            db.add(RateLimit(user_id=user_id, action=action, window_start=now, count=1))

        try:
            db.commit()
            return
        except IntegrityError:
            # A concurrent first write created this window's row a moment before
            # us; roll back and re-evaluate against the row that won the race.
            db.rollback()
            if attempt == 1:
                raise


def enforce_write_limit(action: str) -> DependsParam:
    """Dependency factory guarding the writes of one action."""

    def dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> None:
        _consume(db, user.id, action)

    return Depends(dependency)
