"""Tests of the worker skeleton: the claim loop, SKIP LOCKED and start-up resilience.

Everything here runs against the worker's own isolated PostgreSQL database
(``conftest.py``); the tests create every row they need. Nothing asserts the
temporary body of a job handler — the handlers' own tickets test those — only
what the skeleton promises: due jobs are claimed with FOR UPDATE SKIP LOCKED,
dispatched, marked done or rescheduled, and a late or unreachable database never
kills the process.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import main
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from shared.config import reset_settings_cache
from shared.db import dispose_engine, get_session_factory, session_scope
from shared.jobs import JOB_KINDS, enqueue_job
from shared.models import Job

UNREACHABLE_DATABASE_URL = "postgresql://app@127.0.0.1:1/app?connect_timeout=1"


def test_claim_next_job_claims_the_oldest_due_job(db_session: Session) -> None:
    enqueue_job(
        db_session,
        "notify",
        {"thread_id": 7, "comment_id": None, "actor_id": 1, "mentions": []},
    )
    enqueue_job(db_session, "cleanup_sessions", {})
    db_session.commit()

    with session_scope() as db:
        job = main.claim_next_job(db)
        assert job is not None
        assert job.kind == "notify"
        assert job.status == "running"
        assert job.attempts == 1
        assert job.claimed_by == main.WORKER_ID
        assert job.claimed_at is not None
        assert job.locked_until is not None


def test_claim_next_job_ignores_jobs_scheduled_for_the_future(db_session: Session) -> None:
    enqueue_job(db_session, "recompute_hot", {})
    db_session.execute(update(Job).values(run_after=datetime.now(UTC) + timedelta(minutes=5)))
    db_session.commit()

    with session_scope() as db:
        assert main.claim_next_job(db) is None


def test_claim_next_job_skips_a_row_locked_by_another_worker() -> None:
    factory = get_session_factory()
    claiming_worker = factory()
    competing_worker = factory()
    try:
        enqueue_job(claiming_worker, "cleanup_sessions", {})
        claiming_worker.commit()

        claimed = main.claim_next_job(claiming_worker)
        assert claimed is not None

        # The claim transaction holds the row lock: a peer skips the row
        # (SKIP LOCKED) instead of blocking on the lock.
        assert main.claim_next_job(competing_worker) is None

        # Once the claim is committed the row is "running" — still not claimable,
        # while a job enqueued afterwards is.
        claiming_worker.commit()
        enqueue_job(competing_worker, "cleanup_sessions", {})
        competing_worker.commit()
        other = main.claim_next_job(competing_worker)
        assert other is not None
        assert other.id != claimed.id
    finally:
        claiming_worker.rollback()
        competing_worker.rollback()
        claiming_worker.close()
        competing_worker.close()


def test_run_worker_processes_a_job_it_claimed_itself(db_session: Session) -> None:
    enqueue_job(db_session, "recompute_hot", {})
    db_session.commit()
    job_id = db_session.execute(select(func.max(Job.id))).scalar_one()

    main.run_worker(poll_interval=0.02, max_iterations=5, install_signal_handlers=False)

    row = db_session.execute(
        select(Job.status, Job.attempts, Job.finished_at).where(Job.id == job_id)
    ).one()
    assert row.status == "done"
    assert row.attempts == 1
    assert row.finished_at is not None

    # The loop is the worker's one owner of the periodic jobs.
    kinds = set(db_session.execute(select(Job.kind)).scalars())
    assert {"recompute_hot", "cleanup_sessions"} <= kinds


def test_every_declared_job_kind_has_a_handler() -> None:
    assert set(main.HANDLERS) == set(JOB_KINDS)


def test_a_failing_handler_reschedules_the_job_with_the_attempt_counter(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"count": 0}

    def failing_handler(db: Session, payload: dict[str, Any]) -> None:
        calls["count"] += 1
        raise RuntimeError("handler exploded")

    monkeypatch.setitem(main.HANDLERS, "recompute_hot", failing_handler)
    enqueue_job(db_session, "recompute_hot", {})
    db_session.commit()
    job_id = db_session.execute(select(func.max(Job.id))).scalar_one()

    before = datetime.now(UTC)
    main.run_worker(poll_interval=0.02, max_iterations=1, install_signal_handlers=False)

    assert calls["count"] == 1
    row = db_session.execute(
        select(Job.status, Job.attempts, Job.last_error, Job.run_after, Job.locked_until).where(
            Job.id == job_id
        )
    ).one()
    assert row.status == "pending"
    assert row.attempts == 1
    assert "handler exploded" in (row.last_error or "")
    assert row.run_after > before + timedelta(seconds=1)
    assert row.locked_until is None


def test_a_job_is_parked_as_failed_after_the_last_attempt(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_handler(db: Session, payload: dict[str, Any]) -> None:
        raise RuntimeError("still broken")

    monkeypatch.setitem(main.HANDLERS, "cleanup_sessions", failing_handler)
    enqueue_job(db_session, "cleanup_sessions", {})
    db_session.execute(update(Job).values(attempts=main.MAX_ATTEMPTS - 1))
    db_session.commit()
    job_id = db_session.execute(select(func.max(Job.id))).scalar_one()

    main.run_worker(poll_interval=0.02, max_iterations=1, install_signal_handlers=False)

    row = db_session.execute(
        select(Job.status, Job.attempts, Job.finished_at).where(Job.id == job_id)
    ).one()
    assert row.status == "failed"
    assert row.attempts == main.MAX_ATTEMPTS
    assert row.finished_at is not None


def test_wait_for_database_retries_with_bounded_backoff_and_logs_each_wait(
    caplog: pytest.LogCaptureFixture,
) -> None:
    checks = {"count": 0}

    def check() -> bool:
        checks["count"] += 1
        return checks["count"] > 3

    delays: list[float] = []
    with caplog.at_level(logging.WARNING, logger="worker"):
        ready = main.wait_for_database(
            check=check, initial_delay=1.0, max_delay=4.0, sleep=delays.append
        )

    assert ready is True
    assert delays == [1.0, 2.0, 4.0]

    waits = [record.getMessage() for record in caplog.records if "not ready" in record.getMessage()]
    assert len(waits) == 3
    password = make_url(os.environ["DATABASE_URL"]).password
    if password:
        assert all(password not in message for message in waits)


def test_wait_for_database_stops_only_when_asked_to() -> None:
    polls = {"count": 0}

    def should_stop() -> bool:
        polls["count"] += 1
        return polls["count"] >= 3

    result = main.wait_for_database(
        check=lambda: False,
        initial_delay=0.0,
        max_delay=0.0,
        sleep=lambda _seconds: None,
        should_stop=should_stop,
    )

    assert result is False
    assert polls["count"] == 3


def test_check_database_is_false_for_an_unreachable_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", UNREACHABLE_DATABASE_URL)
    reset_settings_cache()
    dispose_engine()
    try:
        assert main.check_database() is False
    finally:
        monkeypatch.undo()
        reset_settings_cache()
        dispose_engine()


def test_missing_database_url_stops_the_worker_immediately(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    reset_settings_cache()
    dispose_engine()
    try:
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            main.run_worker(install_signal_handlers=False)
    finally:
        monkeypatch.undo()
        reset_settings_cache()
        dispose_engine()
