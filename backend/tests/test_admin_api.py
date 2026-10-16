"""Tests of the admin API: the dashboard statistics, the audit log and the
role/authentication guards."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import AuditLog, Category, Comment, Report, Thread, User


def _make_user(
    db: Session,
    username: str,
    role: str = "user",
    created_at: datetime | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        role=role,
        created_at=created_at or datetime.now(UTC),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _make_category(db: Session, name: str, slug: str) -> Category:
    category = Category(name=name, slug=slug, description=None, position=1)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _make_thread(
    db: Session,
    category: Category,
    author: User,
    title: str,
    created_at: datetime | None = None,
) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="body",
        created_at=created_at or datetime.now(UTC),
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _make_comment(
    db: Session,
    thread: Thread,
    author: User,
    created_at: datetime | None = None,
) -> Comment:
    comment = Comment(
        thread_id=thread.id,
        author_id=author.id,
        body_markdown="a comment",
        created_at=created_at or datetime.now(UTC),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def _make_report(
    db: Session,
    reporter: User,
    content_id: int,
    status: str = "open",
) -> Report:
    report = Report(
        reporter_id=reporter.id,
        content_type="thread",
        content_id=content_id,
        reason="spam",
        status=status,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@pytest.mark.parametrize("path", ["/api/admin/stats", "/api/admin/audit-log"])
def test_admin_endpoints_require_authentication(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.parametrize("path", ["/api/admin/stats", "/api/admin/audit-log"])
def test_admin_endpoints_reject_a_plain_user(
    client: TestClient, db_session: Session, path: str
) -> None:
    plain = _make_user(db_session, "plain")
    response = client.get(path, headers=_auth(plain))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_moderators_may_read_the_dashboard(client: TestClient, db_session: Session) -> None:
    moderator = _make_user(db_session, "mod", role="moderator")
    response = client.get("/api/admin/stats", headers=_auth(moderator))
    assert response.status_code == 200


def test_stats_count_users_threads_comments_and_open_reports(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    author = _make_user(db_session, "writer")
    old = datetime.now(UTC) - timedelta(days=10)
    _make_user(db_session, "veteran", created_at=old)
    category = _make_category(db_session, "General", "general")

    today_thread = _make_thread(db_session, category, author, "Today")
    _make_thread(db_session, category, author, "Long ago", created_at=old)
    _make_comment(db_session, today_thread, author)
    _make_comment(db_session, today_thread, author, created_at=old)
    _make_report(db_session, author, today_thread.id, status="open")
    _make_report(db_session, author, today_thread.id + 1, status="resolved")

    response = client.get("/api/admin/stats", headers=_auth(admin))
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "users_today": 2,
        "users_7d": 2,
        "threads_today": 1,
        "threads_7d": 1,
        "comments_today": 1,
        "comments_7d": 1,
        "open_reports": 1,
    }


def test_audit_log_lists_actions_newest_first_with_the_actor(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    base = datetime.now(UTC)
    db_session.add_all(
        [
            AuditLog(
                actor_id=admin.id,
                action="category.create",
                target_type="category",
                target_id=1,
                details='{"name": "General"}',
                created_at=base - timedelta(seconds=5),
            ),
            AuditLog(
                actor_id=admin.id,
                action="category.delete",
                target_type="category",
                target_id=1,
                details="{}",
                created_at=base,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/admin/audit-log", headers=_auth(admin))
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["action"] for item in items] == ["category.delete", "category.create"]
    assert items[0]["actor_username"] == "boss"
    assert items[0]["target_type"] == "category"
    assert items[0]["target_id"] == 1


def test_audit_log_is_paginated(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    base = datetime.now(UTC)
    for index in range(5):
        db_session.add(
            AuditLog(
                actor_id=admin.id,
                action=f"thing.{index}",
                target_type="thing",
                target_id=index,
                details="{}",
                created_at=base + timedelta(seconds=index),
            )
        )
    db_session.commit()

    response = client.get(
        "/api/admin/audit-log", params={"page": 1, "page_size": 2}, headers=_auth(admin)
    )
    assert response.status_code == 200
    body = response.json()
    assert [item["action"] for item in body["items"]] == ["thing.4", "thing.3"]
    assert body["total"] == 5
    assert body["pages"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 2
