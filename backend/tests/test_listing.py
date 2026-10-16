"""Tests of the paginated thread listing: GET /api/threads.

Covers the three sort orders (new/top/hot), the category and tag filters, the
pinned-first rule, the exclusion of soft-deleted threads, the live comment count
and the pagination envelope (total and pages).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shared.models import Category, Comment, Thread, User

BASE = datetime(2026, 1, 1, tzinfo=UTC)


def _user(db: Session, name: str, karma: int = 0) -> User:
    user = User(
        username=name,
        email=f"{name}@example.test",
        password_hash="not-a-real-hash",
        karma=karma,
    )
    db.add(user)
    db.flush()
    return user


def _category(db: Session, name: str, slug: str, position: int = 0) -> Category:
    category = Category(name=name, slug=slug, position=position)
    db.add(category)
    db.flush()
    return category


def _thread(
    db: Session,
    category: Category,
    author: User,
    title: str,
    *,
    created_offset: int = 0,
    score: int = 0,
    hot_score: float = 0.0,
    pinned: bool = False,
    deleted: bool = False,
    tags: list[str] | None = None,
) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="body",
        tags=tags or [],
        score=score,
        hot_score=hot_score,
        pinned=pinned,
        deleted=deleted,
        created_at=BASE + timedelta(hours=created_offset),
    )
    db.add(thread)
    db.flush()
    return thread


def _titles(response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


def test_new_orders_by_created_at_desc(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(db_session, category, author, "oldest", created_offset=0)
    _thread(db_session, category, author, "middle", created_offset=1)
    _thread(db_session, category, author, "newest", created_offset=2)
    db_session.commit()

    response = client.get("/api/threads", params={"sort": "new"})
    assert response.status_code == 200
    assert _titles(response) == ["newest", "middle", "oldest"]


def test_top_orders_by_score_desc(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(db_session, category, author, "low", score=1, created_offset=2)
    _thread(db_session, category, author, "high", score=10, created_offset=0)
    _thread(db_session, category, author, "mid", score=5, created_offset=1)
    db_session.commit()

    response = client.get("/api/threads", params={"sort": "top"})
    assert response.status_code == 200
    assert _titles(response) == ["high", "mid", "low"]


def test_hot_uses_the_stored_hot_score(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(db_session, category, author, "cold", hot_score=0.5, created_offset=5, score=1)
    _thread(db_session, category, author, "hot", hot_score=42.0, created_offset=0, score=50)
    db_session.commit()

    response = client.get("/api/threads", params={"sort": "hot"})
    assert response.status_code == 200
    assert _titles(response) == ["hot", "cold"]


def test_hot_puts_newer_more_upvoted_thread_above_older(
    client: TestClient, db_session: Session
) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(
        db_session, category, author, "older-popular", hot_score=90.0, score=80, created_offset=0
    )
    _thread(db_session, category, author, "newer-hot", hot_score=120.0, score=95, created_offset=3)
    db_session.commit()

    response = client.get("/api/threads", params={"sort": "hot", "category": "general"})
    assert response.status_code == 200
    assert _titles(response) == ["newer-hot", "older-popular"]


def test_category_filter_selects_one_category(client: TestClient, db_session: Session) -> None:
    general = _category(db_session, "General", "general", position=0)
    news = _category(db_session, "News", "news", position=1)
    author = _user(db_session, "alice")
    _thread(db_session, general, author, "in-general")
    _thread(db_session, news, author, "in-news")
    db_session.commit()

    response = client.get("/api/threads", params={"category": "news"})
    assert response.status_code == 200
    assert _titles(response) == ["in-news"]
    assert response.json()["total"] == 1
    for item in response.json()["items"]:
        assert item["category_slug"] == "news"
        assert item["category_name"] == "News"


def test_tag_filter_selects_matching_threads(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(db_session, category, author, "python-post", tags=["python", "fastapi"])
    _thread(db_session, category, author, "rust-post", tags=["rust"])
    db_session.commit()

    response = client.get("/api/threads", params={"tag": "python"})
    assert response.status_code == 200
    assert _titles(response) == ["python-post"]
    assert response.json()["total"] == 1


def test_pinned_threads_come_first(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(db_session, category, author, "pinned-old", pinned=True, created_offset=0)
    _thread(db_session, category, author, "newest", created_offset=5)
    _thread(db_session, category, author, "older", created_offset=1)
    db_session.commit()

    response = client.get("/api/threads", params={"category": "general", "sort": "new"})
    assert response.status_code == 200
    assert _titles(response)[0] == "pinned-old"


def test_soft_deleted_threads_never_appear(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    _thread(db_session, category, author, "visible", created_offset=1)
    _thread(db_session, category, author, "gone", created_offset=2, deleted=True)
    _thread(db_session, category, author, "also-visible", created_offset=0)
    db_session.commit()

    response = client.get("/api/threads", params={"sort": "new"})
    assert response.status_code == 200
    assert _titles(response) == ["visible", "also-visible"]
    assert response.json()["total"] == 2


def test_comment_count_counts_only_non_deleted_comments(
    client: TestClient, db_session: Session
) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    thread = _thread(db_session, category, author, "discussed")
    db_session.add_all(
        [
            Comment(
                thread_id=thread.id,
                author_id=author.id,
                body_markdown="keep one",
                depth=1,
                created_at=BASE,
            ),
            Comment(
                thread_id=thread.id,
                author_id=author.id,
                body_markdown="keep two",
                depth=1,
                created_at=BASE,
            ),
            Comment(
                thread_id=thread.id,
                author_id=author.id,
                body_markdown="removed",
                depth=1,
                deleted=True,
                created_at=BASE,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/threads")
    assert response.status_code == 200
    assert response.json()["items"][0]["comment_count"] == 2


def test_pagination_reports_total_and_stable_pages(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice")
    for index in range(5):
        _thread(db_session, category, author, f"thread-{index}", created_offset=index)
    db_session.commit()

    first = client.get("/api/threads", params={"page": 1, "page_size": 2, "sort": "new"})
    assert first.status_code == 200
    body = first.json()
    assert body["total"] == 5
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["pages"] == 3
    assert _titles(first) == ["thread-4", "thread-3"]

    second = client.get("/api/threads", params={"page": 2, "page_size": 2, "sort": "new"})
    assert _titles(second) == ["thread-2", "thread-1"]

    third = client.get("/api/threads", params={"page": 3, "page_size": 2, "sort": "new"})
    assert _titles(third) == ["thread-0"]


def test_summary_carries_the_contract_fields(client: TestClient, db_session: Session) -> None:
    category = _category(db_session, "General", "general")
    author = _user(db_session, "alice", karma=7)
    _thread(db_session, category, author, "the-post", score=3, tags=["alpha"])
    db_session.commit()

    item = client.get("/api/threads").json()["items"][0]
    assert item["author"] == {"id": author.id, "username": "alice", "karma": 7}
    assert item["tags"] == ["alpha"]
    assert item["category_slug"] == "general"
    assert item["deleted"] is False


def test_invalid_sort_answers_422_in_the_contract_shape(
    client: TestClient, db_session: Session
) -> None:
    response = client.get("/api/threads", params={"sort": "sideways"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "sort" in body["error"]["fields"]
