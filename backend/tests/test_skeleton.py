"""Tests of the skeleton itself: the app starts, the health route answers with
the database reachable, every planned router is registered, and no route that
another ticket will fill answers 500 today.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from shared.models import User

# Every route of the shared interface, exactly as declared.
EXPECTED_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/refresh"),
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/password"),
    ("GET", "/api/me"),
    ("PATCH", "/api/me"),
    ("GET", "/api/users/{username}"),
    ("GET", "/api/categories"),
    ("POST", "/api/admin/categories"),
    ("PATCH", "/api/admin/categories/{id}"),
    ("DELETE", "/api/admin/categories/{id}"),
    ("PUT", "/api/admin/categories/order"),
    ("POST", "/api/threads"),
    ("GET", "/api/threads"),
    ("GET", "/api/threads/{id}"),
    ("PATCH", "/api/threads/{id}"),
    ("DELETE", "/api/threads/{id}"),
    ("GET", "/api/threads/{id}/comments"),
    ("POST", "/api/threads/{id}/comments"),
    ("PATCH", "/api/comments/{id}"),
    ("DELETE", "/api/comments/{id}"),
    ("PUT", "/api/threads/{id}/vote"),
    ("PUT", "/api/comments/{id}/vote"),
    ("GET", "/api/threads/{id}/subscription"),
    ("POST", "/api/threads/{id}/subscription"),
    ("DELETE", "/api/threads/{id}/subscription"),
    ("GET", "/api/notifications"),
    ("GET", "/api/notifications/unread-count"),
    ("POST", "/api/notifications/read"),
    ("POST", "/api/reports"),
    ("GET", "/api/admin/reports"),
    ("POST", "/api/admin/reports/{id}/resolve"),
    ("POST", "/api/admin/users/{id}/ban"),
    ("DELETE", "/api/admin/users/{id}/ban"),
    ("PATCH", "/api/admin/users/{id}/role"),
    ("GET", "/api/admin/users"),
    ("POST", "/api/admin/threads/{id}/pin"),
    ("POST", "/api/admin/threads/{id}/lock"),
    ("POST", "/api/admin/threads/{id}/move"),
    ("DELETE", "/api/admin/threads/{id}"),
    ("GET", "/api/admin/stats"),
    ("GET", "/api/admin/audit-log"),
}


def _concrete_url(path: str) -> str:
    return path.replace("{id}", "1").replace("{username}", "nobody")


def test_health_reports_ok_with_database(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_openapi_lists_every_planned_route(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    documented = {
        (method.upper(), path) for path, operations in paths.items() for method in operations
    }
    assert documented >= EXPECTED_ROUTES, EXPECTED_ROUTES - documented


def test_route_table_registers_every_planned_route(client: TestClient) -> None:
    from app.main import app

    def walk(routes):
        for route in routes:
            included = getattr(route, "original_router", None)
            if included is not None:
                yield from walk(included.routes)
            else:
                yield route

    registered = {
        (method, route.path)
        for route in walk(app.routes)
        if getattr(route, "methods", None)
        for method in route.methods
    }
    assert registered >= EXPECTED_ROUTES, EXPECTED_ROUTES - registered


def test_unknown_route_answers_the_error_envelope(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"]
    assert body["error"]["message"]
    assert body["error"]["fields"] == {}


def test_validation_errors_answer_422_in_the_contract_shape(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["fields"], "validation errors name the offending fields"


@pytest.mark.parametrize(("method", "path"), sorted(EXPECTED_ROUTES))
def test_no_planned_route_answers_500(client: TestClient, method: str, path: str) -> None:
    request_kwargs: dict[str, object] = {}
    if method in ("POST", "PATCH", "PUT"):
        request_kwargs["json"] = {}
    response = client.request(method, _concrete_url(path), **request_kwargs)
    assert response.status_code != 500, f"{method} {path} answered {response.status_code}"


def test_pagination_helper_reports_total_and_pages(client: TestClient, db_session) -> None:
    from app.pagination import paginate

    for index in range(3):
        db_session.add(
            User(
                username=f"user{index}",
                email=f"user{index}@example.test",
                password_hash="not-a-real-hash",
            )
        )
    db_session.commit()

    page = paginate(db_session, select(User).order_by(User.id), page=2, page_size=2)
    assert page["total"] == 3
    assert page["page"] == 2
    assert page["page_size"] == 2
    assert page["pages"] == 2
    assert len(page["items"]) == 1


def test_password_hashing_and_access_tokens_round_trip(client: TestClient) -> None:
    from app.security import (
        create_access_token,
        decode_access_token,
        hash_password,
        verify_password,
    )

    password_hash = hash_password("Demo1234!")
    assert password_hash != "Demo1234!"
    assert verify_password("Demo1234!", password_hash)
    assert not verify_password("Wrong1234!", password_hash)

    class FakeUser:
        id = 7
        username = "demo"
        role = "user"

    claims = decode_access_token(create_access_token(FakeUser()))  # type: ignore[arg-type]
    assert claims["sub"] == "7"
    assert claims["username"] == "demo"
    assert claims["role"] == "user"


def test_slash_variants_are_not_a_second_interface(client: TestClient) -> None:
    assert client.get("/api/health/").status_code == 404


def test_internal_errors_keep_cors_headers_and_the_error_envelope() -> None:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from app.main import UnhandledErrorMiddleware

    probe = FastAPI()
    probe.add_middleware(UnhandledErrorMiddleware)
    probe.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @probe.get("/boom")
    def boom() -> None:
        raise RuntimeError("boom")

    with TestClient(probe, raise_server_exceptions=False) as probe_client:
        response = probe_client.get("/boom", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert response.json()["error"]["code"] == "internal_error"
