"""The forum's background worker: job claim loop, dispatch and the periodic schedule.

The worker is started as its own process (``python main.py`` in this directory).
It shares the database and the ``jobs`` table with the API through the ``shared``
package, claims due jobs with ``SELECT ... FOR UPDATE SKIP LOCKED`` and either
marks them done or reschedules them with an attempt counter.

It never gives up on a database that is merely late: the office starts the worker
next to PostgreSQL, before the API had a chance to migrate the schema, so the
worker waits — logging every wait with a bounded backoff — until PostgreSQL
answers *and* the migrated ``jobs`` table exists. Only a missing ``DATABASE_URL``
stops it at once, because no amount of waiting can fix configuration.
"""

from __future__ import annotations

import dataclasses
import logging
import os
import signal
import socket
import threading
import time
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from jobs.cleanup import handle_cleanup_sessions
from jobs.hot import handle_recompute_hot
from jobs.notifications import handle_notify
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from shared.config import get_settings
from shared.db import get_engine, session_scope
from shared.jobs import enqueue_job
from shared.models import Job

logger = logging.getLogger("worker")

WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"

#: A claimed job is invisible to other workers for this long. Long enough to
#: cover a normal handler run; the status is what actually keeps peers away.
JOB_LOCK_SECONDS = 60

#: A failing job is retried at most this many times (the claim increments the
#: attempt counter) and is then parked as ``failed``.
MAX_ATTEMPTS = 5

#: Backoff of a failed job: 10s, 20s, 40s, ... capped at five minutes.
RESCHEDULE_BASE_SECONDS = 10
RESCHEDULE_MAX_SECONDS = 300

#: The two periodic jobs and their intervals in seconds. The worker is their ONE
#: owner — no other service enqueues them. Both are due immediately on start so
#: a freshly started worker visibly works; a restart therefore costs one extra
#: run of each, which both handlers are designed to tolerate.
PERIODIC_JOBS: tuple[tuple[str, float], ...] = (
    ("recompute_hot", 60.0),
    ("cleanup_sessions", 300.0),
)

#: Waiting for a late database: 1s, 2s, 4s, ... capped at 30s, forever.
DATABASE_WAIT_INITIAL_SECONDS = 1.0
DATABASE_WAIT_MAX_SECONDS = 30.0

#: The dispatch table: job kind -> handler. The handler runs inside its own
#: transaction and a raised exception means "retry this job later".
HANDLERS: dict[str, Callable[[Session, dict[str, Any]], None]] = {
    "notify": handle_notify,
    "recompute_hot": handle_recompute_hot,
    "cleanup_sessions": handle_cleanup_sessions,
}


@dataclasses.dataclass(frozen=True)
class ClaimedJob:
    """A snapshot of a claimed job row, safe to use after the claim transaction."""

    id: int
    kind: str
    payload: dict[str, Any]
    attempts: int


def _now() -> datetime:
    return datetime.now(UTC)


def _database_label() -> str:
    """The configured database for log lines — never with its password."""
    try:
        url = make_url(get_settings().database_url)
    except (RuntimeError, ValueError):  # broken configuration is reported elsewhere
        return "database"
    return url.render_as_string(hide_password=True)


def check_database() -> bool:
    """True when PostgreSQL answers *and* the migrated schema (``jobs``) is there.

    A missing ``DATABASE_URL`` is configuration and raises; an unreachable
    database or an unmigrated schema is a wait and answers False.
    """
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1 FROM jobs LIMIT 0"))
    except SQLAlchemyError:
        return False
    return True


def wait_for_database(
    *,
    check: Callable[[], bool] = check_database,
    initial_delay: float = DATABASE_WAIT_INITIAL_SECONDS,
    max_delay: float = DATABASE_WAIT_MAX_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
    should_stop: Callable[[], bool] | None = None,
) -> bool:
    """Block until the database and its schema are ready.

    Every wait is logged and the delay is bounded by ``max_delay``. Returns True
    once the database is ready and False only when ``should_stop`` asked the
    worker to shut down — it never gives up on its own.
    """
    delay = initial_delay
    waits = 0
    while not check():
        if should_stop is not None and should_stop():
            return False
        waits += 1
        logger.warning(
            "database %s is not ready yet (wait %d) — retrying in %.1fs",
            _database_label(),
            waits,
            delay,
        )
        sleep(delay)
        delay = min(delay * 2.0, max_delay)
    if waits:
        logger.info("database %s is ready after %d wait(s)", _database_label(), waits)
    return True


