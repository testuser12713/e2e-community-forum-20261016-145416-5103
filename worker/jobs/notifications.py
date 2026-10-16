"""Handler of the ``notify`` job: fan out notifications for new forum content.

The API enqueues one ``notify`` job per created comment (and per created thread)
through ``shared.jobs.enqueue_job``. The payload is
``{"thread_id": int|None, "comment_id": int|None, "actor_id": int, "mentions": [str]}``
and this handler — the product's ONLY producer of notifications — turns it into
``Notification`` rows:

* a reply notifies the author being replied to: the parent comment's author for a
  nested reply, the thread's author for a top-level comment;
* every user subscribed to the thread is notified about the new comment;
* every user named by an ``@``-mention is notified — a mention of a name that does
  not exist creates nothing;
* nobody is notified about their own action, and a user never receives more than
  one notification per comment (the most specific reason wins: reply, then
  mention, then subscription).

The handler is idempotent: should the worker retry a job whose notifications were
already written, the existing rows are left untouched instead of duplicated.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import Comment, Notification, Subscription, Thread, User

#: The kinds written by this job, most specific first. The order also decides
#: which reason a recipient sees when several apply to the same comment.
KIND_REPLY = "reply"
KIND_MENTION = "mention"
KIND_SUBSCRIPTION = "subscription"


def _add_recipient(
    recipients: dict[int, str], user_id: int | None, kind: str, actor_id: int
) -> None:
    """Register ``user_id`` for ``kind`` unless it is the actor or already listed."""
    if user_id is None or user_id == actor_id:
        return
    recipients.setdefault(user_id, kind)


def _resolve_mentions(db: Session, mentions: list[str], actor_id: int) -> list[int]:
    """The ids of the existing users named by ``mentions``, in mention order.

    A name that matches no user is silently ignored, and a user is returned at
    most once. The actor's own name is dropped by the caller through
    ``_add_recipient``.
    """
    names = [name for name in mentions if name]
    if not names:
        return []
    rows = db.scalars(select(User).where(User.username.in_(names))).all()
    by_name = {user.username: user.id for user in rows}
    seen: list[int] = []
    for name in names:
        user_id = by_name.get(name)
        if user_id is not None and user_id not in seen and user_id != actor_id:
            seen.append(user_id)
    return seen


def _already_notified(
    db: Session, thread_id: int | None, comment_id: int | None, actor_id: int
) -> set[int]:
    """The user ids already notified about this exact event (retry safety)."""
    stmt = select(Notification.user_id).where(Notification.actor_id == actor_id)
    if comment_id is not None:
        stmt = stmt.where(Notification.comment_id == comment_id)
    else:
        stmt = stmt.where(Notification.comment_id.is_(None), Notification.thread_id == thread_id)
    return set(db.scalars(stmt).all())


def handle_notify(db: Session, payload: dict[str, Any]) -> None:
    """Create the notifications for the thread or comment named by ``payload``."""
    actor_id = payload.get("actor_id")
    if actor_id is None:
        return

    comment_id = payload.get("comment_id")
    comment = db.get(Comment, comment_id) if comment_id is not None else None

    thread_id = payload.get("thread_id")
    if thread_id is None and comment is not None:
        thread_id = comment.thread_id
    thread = db.get(Thread, thread_id) if thread_id is not None else None

    recipients: dict[int, str] = {}

    # A reply notifies the author being replied to: the parent comment's author,
    # or the thread's author for a top-level comment.
    if comment is not None:
        if comment.parent_id is not None:
            parent = db.get(Comment, comment.parent_id)
            if parent is not None:
                _add_recipient(recipients, parent.author_id, KIND_REPLY, actor_id)
        elif thread is not None:
            _add_recipient(recipients, thread.author_id, KIND_REPLY, actor_id)

    for mentioned_id in _resolve_mentions(db, list(payload.get("mentions") or []), actor_id):
        _add_recipient(recipients, mentioned_id, KIND_MENTION, actor_id)

    if comment is not None and thread_id is not None:
        subscriber_ids = db.scalars(
            select(Subscription.user_id).where(Subscription.thread_id == thread_id)
        ).all()
        for subscriber_id in subscriber_ids:
            _add_recipient(recipients, subscriber_id, KIND_SUBSCRIPTION, actor_id)

    already = _already_notified(db, thread_id, comment_id, actor_id)
    for user_id, kind in recipients.items():
        if user_id in already:
            continue
        db.add(
            Notification(
                user_id=user_id,
                kind=kind,
                thread_id=thread_id,
                comment_id=comment_id,
                actor_id=actor_id,
            )
        )
    db.flush()
