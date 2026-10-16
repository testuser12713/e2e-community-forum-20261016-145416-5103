"""Tests of the moderation tools (#25): bans, ban expiry, the read-only banned
user and the four thread moderation actions — plus the audit trail they leave.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import AuditLog, Ban, Category, Thread, User


def _make_user(db: Session, username: str, role: str = "user") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _make_category(db: Session, name: str, slug: str, position: int = 0) -> Category:
    category = Category(name=name, slug=slug, description=None, position=position)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _make_thread(db: Session, category: Category, author: User, title: str) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="The body of the thread.",
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def test_moderator_bans_a_user_with_reason_and_expiry(
    client: TestClient, db_session: Session
) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    target = _make_user(db_session, "victim")
    expires = datetime.now(UTC) + timedelta(days=7)

    response = client.post(
        f"/api/admin/users/{target.id}/ban",
        json={"reason": "spam", "expires_at": expires.isoformat()},
        headers=_auth(moderator),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == target.id
    assert body["username"] == "victim"
    assert body["is_banned"] is True
    assert body["ban_reason"] == "spam"
    assert body["banned_until"] is not None


def test_permanent_ban_has_no_expiry(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    target = _make_user(db_session, "victim")

    body = client.post(
        f"/api/admin/users/{target.id}/ban",
        json={"reason": "permanent"},
        headers=_auth(moderator),
    ).json()

    assert body["is_banned"] is True
    assert body["banned_until"] is None
    assert body["ban_reason"] == "permanent"


def test_a_banned_user_reads_but_cannot_write(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "A thread")
    banned = _make_user(db_session, "banned")
    client.post(
        f"/api/admin/users/{banned.id}/ban",
        json={"reason": "abuse"},
        headers=_auth(moderator),
    )

    read = client.get(f"/api/threads/{thread.id}/comments", headers=_auth(banned))
    assert read.status_code == 200

    write = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "I cannot post"},
        headers=_auth(banned),
    )
    assert write.status_code == 403
    assert write.json()["error"]["code"] == "banned"


def test_an_expired_ban_counts_as_lifted_automatically(
    client: TestClient, db_session: Session
) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "A thread")
    target = _make_user(db_session, "freed")
    expired = datetime.now(UTC) - timedelta(minutes=1)

    body = client.post(
        f"/api/admin/users/{target.id}/ban",
        json={"reason": "old", "expires_at": expired.isoformat()},
        headers=_auth(moderator),
    ).json()
    assert body["is_banned"] is False
    assert body["ban_reason"] is None

    write = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "Writing works again"},
        headers=_auth(target),
    )
    assert write.status_code == 201


def test_unban_lifts_the_ban_and_lets_the_user_write(
    client: TestClient, db_session: Session
) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "A thread")
    target = _make_user(db_session, "released")
    client.post(
        f"/api/admin/users/{target.id}/ban",
        json={"reason": "abuse"},
        headers=_auth(moderator),
    )

    body = client.delete(f"/api/admin/users/{target.id}/ban", headers=_auth(moderator)).json()
    assert body["is_banned"] is False

    write = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "Back again"},
        headers=_auth(target),
    )
    assert write.status_code == 201


def test_banning_an_unknown_user_answers_404(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")

    response = client.post(
        "/api/admin/users/9999/ban",
        json={"reason": "nope"},
        headers=_auth(moderator),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_pin_puts_the_thread_on_top_of_its_category(
    client: TestClient, db_session: Session
) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "Pin me")

    response = client.post(
        f"/api/admin/threads/{thread.id}/pin", json={"pinned": True}, headers=_auth(moderator)
    )

    assert response.status_code == 200
    assert response.json()["pinned"] is True
    db_session.refresh(thread)
    assert thread.pinned is True

    unpin = client.post(
        f"/api/admin/threads/{thread.id}/pin", json={"pinned": False}, headers=_auth(moderator)
    )
    assert unpin.json()["pinned"] is False


def test_lock_blocks_new_comments(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "Lock me")
    user = _make_user(db_session, "writer")

    response = client.post(
        f"/api/admin/threads/{thread.id}/lock", json={"locked": True}, headers=_auth(moderator)
    )
    assert response.status_code == 200
    assert response.json()["locked"] is True

    blocked = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "Not allowed"},
        headers=_auth(user),
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "locked"


def test_move_sends_the_thread_to_another_category(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    source = _make_category(db_session, "Source", "source")
    target = _make_category(db_session, "Target", "target", position=1)
    thread = _make_thread(db_session, source, moderator, "Move me")

    response = client.post(
        f"/api/admin/threads/{thread.id}/move",
        json={"category_id": target.id},
        headers=_auth(moderator),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["category_id"] == target.id
    assert body["category_slug"] == "target"
    db_session.refresh(thread)
    assert thread.category_id == target.id


def test_move_to_an_unknown_category_answers_404(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "A thread")

    response = client.post(
        f"/api/admin/threads/{thread.id}/move",
        json={"category_id": 9999},
        headers=_auth(moderator),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_remove_is_a_soft_delete(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "Remove me")

    response = client.delete(f"/api/admin/threads/{thread.id}", headers=_auth(moderator))
    assert response.status_code == 204

    db_session.refresh(thread)
    assert thread.deleted is True

    again = client.delete(f"/api/admin/threads/{thread.id}", headers=_auth(moderator))
    assert again.status_code == 404


def test_moderation_actions_are_recorded_in_the_audit_log(
    client: TestClient, db_session: Session
) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    target = _make_user(db_session, "victim")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "A thread")

    client.post(
        f"/api/admin/users/{target.id}/ban", json={"reason": "spam"}, headers=_auth(moderator)
    )
    client.post(
        f"/api/admin/threads/{thread.id}/pin", json={"pinned": True}, headers=_auth(moderator)
    )
    client.post(
        f"/api/admin/threads/{thread.id}/lock", json={"locked": True}, headers=_auth(moderator)
    )
    client.delete(f"/api/admin/threads/{thread.id}", headers=_auth(moderator))

    entries = {entry.action: entry for entry in db_session.scalars(select(AuditLog)).all()}
    assert {"user.ban", "thread.pin", "thread.lock", "thread.remove"} <= set(entries)
    assert entries["user.ban"].actor_id == moderator.id
    assert entries["user.ban"].target_type == "user"
    assert entries["user.ban"].target_id == target.id
    assert entries["thread.pin"].target_type == "thread"
    assert entries["thread.pin"].target_id == thread.id


def test_ban_only_blocks_writing_not_reading(client: TestClient, db_session: Session) -> None:
    """A ban row created directly (outside the API) is honoured on read, too."""
    author = _make_user(db_session, "author")
    category = _make_category(db_session, "General", "general")
    _make_thread(db_session, category, author, "Readable")
    banned = _make_user(db_session, "banned")
    db_session.add(Ban(user_id=banned.id, reason="direct"))
    db_session.commit()

    read = client.get("/api/categories", headers=_auth(banned))
    assert read.status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/api/admin/users/1/ban", {"reason": "x"}),
        ("DELETE", "/api/admin/users/1/ban", None),
        ("POST", "/api/admin/threads/1/pin", {"pinned": True}),
        ("POST", "/api/admin/threads/1/lock", {"locked": True}),
        ("POST", "/api/admin/threads/1/move", {"category_id": 1}),
        ("DELETE", "/api/admin/threads/1", None),
    ],
)
def test_a_plain_user_is_forbidden_on_every_moderation_action(
    client: TestClient, db_session: Session, method: str, path: str, body: dict | None
) -> None:
    user = _make_user(db_session, "plain")

    response = client.request(method, path, json=body, headers=_auth(user))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_a_banned_moderator_cannot_moderate(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, moderator, "A thread")
    db_session.add(Ban(user_id=moderator.id, reason="misconduct"))
    db_session.commit()

    response = client.post(
        f"/api/admin/threads/{thread.id}/pin", json={"pinned": True}, headers=_auth(moderator)
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "banned"


def test_moderation_actions_require_authentication(client: TestClient) -> None:
    response = client.post("/api/admin/users/1/ban", json={"reason": "x"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"