def claim_next_job(db: Session, *, now: datetime | None = None) -> Job | None:
    """Claim the oldest due pending job of ``jobs`` with FOR UPDATE SKIP LOCKED.

    The row lock is what lets several workers run side by side: a peer skips a
    row that is being claimed instead of blocking on it. The caller commits the
    claim (``session_scope`` does), which turns the row into ``running``.
    """
    moment = now or _now()
    statement = (
        select(Job)
        .where(Job.status == "pending", Job.run_after <= moment)
        .order_by(Job.run_after, Job.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = db.execute(statement).scalar_one_or_none()
    if job is None:
        return None
    job.status = "running"
    job.attempts += 1
    job.claimed_at = moment
    job.claimed_by = WORKER_ID
    job.locked_until = moment + timedelta(seconds=JOB_LOCK_SECONDS)
    db.flush()
    return job


def _mark_done(db: Session, job_id: int) -> None:
    job = db.get(Job, job_id)
    if job is None:
        logger.warning("job %s vanished before it could be marked done", job_id)
        return
    job.status = "done"
    job.finished_at = _now()
    job.locked_until = None
    job.last_error = None


def _reschedule(db: Session, job_id: int, error: str) -> None:
    """Park a failed job: back into ``pending`` with a backoff, or ``failed``."""
    job = db.get(Job, job_id)
    if job is None:
        logger.warning("job %s vanished before it could be rescheduled", job_id)
        return
    job.last_error = error[:2000]
    job.locked_until = None
    if job.attempts >= MAX_ATTEMPTS:
        job.status = "failed"
        job.finished_at = _now()
        logger.error(
            "job %s failed permanently after %d attempt(s): %s", job_id, job.attempts, error
        )
        return
    delay = min(RESCHEDULE_BASE_SECONDS * 2 ** (job.attempts - 1), RESCHEDULE_MAX_SECONDS)
    job.status = "pending"
    job.run_after = _now() + timedelta(seconds=delay)
    logger.warning(
        "job %s failed on attempt %d — retrying in %ds: %s", job_id, job.attempts, delay, error
    )


def process_job(job: ClaimedJob) -> bool:
    """Run one claimed job; mark it done or reschedule it after a failure."""
    handler = HANDLERS.get(job.kind)
    try:
        if handler is None:
            raise ValueError(f"unknown job kind {job.kind!r}")
        with session_scope() as db:
            handler(db, job.payload)
    except Exception as exc:
        logger.exception("job %s (%s) failed on attempt %d", job.id, job.kind, job.attempts)
        with session_scope() as db:
            _reschedule(db, job.id, str(exc))
        return False
    with session_scope() as db:
        _mark_done(db, job.id)
    logger.info("job %s (%s) finished", job.id, job.kind)
    return True


class PeriodicScheduler:
    """Enqueues the worker's periodic jobs at most once per interval.

    The worker is the one owner of ``recompute_hot`` and ``cleanup_sessions``:
    nothing else enqueues them, so the schedule lives exactly here. A kind that
    has never run is due immediately.
    """

    def __init__(
        self,
        jobs: Sequence[tuple[str, float]] = PERIODIC_JOBS,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._intervals: dict[str, float] = dict(jobs)
        self._last_enqueued: dict[str, float | None] = dict.fromkeys(self._intervals)
        self._clock = clock

    def due_kinds(self) -> list[str]:
        now = self._clock()
        return [
            kind
            for kind, interval in self._intervals.items()
            if self._last_enqueued[kind] is None or now - self._last_enqueued[kind] >= interval
        ]

    def enqueue_due(self, db: Session) -> list[str]:
        """Append every due periodic job to the queue inside the caller's transaction."""
        due: list[str] = []
        for kind in self.due_kinds():
            enqueue_job(db, kind, {})
            self._last_enqueued[kind] = self._clock()
            due.append(kind)
            logger.info("enqueued periodic job %s", kind)
        return due


def _install_signal_handlers(stopping: threading.Event) -> None:
    """Stop gracefully on SIGINT/SIGTERM: finish the running job, then leave."""

    def _handle(signum: int, frame: object) -> None:
        logger.info("received signal %s — finishing the current job and stopping", signum)
        stopping.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle)
        except (ValueError, OSError):  # not the main thread / signal not supported
            logger.debug("cannot install a handler for signal %s", sig)


def run_worker(
    *,
    poll_interval: float | None = None,
    max_iterations: int | None = None,
    scheduler: PeriodicScheduler | None = None,
    install_signal_handlers: bool = True,
) -> None:
    """Run the claim loop until a signal arrives (or ``max_iterations`` runs out).

    The keyword parameters exist for tests and embedding; ``run_worker()`` is the
    production entry point.
    """
    settings = get_settings()  # a missing DATABASE_URL fails here, at once
    interval = (
        float(settings.worker_poll_interval_seconds)
        if poll_interval is None
        else max(0.0, float(poll_interval))
    )
    stopping = threading.Event()
    if install_signal_handlers:
        _install_signal_handlers(stopping)

    logger.info("worker %s starting (poll interval %.1fs)", WORKER_ID, interval)
    if not wait_for_database(should_stop=stopping.is_set):
        logger.info("worker %s stopped before the database was ready", WORKER_ID)
        return
    logger.info("worker %s ready: database %s answers", WORKER_ID, _database_label())

    active_scheduler = scheduler if scheduler is not None else PeriodicScheduler()
    iterations = 0
    while not stopping.is_set():
        if max_iterations is not None and iterations >= max_iterations:
            break
        iterations += 1

        with session_scope() as db:
            active_scheduler.enqueue_due(db)

        claimed: ClaimedJob | None = None
        with session_scope() as db:
            job = claim_next_job(db)
            if job is not None:
                claimed = ClaimedJob(
                    id=job.id,
                    kind=job.kind,
                    payload=dict(job.payload or {}),
                    attempts=job.attempts,
                )
        if claimed is not None:
            logger.info(
                "claimed job %s (%s), attempt %d", claimed.id, claimed.kind, claimed.attempts
            )
            process_job(claimed)
            continue
        if stopping.wait(interval):
            break
    logger.info("worker %s stopped after %d iteration(s)", WORKER_ID, iterations)


def main() -> None:
    """Process entry point: configure logging and run the loop."""
    logging.basicConfig(
        level=os.environ.get("WORKER_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        run_worker()
    except KeyboardInterrupt:
        logger.info("worker %s interrupted", WORKER_ID)
    except RuntimeError as exc:
        logger.error("worker %s cannot start: %s", WORKER_ID, exc)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
