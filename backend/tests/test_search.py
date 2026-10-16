"""Tests for GET /api/search (#19): full-text match in title and body, the
category and tag filters, pagination, and the empty-query error case.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shared.models import Category, Thread, User


def _make_user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_category(db: Session, name: str, slug: str) -> Category:
    category = Category(name=name, slug=slug, description="A category", position=0)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _make_thread(
    db: Session,
    category: Category,
    author: User,
    title: str,
    body: str,
    *,
    tags: list[str] | None = None,
    deleted: bool = False,
) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown=body,
        tags=tags or [],
        deleted=deleted,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _search(client: TestClient, **params: object) -> dict:
    response = client.get("/api/search", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_search_matches_a_word_in_the_title(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(
        db_session, category, author, "The quokka chronicles", "An unrelated body."
    )

    body = _search(client, q="quokka")

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [thread.id]
    result = body["items"][0]
    assert result["title"] == "The quokka chronicles"
    assert result["category_slug"] == "general"
    assert result["category_name"] == "General"
    assert result["author"]["username"] == "alice"


def test_search_matches_a_word_in_the_body(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "bob")
    category = _make_category(db_session, "General", "general")
    thread = _make_thread(db_session, category, author, "Untitled", "A nebula appeared in the sky.")

    body = _search(client, q="nebula")

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [thread.id]


def test_search_excludes_soft_deleted_threads(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "carol")
    category = _make_category(db_session, "General", "general")
    kept = _make_thread(db_session, category, author, "Kept", "A nebula appeared.")
    _make_thread(db_session, category, author, "Removed", "A nebula appeared.", deleted=True)

    body = _search(client, q="nebula")

    assert [item["id"] for item in body["items"]] == [kept.id]


def test_search_without_a_match_returns_an_empty_page(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "dave")
    category = _make_category(db_session, "General", "general")
    _make_thread(db_session, category, author, "Something else", "Another body.")

    body = _search(client, q="quokka")

    assert body["items"] == []
    assert body["total"] == 0
    assert body["pages"] == 0


def test_search_narrows_by_category(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "erin")
    general = _make_category(db_session, "General", "general")
    helpdesk = _make_category(db_session, "Helpdesk", "helpdesk")
    wanted = _make_thread(db_session, general, author, "A quokka here", "body")
    _make_thread(db_session, helpdesk, author, "A quokka there", "body")

    body = _search(client, q="quokka", category="general")

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [wanted.id]


def test_search_narrows_by_tag(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "frank")
    category = _make_category(db_session, "General", "general")
    wanted = _make_thread(db_session, category, author, "A quokka here", "body", tags=["python"])
    _make_thread(db_session, category, author, "A quokka there", "body", tags=["rust"])

    body = _search(client, q="quokka", tag="python")

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [wanted.id]


def test_search_paginates_and_reports_the_total(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "grace")
    category = _make_category(db_session, "General", "general")
    for index in range(3):
        _make_thread(db_session, category, author, f"A quokka story {index}", "body")

    first = _search(client, q="quokka", page=1, page_size=2)
    second = _search(client, q="quokka", page=2, page_size=2)

    assert first["total"] == 3
    assert first["page"] == 1
    assert first["page_size"] == 2
    assert first["pages"] == 2
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1


def test_search_empty_query_answers_422_in_the_error_envelope(
    client: TestClient,
) -> None:
    response = client.get("/api/search", params={"q": ""})

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"]
    assert "q" in body["error"]["fields"]


def test_search_missing_query_answers_422(client: TestClient) -> None:
    response = client.get("/api/search")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
