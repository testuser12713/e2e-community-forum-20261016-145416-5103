"""Handler of the ``notify`` job: fan out notifications for new forum content.

The worker skeleton provides the signature only — the notification job ticket
fills this file. Its contract: the payload is
``{"thread_id": int|None, "comment_id": int|None, "actor_id": int, "mentions": [str]}``
and the handler creates the notifications of the thread's subscribers, of the
authors being replied to and of the mentioned users.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def handle_notify(db: Session, payload: dict[str, Any]) -> None:
    """Create the notifications for the thread or comment named by ``payload``."""
