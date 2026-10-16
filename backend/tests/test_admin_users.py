"""Tests of the admin user administration (#73): the paginated user list that
carries each account's non-deleted thread count, its search and role filter, and
the role change that lands in the audit log.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import AuditLog, Category, Thread, User


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


def _make_thread(
    db: Session, category: Category, author: User, title: str, deleted: bool = False
) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="The body of the thread.",
        deleted=deleted,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def test_user_list_carries_the_non_deleted_thread_count(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    author = _make_user(db_session, "mara")
    category = Category(name="General", slug="general", description=None, position=0)
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    _make_thread(db_session, category, author, "First")
    _make_thread(db_session, category, author, "Second")
    _make_thread(db_session, category, author, "Removed", deleted=True)

    response = client.get("/api/admin/users", headers=_auth(admin))

    assert response.status_code == 200
    by_name = {item["username"]: item for item in response.json()["items"]}
    assert by_name["mara"]["thread_count"] == 2
    assert by_name["boss"]["thread_count"] == 0


def test_user_list_searches_username_and_email(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    _make_user(db_session, "mara")
    _make_user(db_session, "lena")

    by_name = client.get("/api/admin/users", params={"q": "mar"}, headers=_auth(admin)).json()[
        "items"
    ]
    assert [item["username"] for item in by_name] == ["mara"]

    by_email = client.get(
        "/api/admin/users", params={"q": "lena@example.test"}, headers=_auth(admin)
    ).json()["items"]
    assert [item["username"] for item in by_email] == ["lena"]


def test_user_list_filters_by_role(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    _make_user(db_session, "mod", role="moderator")
    _make_user(db_session, "mara")

    items = client.get(
        "/api/admin/users", params={"role": "moderator"}, headers=_auth(admin)
    ).json()["items"]
    assert [item["username"] for item in items] == ["mod"]


def test_user_list_is_paginated(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    for index in range(3):
        _make_user(db_session, f"user{index}")

    body = client.get(
        "/api/admin/users", params={"page": 1, "page_size": 2}, headers=_auth(admin)
    ).json()
    assert body["total"] == 4
    assert body["pages"] == 2
    assert len(body["items"]) == 2


def test_role_change_updates_the_user_and_audits_it(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    target = _make_user(db_session, "mara")

    response = client.patch(
        f"/api/admin/users/{target.id}/role",
        json={"role": "moderator"},
        headers=_auth(admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "moderator"
    assert body["thread_count"] == 0
    db_session.refresh(target)
    assert target.role == "moderator"

    entry = db_session.scalars(select(AuditLog).where(AuditLog.action == "user.role")).one()
    assert entry.actor_id == admin.id
    assert entry.target_type == "user"
    assert entry.target_id == target.id


def test_user_administration_requires_a_moderator(client: TestClient, db_session: Session) -> None:
    plain = _make_user(db_session, "plain")

    listed = client.get("/api/admin/users", headers=_auth(plain))
    assert listed.status_code == 403

    role = client.patch("/api/admin/users/1/role", json={"role": "admin"}, headers=_auth(plain))
    assert role.status_code == 403
