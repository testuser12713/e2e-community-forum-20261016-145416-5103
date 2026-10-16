"""The product's job queue: kinds the worker understands and the enqueue helper."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from shared.models import Job

JOB_KINDS = ("notify", "recompute_hot", "cleanup_sessions")


def enqueue_job(db: Session, kind: str, payload: dict[str, Any]) -> None:
    """Append a job to the queue inside the caller's transaction.

    The row is flushed, not committed: it becomes visible to the worker when the
    caller commits the change that made the job necessary, so a rolled-back
    request never leaves an orphan job behind.
    """
    if kind not in JOB_KINDS:
        raise ValueError(f"unknown job kind {kind!r}; expected one of {JOB_KINDS}")
    db.add(Job(kind=kind, payload=payload or {}))
    db.flush()
