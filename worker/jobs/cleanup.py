"""Handler of the ``cleanup_sessions`` job: drop expired and revoked refresh tokens.

The worker skeleton provides the signature only — this ticket fills the file. Its
contract: the payload is empty and the handler deletes every refresh-token row
that is expired or revoked, in bounded batches so a long cleanup never holds a
lock for long. It removes sessions only: user accounts and content are never
touched.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, delete, or_, select
from sqlalchemy.orm import Session

from shared.config import get_settings
from shared.models import RefreshToken

logger = logging.getLogger(__name__)

#: How many token rows one batch removes before the lock is released. Small
#: enough that a large backlog never holds a row lock for long.
BATCH_SIZE = 500


def _cleanup_condition(now: datetime, max_age: timedelta) -> ColumnElement[bool]:
    """The rows that may go: revoked, past their expiry, or older than the max TTL.

    The ``created_at`` clause is a safety net for a row whose ``expires_at`` was
    stored inconsistently: a refresh token can never legitimately outlive the
    configured TTL measured from its creation.
    """
    return or_(
        RefreshToken.revoked_at.is_not(None),
        RefreshToken.expires_at <= now,
        RefreshToken.created_at <= now - max_age,
    )


def _delete_batch(db: Session, condition: ColumnElement[bool], batch_size: int) -> int:
    """Delete at most ``batch_size`` matching rows, returning how many went."""
    ids = (
        db.execute(
            select(RefreshToken.id).where(condition).order_by(RefreshToken.id).limit(batch_size)
        )
        .scalars()
        .all()
    )
    if not ids:
        return 0
    result = db.execute(
        delete(RefreshToken)
        .where(RefreshToken.id.in_(ids))
        .execution_options(synchronize_session=False)
    )
    return int(result.rowcount or 0)


def handle_cleanup_sessions(db: Session, payload: dict[str, Any]) -> None:
    """Delete the expired and revoked refresh tokens in bounded batches.

    Commits after every batch so a long cleanup releases its locks as it goes;
    the outer worker transaction then commits the (already empty) remainder.
    """
    settings = get_settings()
    now = datetime.now(UTC)
    max_age = timedelta(days=settings.refresh_token_ttl_days)
    condition = _cleanup_condition(now, max_age)

    removed = 0
    while True:
        deleted = _delete_batch(db, condition, BATCH_SIZE)
        removed += deleted
        db.commit()
        if deleted < BATCH_SIZE:
            break
    logger.info("cleanup_sessions removed %d expired or revoked refresh token(s)", removed)
