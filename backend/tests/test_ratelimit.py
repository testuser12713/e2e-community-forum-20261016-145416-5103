"""Tests of the per-user write rate limiter.

The behaviour under test: a user's writes are counted per action in the
``rate_limits`` table, the write over the limit answers 429 with the contract's
error envelope and a ``Retry-After`` header, and once the window has passed the
next write succeeds again.
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import create_access_token, hash_password
from shared.models import Category, Comment, RateLimit, Thread, User


def _make_user(db: Session, username: str, role: str = "user") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Demo1234!"),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _make_thread(db: Session, author: User) -> Thread:
    category = Category(name="General", slug="general", description="", position=0)
    db.add(category)
    db.commit()
    db.refresh(category)
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="A perfectly ordinary thread",
        body_markdown="Some body text.",
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _make_comment(db: Session, author: User, thread: Thread, body: str) -> Comment:
    comment = Comment(thread_id=thread.id, author_id=author.id, body_markdown=body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def _report(client: TestClient, reporter: User, comment: Comment) -> object:
    return client.post(
        "/api/reports",
        json={
            "content_type": "comment",
            "content_id": comment.id,
            "reason": "Spam",
            "note": "looks like spam",
        },
        headers=_auth(reporter),
    )


def test_write_over_the_limit_answers_429_with_retry_after(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    monkeypatch.setenv("RATE_LIMIT_MAX_WRITES", "3")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")

    author = _make_user(db_session, "rl_author")
    reporter = _make_user(db_session, "rl_reporter")
    thread = _make_thread(db_session, author)
    comments = [
        _make_comment(db_session, author, thread, f"reported body {index}") for index in range(4)
    ]

    for comment in comments[:3]:
        assert _report(client, reporter, comment).status_code == 201

    blocked = _report(client, reporter, comments[3])
    assert blocked.status_code == 429
    retry_after = blocked.headers.get("Retry-After")
    assert retry_after is not None
    assert int(retry_after) >= 1
    assert int(retry_after) <= 60

    body = blocked.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "rate_limited"
    assert body["error"]["message"]
    assert body["error"]["fields"] == {}

    # the blocked attempt did not create a report, and the counter holds the limit
    counter = db_session.scalars(
        select(RateLimit).where(
            RateLimit.user_id == reporter.id, RateLimit.action == "report_create"
        )
    ).one()
    assert counter.count == 3


def test_window_frees_up_after_waiting(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    monkeypatch.setenv("RATE_LIMIT_MAX_WRITES", "1")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "1")

    author = _make_user(db_session, "rl_window_author")
    reporter = _make_user(db_session, "rl_window_reporter")
    thread = _make_thread(db_session, author)
    first_comment = _make_comment(db_session, author, thread, "first body")
    second_comment = _make_comment(db_session, author, thread, "second body")

    assert _report(client, reporter, first_comment).status_code == 201
    assert _report(client, reporter, second_comment).status_code == 429

    time.sleep(1.2)

    recovered = _report(client, reporter, second_comment)
    assert recovered.status_code == 201
    assert recovered.json()["content_id"] == second_comment.id


def test_counters_are_kept_per_action(client: TestClient, db_session: Session, monkeypatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_MAX_WRITES", "1")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")

    author = _make_user(db_session, "rl_actions_author")
    reporter = _make_user(db_session, "rl_actions_reporter")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread, "reported body")

    assert _report(client, reporter, comment).status_code == 201
    assert _report(client, reporter, comment).status_code == 429

    # an action at its limit does not block a different action of the same user
    posted = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "A first comment"},
        headers=_auth(reporter),
    )
    assert posted.status_code == 201

    actions = sorted(
        db_session.scalars(select(RateLimit.action).where(RateLimit.user_id == reporter.id)).all()
    )
    assert actions == ["comment_create", "report_create"]


def test_thread_creation_route_uses_the_limiter(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    monkeypatch.setenv("RATE_LIMIT_MAX_WRITES", "1")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")

    user = _make_user(db_session, "rl_thread_user")
    category = Category(name="General", slug="general", description="", position=0)
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    payload = {
        "category_id": category.id,
        "title": "A perfectly ordinary title",
        "body_markdown": "A body",
        "tags": [],
    }

    # The first write passes the limiter (the route itself is still a stub here),
    # the second is refused before the route body ever runs.
    first = client.post("/api/threads", json=payload, headers=_auth(user))
    assert first.status_code != 429

    second = client.post("/api/threads", json=payload, headers=_auth(user))
    assert second.status_code == 429
    assert int(second.headers["Retry-After"]) >= 1
    assert second.json()["error"]["code"] == "rate_limited"
