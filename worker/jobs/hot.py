"""Handler of the ``recompute_hot`` job: refresh the threads' hot ranking.

The worker skeleton provides the signature only — the hot ranking job ticket
fills this file. Its contract: the payload is empty and the handler recomputes
``Thread.hot_score`` for every visible thread so that the listing's ``hot`` sort
serves the worker's order with time decay.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def handle_recompute_hot(db: Session, payload: dict[str, Any]) -> None:
    """Recompute the hot score of the threads touched since the last run."""
