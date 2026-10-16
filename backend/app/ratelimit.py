"""Per-user write rate limiting.

`enforce_write_limit(action)` returns a FastAPI dependency the write endpoints
declare; this skeleton's dependency accepts every request. Ticket #36 replaces
the body with the per-user limiter that answers 429 plus ``Retry-After``.
"""

from __future__ import annotations

from fastapi import Depends
from fastapi.params import Depends as DependsParam


def enforce_write_limit(action: str) -> DependsParam:
    """Dependency factory guarding the writes of one action."""

    def _noop() -> None:
        return None

    return Depends(_noop)
