"""Tests of the reports API and the moderation queue.

The behaviour under test: reporting foreign content puts it in the admin queue,
the 403s (own content, banned user) and the 409 (duplicate) hold, and both
resolutions close the report and drop it from the open queue.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.security import create_access_token, hash_password
from shared.models import Ban, Category, Comment, Report, Thread, User


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


def _make_comment(
    db: Session, author: User, thread: Thread, body: str = "Reported body"
) -> Comment:
    comment = Comment(thread_id=thread.id, author_id=author.id, body_markdown=body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def _report_comment(
    client: TestClient,
    reporter: User,
    comment: Comment,
    reason: str = "Spam",
) -> object:
    return client.post(
        "/api/reports",
        json={
            "content_type": "comment",
            "content_id": comment.id,
            "reason": reason,
            "note": "this looks like spam",
        },
        headers=_auth(reporter),
    )


def test_report_foreign_comment_appears_in_queue(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "author")
    reporter = _make_user(db_session, "reporter")
    moderator = _make_user(db_session, "moderator1", role="moderator")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread, "Buy cheap something here")

    response = _report_comment(client, reporter, comment)
    assert response.status_code == 201
    body = response.json()
    assert body["content_type"] == "comment"
    assert body["content_id"] == comment.id
    assert body["reason"] == "Spam"
    assert body["note"] == "this looks like spam"
    assert body["status"] == "open"
    assert body["reporter_username"] == "reporter"
    assert "Buy cheap something here" in body["content_excerpt"]
    assert body["content_url"] == f"/threads/{thread.id}#comment-{comment.id}"

    queue = client.get("/api/admin/reports", headers=_auth(moderator))
    assert queue.status_code == 200
    page = queue.json()
    assert page["total"] == 1
    assert page["page"] == 1
    assert page["page_size"] == 20
    assert page["pages"] == 1
    assert [item["id"] for item in page["items"]] == [body["id"]]


def test_report_own_thread_and_comment_are_forbidden(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "self_author")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)

    own_comment = _report_comment(client, author, comment)
    assert own_comment.status_code == 403
    assert own_comment.json()["error"]["code"] == "own_content"

    own_thread = client.post(
        "/api/reports",
        json={"content_type": "thread", "content_id": thread.id, "reason": "Spam"},
        headers=_auth(author),
    )
    assert own_thread.status_code == 403
    assert own_thread.json()["error"]["code"] == "own_content"


def test_banned_user_cannot_report(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "author_b")
    reporter = _make_user(db_session, "banned_reporter")
    db_session.add(
        Ban(user_id=reporter.id, reason="spam", expires_at=datetime.now(UTC) + timedelta(days=1))
    )
    db_session.commit()
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)

    response = _report_comment(client, reporter, comment)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "banned"


def test_duplicate_report_is_a_conflict(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "author_d")
    reporter = _make_user(db_session, "reporter_d")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)

    assert _report_comment(client, reporter, comment).status_code == 201
    duplicate = _report_comment(client, reporter, comment)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "already_reported"


def test_remove_content_hides_comment_and_clears_the_queue(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "author_r")
    reporter = _make_user(db_session, "reporter_r")
    moderator = _make_user(db_session, "moderator_r", role="moderator")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)

    report_id = _report_comment(client, reporter, comment).json()["id"]

    resolved = client.post(
        f"/api/admin/reports/{report_id}/resolve",
        json={"action": "remove_content"},
        headers=_auth(moderator),
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"

    db_session.expire_all()
    assert db_session.get(Comment, comment.id).deleted is True

    open_queue = client.get("/api/admin/reports", headers=_auth(moderator)).json()
    assert open_queue["total"] == 0

    all_queue = client.get("/api/admin/reports?status=all", headers=_auth(moderator)).json()
    assert all_queue["total"] == 1


def test_dismiss_keeps_content_and_clears_the_queue(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "author_x")
    reporter = _make_user(db_session, "reporter_x")
    moderator = _make_user(db_session, "moderator_x", role="moderator")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)

    report_id = _report_comment(client, reporter, comment).json()["id"]

    resolved = client.post(
        f"/api/admin/reports/{report_id}/resolve",
        json={"action": "dismiss"},
        headers=_auth(moderator),
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "dismissed"

    db_session.expire_all()
    assert db_session.get(Comment, comment.id).deleted is False

    open_queue = client.get("/api/admin/reports", headers=_auth(moderator)).json()
    assert open_queue["total"] == 0


def test_moderation_queue_requires_a_moderator_role(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "author_role")
    reporter = _make_user(db_session, "reporter_role")
    regular = _make_user(db_session, "regular_role")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)
    report_id = _report_comment(client, reporter, comment).json()["id"]

    assert client.get("/api/admin/reports", headers=_auth(regular)).status_code == 403
    assert (
        client.post(
            f"/api/admin/reports/{report_id}/resolve",
            json={"action": "dismiss"},
            headers=_auth(regular),
        ).status_code
        == 403
    )
    assert client.get("/api/admin/reports").status_code == 401


def test_report_validation_and_missing_content(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "author_v")
    reporter = _make_user(db_session, "reporter_v")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)

    invalid_type = client.post(
        "/api/reports",
        json={"content_type": "profile", "content_id": comment.id, "reason": "Spam"},
        headers=_auth(reporter),
    )
    assert invalid_type.status_code == 422
    assert invalid_type.json()["error"]["code"] == "validation_error"

    invalid_reason = client.post(
        "/api/reports",
        json={"content_type": "comment", "content_id": comment.id, "reason": "Because"},
        headers=_auth(reporter),
    )
    assert invalid_reason.status_code == 422
    assert "reason" in invalid_reason.json()["error"]["fields"]

    missing = client.post(
        "/api/reports",
        json={"content_type": "comment", "content_id": 999999, "reason": "Spam"},
        headers=_auth(reporter),
    )
    assert missing.status_code == 404


def test_moderation_queue_is_paginated(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "author_p")
    moderator = _make_user(db_session, "moderator_p", role="moderator")
    thread = _make_thread(db_session, author)

    for index in range(3):
        reporter = _make_user(db_session, f"reporter_p{index}")
        comment = _make_comment(db_session, author, thread, f"body {index}")
        assert _report_comment(client, reporter, comment).status_code == 201

    first = client.get("/api/admin/reports?page=1&page_size=2", headers=_auth(moderator)).json()
    assert first["total"] == 3
    assert first["pages"] == 2
    assert len(first["items"]) == 2

    second = client.get("/api/admin/reports?page=2&page_size=2", headers=_auth(moderator)).json()
    assert second["total"] == 3
    assert len(second["items"]) == 1


def test_resolving_an_unknown_report_is_404(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "moderator_404", role="moderator")
    response = client.post(
        "/api/admin/reports/999999/resolve",
        json={"action": "dismiss"},
        headers=_auth(moderator),
    )
    assert response.status_code == 404


def test_resolution_is_recorded_in_the_audit_log(client: TestClient, db_session: Session) -> None:
    from sqlalchemy import select

    from shared.models import AuditLog

    author = _make_user(db_session, "author_a")
    reporter = _make_user(db_session, "reporter_a")
    moderator = _make_user(db_session, "moderator_a", role="moderator")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, author, thread)
    report_id = _report_comment(client, reporter, comment).json()["id"]

    client.post(
        f"/api/admin/reports/{report_id}/resolve",
        json={"action": "remove_content"},
        headers=_auth(moderator),
    )

    entry = db_session.scalars(
        select(AuditLog).where(AuditLog.target_type == "report", AuditLog.target_id == report_id)
    ).one()
    assert entry.actor_id == moderator.id
    assert entry.action == "report.remove_content"


def test_reporting_a_thread_includes_its_title_in_the_queue(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "author_t")
    reporter = _make_user(db_session, "reporter_t")
    moderator = _make_user(db_session, "moderator_t", role="moderator")
    thread = _make_thread(db_session, author)

    created = client.post(
        "/api/reports",
        json={
            "content_type": "thread",
            "content_id": thread.id,
            "reason": "Falsche Kategorie",
        },
        headers=_auth(reporter),
    )
    assert created.status_code == 201
    assert created.json()["content_excerpt"] == thread.title
    assert created.json()["content_url"] == f"/threads/{thread.id}"

    queue = client.get("/api/admin/reports", headers=_auth(moderator)).json()
    assert queue["items"][0]["content_excerpt"] == thread.title

    # the report row exists exactly once for this reporter and content
    stored = db_session.query(Report).count()
    assert stored == 1
