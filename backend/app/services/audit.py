"""The audit log every moderation and administration action is written to."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from shared.models import AuditLog


def record_audit(
    db: Session,
    actor_id: int | None,
    action: str,
    target_type: str,
    target_id: int | None,
    details: dict[str, Any] | None = None,
) -> None:
    """Append an audit entry inside the caller's transaction (flushed, not committed)."""
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.dumps(details or {}, default=str),
        )
    )
    db.flush()
