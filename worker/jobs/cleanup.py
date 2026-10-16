"""Handler of the ``cleanup_sessions`` job: drop expired sessions and tokens.

The worker skeleton provides the signature only — the cleanup job ticket fills
this file. Its contract: the payload is empty and the handler deletes expired
and revoked refresh tokens (and any other expired session state) so the store
does not grow without bound.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def handle_cleanup_sessions(db: Session, payload: dict[str, Any]) -> None:
    """Delete the expired and revoked refresh tokens."""
