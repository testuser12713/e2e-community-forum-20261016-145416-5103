"""Tests of the subscription endpoints and the notification read API.

They cover the subscription round-trip (both writes idempotent), the unread
counter falling from n to zero when notifications are marked read, the
pagination envelope, the actor name mapping and the contract's error shapes.
No notification is created through the API — the worker's job owns that — so
the tests provision notification rows directly.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import Category, Notification, Thread, User


def _make_user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
    )
    db.add(user)
    db.flush()
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _notify(
    db: Session,
    user: User,
    *,
    kind: str = "reply",
    actor: User | None = None,
    read: bool = False,
) -> Notification:
    notification = Notification(
        user_id=user.id,
        kind=kind,
        actor_id=actor.id if actor is not None else None,
        read_at=datetime.now(UTC) if read else None,
    )
    db.add(notification)
    db.flush()
    return notification


@pytest.fixture()
def forum(db_session: Session) -> dict[str, object]:
    """A reader (the caller), another user and one thread they can subscribe to."""
    reader = _make_user(db_session, "reader")
    other = _make_user(db_session, "other")
    category = Category(name="General", slug="general")
    db_session.add(category)
    db_session.flush()
    thread = Thread(
        category_id=category.id,
        author_id=other.id,
        title="A thread to follow",
        body_markdown="body",
    )
    db_session.add(thread)
    db_session.commit()
    return {"reader": reader, "other": other, "category": category, "thread": thread}


def test_subscription_round_trip_is_idempotent(
    client: TestClient, forum: dict[str, object]
) -> None:
    thread = forum["thread"]
    reader = forum["reader"]
    assert isinstance(thread, Thread) and isinstance(reader, User)
    url = f"/api/threads/{thread.id}/subscription"
    headers = _auth(reader)

    response = client.get(url, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"subscribed": False}

    assert client.post(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).json() == {"subscribed": True}

    # Subscribing again keeps exactly one row and still answers 204.
    assert client.post(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).json() == {"subscribed": True}

    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).json() == {"subscribed": False}

    # Unsubscribing a thread that was never subscribed (again) is a no-op.
    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).json() == {"subscribed": False}


def test_subscription_is_per_user(client: TestClient, forum: dict[str, object]) -> None:
    thread = forum["thread"]
    reader = forum["reader"]
    other = forum["other"]
    assert isinstance(thread, Thread) and isinstance(reader, User) and isinstance(other, User)
    url = f"/api/threads/{thread.id}/subscription"

    assert client.post(url, headers=_auth(reader)).status_code == 204
    assert client.get(url, headers=_auth(reader)).json() == {"subscribed": True}
    assert client.get(url, headers=_auth(other)).json() == {"subscribed": False}


def test_unknown_thread_is_a_404_in_the_error_envelope(
    client: TestClient, forum: dict[str, object]
) -> None:
    reader = forum["reader"]
    assert isinstance(reader, User)
    headers = _auth(reader)

    response = client.get("/api/threads/999999/subscription", headers=headers)
    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "not_found"
    assert body["error"]["message"]

    assert client.post("/api/threads/999999/subscription", headers=headers).status_code == 404
    assert client.delete("/api/threads/999999/subscription", headers=headers).status_code == 404


def test_subscription_endpoints_require_authentication(
    client: TestClient, forum: dict[str, object]
) -> None:
    thread = forum["thread"]
    assert isinstance(thread, Thread)
    url = f"/api/threads/{thread.id}/subscription"
    assert client.get(url).status_code == 401
    assert client.post(url).status_code == 401
    assert client.delete(url).status_code == 401


def test_unread_count_falls_to_zero_when_marked_read(
    client: TestClient, forum: dict[str, object], db_session: Session
) -> None:
    reader = forum["reader"]
    actor = forum["other"]
    assert isinstance(reader, User) and isinstance(actor, User)
    headers = _auth(reader)

    for _ in range(3):
        _notify(db_session, reader, actor=actor)
    _notify(db_session, reader, read=True)
    db_session.commit()

    assert client.get("/api/notifications/unread-count", headers=headers).json() == {"count": 3}

    response = client.post("/api/notifications/read", json={}, headers=headers)
    assert response.status_code == 204
    assert client.get("/api/notifications/unread-count", headers=headers).json() == {"count": 0}

    listing = client.get("/api/notifications", headers=headers).json()
    assert listing["total"] == 4
    assert all(item["read_at"] is not None for item in listing["items"])


def test_notifications_list_shows_actor_and_unread_filter(
    client: TestClient, forum: dict[str, object], db_session: Session
) -> None:
    reader = forum["reader"]
    actor = forum["other"]
    assert isinstance(reader, User) and isinstance(actor, User)
    headers = _auth(reader)

    _notify(db_session, reader, actor=actor)
    _notify(db_session, reader, read=True)
    db_session.commit()

    body = client.get("/api/notifications", headers=headers).json()
    assert body["total"] == 2
    actor_usernames = {item["actor_username"] for item in body["items"]}
    assert actor_usernames == {actor.username, None}

    unread = client.get("/api/notifications?unread_only=true", headers=headers).json()
    assert unread["total"] == 1
    assert unread["items"][0]["read_at"] is None


def test_mark_read_by_ids_only_touches_the_listed_ones(
    client: TestClient, forum: dict[str, object], db_session: Session
) -> None:
    reader = forum["reader"]
    actor = forum["other"]
    assert isinstance(reader, User) and isinstance(actor, User)
    headers = _auth(reader)

    first = _notify(db_session, reader, actor=actor)
    _notify(db_session, reader, actor=actor)
    db_session.commit()
    first_id = first.id

    assert (
        client.post(
            "/api/notifications/read", json={"ids": [first_id]}, headers=headers
        ).status_code
        == 204
    )
    assert client.get("/api/notifications/unread-count", headers=headers).json() == {"count": 1}


def test_notifications_are_private_to_the_caller(
    client: TestClient, forum: dict[str, object], db_session: Session
) -> None:
    reader = forum["reader"]
    other = forum["other"]
    assert isinstance(reader, User) and isinstance(other, User)

    _notify(db_session, other)
    db_session.commit()

    headers = _auth(reader)
    assert client.get("/api/notifications", headers=headers).json()["total"] == 0
    assert client.get("/api/notifications/unread-count", headers=headers).json() == {"count": 0}


def test_notifications_are_paginated_with_totals(
    client: TestClient, forum: dict[str, object], db_session: Session
) -> None:
    reader = forum["reader"]
    actor = forum["other"]
    assert isinstance(reader, User) and isinstance(actor, User)

    for _ in range(25):
        _notify(db_session, reader, actor=actor)
    db_session.commit()

    body = client.get("/api/notifications?page=2&page_size=10", headers=_auth(reader)).json()
    assert body["total"] == 25
    assert body["page"] == 2
    assert body["page_size"] == 10
    assert body["pages"] == 3
    assert len(body["items"]) == 10

    empty_last = client.get("/api/notifications?page=3&page_size=10", headers=_auth(reader)).json()
    assert empty_last["pages"] == 3
    assert len(empty_last["items"]) == 5


def test_notification_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/api/notifications").status_code == 401
    assert client.get("/api/notifications/unread-count").status_code == 401
    assert client.post("/api/notifications/read", json={}).status_code == 401


def test_invalid_body_answers_422_in_the_contract_shape(
    client: TestClient, forum: dict[str, object]
) -> None:
    reader = forum["reader"]
    assert isinstance(reader, User)

    response = client.post(
        "/api/notifications/read", json={"ids": "not-a-list"}, headers=_auth(reader)
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["fields"]


def test_out_of_range_page_size_is_a_422(client: TestClient, forum: dict[str, object]) -> None:
    reader = forum["reader"]
    assert isinstance(reader, User)

    response = client.get("/api/notifications?page_size=1000", headers=_auth(reader))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
