"""Tests of the worker's hot-ranking job: ``handle_recompute_hot``.

Everything here runs against the worker's own isolated PostgreSQL database
(``conftest.py``); each test creates the rows it needs and only asserts what the
job promises: the ``hot_score`` column of every non-deleted thread is recomputed
from its cached score and age, the ordering puts a newer, more-upvoted thread
above an older, quieter one, and the recomputation commits in batches.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jobs import hot
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import Category, Thread, User


def _user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="x",
    )
    db.add(user)
    db.flush()
    return user


def _category(db: Session, name: str = "General", slug: str = "general") -> Category:
    category = Category(name=name, slug=slug, description=None, position=0)
    db.add(category)
    db.flush()
    return category


def _thread(
    db: Session,
    category: Category,
    author: User,
    title: str,
    *,
    score: int = 0,
    age: timedelta = timedelta(0),
    deleted: bool = False,
) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="body",
        tags=[],
        score=score,
        deleted=deleted,
        created_at=datetime.now(UTC) - age,
    )
    db.add(thread)
    db.flush()
    return thread


def test_newer_thread_with_more_votes_ranks_above_an_older_quieter_one(
    db_session: Session,
) -> None:
    author = _user(db_session, "author")
    category = _category(db_session)
    older = _thread(db_session, category, author, "older", score=1, age=timedelta(days=3))
    newer = _thread(db_session, category, author, "newer", score=5, age=timedelta(hours=1))
    db_session.commit()

    hot.handle_recompute_hot(db_session, {})
    db_session.commit()

    assert newer.hot_score > older.hot_score

    order = db_session.scalars(
        select(Thread.id).where(Thread.deleted.is_(False)).order_by(Thread.hot_score.desc())
    ).all()
    assert order == [newer.id, older.id]


def test_hot_score_decays_with_age_for_the_same_votes(db_session: Session) -> None:
    author = _user(db_session, "author")
    category = _category(db_session)
    fresh = _thread(db_session, category, author, "fresh", score=10, age=timedelta(0))
    stale = _thread(db_session, category, author, "stale", score=10, age=timedelta(days=10))
    db_session.commit()

    hot.handle_recompute_hot(db_session, {})
    db_session.commit()

    assert fresh.hot_score > stale.hot_score
    assert hot.compute_hot_score(10, datetime.now(UTC)) > hot.compute_hot_score(
        10, datetime.now(UTC) - timedelta(days=10)
    )


def test_deleted_threads_keep_their_untouched_hot_score(db_session: Session) -> None:
    author = _user(db_session, "author")
    category = _category(db_session)
    visible = _thread(db_session, category, author, "visible", score=3, age=timedelta(hours=2))
    removed = _thread(
        db_session, category, author, "removed", score=3, age=timedelta(0), deleted=True
    )
    db_session.commit()

    hot.handle_recompute_hot(db_session, {})
    db_session.commit()

    assert visible.hot_score != 0
    assert removed.hot_score == 0


def test_recomputation_commits_every_thread_across_batches(
    db_session: Session, monkeypatch
) -> None:
    monkeypatch.setattr(hot, "BATCH_SIZE", 2)
    author = _user(db_session, "author")
    category = _category(db_session)
    threads = [
        _thread(db_session, category, author, f"thread-{index}", score=index + 1)
        for index in range(5)
    ]
    db_session.commit()

    hot.handle_recompute_hot(db_session, {})
    db_session.commit()

    db_session.expire_all()
    for thread in threads:
        assert thread.hot_score == hot.compute_hot_score(thread.score, thread.created_at)
