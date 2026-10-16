"""Login accepts the username or the e-mail address (#login-identity)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

PASSWORD = "Demo1234!"


@pytest.fixture(autouse=True)
def _clear_cookies(client: TestClient) -> Iterator[None]:
    """The client is session-scoped; never let one test's session leak into the next."""
    client.cookies.clear()
    yield
    client.cookies.clear()


def _register(client: TestClient, username: str = "mara", email: str = "mara@example.test"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": PASSWORD},
    )


def _login(client: TestClient, identity: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": identity, "password": password})


def test_login_with_the_username_opens_a_session(client: TestClient):
    _register(client)

    response = _login(client, "mara")

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["username"] == "mara"
    assert response.cookies.get("refresh_token")


def test_login_with_the_username_is_case_insensitive(client: TestClient):
    _register(client)

    response = _login(client, "MaRa")

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "mara"


def test_login_with_the_email_still_works(client: TestClient):
    _register(client)

    response = _login(client, "mara@example.test")

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "mara"


def test_login_with_the_email_is_case_insensitive(client: TestClient):
    _register(client)

    response = _login(client, "MARA@Example.TEST")

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "mara"


def test_login_with_the_username_and_a_wrong_password_answers_401(client: TestClient):
    _register(client)

    response = _login(client, "mara", password="Wrong1234!")

    assert response.status_code == 401
    assert response.json()["error"]["code"]


def test_login_with_an_unknown_username_answers_401(client: TestClient):
    _register(client)

    response = _login(client, "ghost")

    assert response.status_code == 401
    assert response.json()["error"]["code"]
