"""Tests for registration, login, refresh rotation, logout and password change (#35)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import RefreshToken, User

PASSWORD = "Demo1234!"


@pytest.fixture(autouse=True)
def _clear_cookies(client: TestClient) -> Iterator[None]:
    """The client is session-scoped; never let one test's session leak into the next."""
    client.cookies.clear()
    yield
    client.cookies.clear()


def _register(
    client: TestClient,
    username: str = "alice",
    email: str = "alice@example.test",
    password: str = PASSWORD,
):
    return client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )


def _login(client: TestClient, email: str = "alice@example.test", password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_register_creates_the_account_and_returns_user_out(client: TestClient, db_session: Session):
    response = _register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "alice"
    assert body["email"] == "alice@example.test"
    assert body["role"] == "user"
    assert body["karma"] == 0
    assert body["bio"] is None

    user = db_session.scalars(select(User).where(User.username == "alice")).first()
    assert user is not None
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$argon2")


def test_register_normalises_the_email(client: TestClient, db_session: Session):
    response = _register(client, email="Alice@Example.TEST")

    assert response.status_code == 201
    assert response.json()["email"] == "alice@example.test"


def test_register_duplicate_username_answers_409_on_the_field(
    client: TestClient, db_session: Session
):
    _register(client, username="alice", email="alice@example.test")

    response = _register(client, username="alice", email="other@example.test")

    assert response.status_code == 409
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "conflict"
    assert "username" in body["error"]["fields"]


def test_register_duplicate_email_answers_409_on_the_field(client: TestClient, db_session: Session):
    _register(client, username="alice", email="alice@example.test")

    response = _register(client, username="bob", email="alice@example.test")

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "conflict"
    assert "email" in body["error"]["fields"]


def test_register_duplicate_email_is_case_insensitive(client: TestClient, db_session: Session):
    _register(client, username="alice", email="alice@example.test")

    response = _register(client, username="bob", email="ALICE@example.test")

    assert response.status_code == 409
    assert "email" in response.json()["error"]["fields"]


def test_register_rejects_a_too_short_password_with_422(client: TestClient):
    response = _register(client, password="short")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "password" in body["error"]["fields"]


def test_register_rejects_a_bad_username_with_422(client: TestClient):
    response = _register(client, username="a")

    assert response.status_code == 422
    assert "username" in response.json()["error"]["fields"]


def test_login_sets_access_token_and_refresh_cookie(client: TestClient, db_session: Session):
    _register(client)

    response = _login(client)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert isinstance(body["expires_in"], int) and body["expires_in"] > 0
    assert body["user"]["username"] == "alice"

    cookie = response.cookies.get("refresh_token")
    assert cookie
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/api/auth" in set_cookie


def test_login_with_wrong_password_answers_401(client: TestClient, db_session: Session):
    _register(client)

    response = _login(client, password="Wrong1234!")

    assert response.status_code == 401
    assert response.json()["error"]["code"]


def test_login_with_unknown_email_answers_401(client: TestClient):
    response = _login(client, email="ghost@example.test")

    assert response.status_code == 401


def test_refresh_rotates_the_cookie_and_rejects_the_old_one(
    client: TestClient, db_session: Session
):
    _register(client)
    login = _login(client)
    old_token = login.cookies.get("refresh_token")
    assert old_token

    rotated = client.post("/api/auth/refresh")

    assert rotated.status_code == 200
    assert rotated.json()["access_token"]
    new_token = rotated.cookies.get("refresh_token")
    assert new_token and new_token != old_token

    client.cookies.set("refresh_token", old_token)
    replay = client.post("/api/auth/refresh")

    assert replay.status_code == 401
    assert replay.json()["error"]["code"]


def test_refresh_without_a_cookie_answers_401(client: TestClient):
    response = client.post("/api/auth/refresh")

    assert response.status_code == 401


def test_refresh_with_an_unknown_token_answers_401(client: TestClient):
    client.cookies.set("refresh_token", "not-a-real-token")
    response = client.post("/api/auth/refresh")

    assert response.status_code == 401


def test_logout_revokes_the_token_server_side(client: TestClient, db_session: Session):
    _register(client)
    login = _login(client)
    token = login.cookies.get("refresh_token")

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    row = db_session.scalars(
        select(RefreshToken).where(RefreshToken.revoked_at.is_not(None))
    ).first()
    assert row is not None

    client.cookies.set("refresh_token", token)
    after = client.post("/api/auth/refresh")
    assert after.status_code == 401


def test_logout_without_a_cookie_answers_401(client: TestClient):
    response = client.post("/api/auth/logout")

    assert response.status_code == 401


def test_change_password_requires_authentication(client: TestClient):
    response = client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "NewPass123!"},
    )

    assert response.status_code == 401


def test_change_password_rejects_a_wrong_current_password(client: TestClient, db_session: Session):
    _register(client)
    login = _login(client)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = client.post(
        "/api/auth/password",
        json={"current_password": "Wrong1234!", "new_password": "NewPass123!"},
        headers=headers,
    )

    assert response.status_code == 400
    assert "current_password" in response.json()["error"]["fields"]


def test_change_password_swaps_the_active_password(client: TestClient, db_session: Session):
    _register(client)
    login = _login(client)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "NewPass123!"},
        headers=headers,
    )

    assert response.status_code == 204
    assert _login(client, password=PASSWORD).status_code == 401
    assert _login(client, password="NewPass123!").status_code == 200


def test_change_password_rejects_a_too_short_new_password(client: TestClient, db_session: Session):
    _register(client)
    login = _login(client)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "short"},
        headers=headers,
    )

    assert response.status_code == 422
    assert "new_password" in response.json()["error"]["fields"]
