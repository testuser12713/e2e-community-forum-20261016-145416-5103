"""Handler of the ``recompute_hot`` job: refresh the threads' hot ranking.

The worker is the ONE writer of ``Thread.hot_score``: the API's listing only
reads the column for ``sort=hot`` and never computes or writes it. This handler
recomputes the column for every visible (non-deleted) thread from its cached
``score`` and its age, using the same Reddit-style formula the seed uses so that
a seeded thread and a worker-updated one stay comparable:

    hot = sign(score) * log10(max(|score|, 1)) + epoch_seconds(created_at) / DIVISOR

The logarithm keeps a huge score from running away with the list on its own and
the age term makes an older thread rank below a newer one with the same votes, so
a recently created, well-upvoted thread stands above an old, barely-voted one.

The rows are walked by ascending id in bounded batches and the transaction is
committed after each batch, so a forum with many threads never holds one huge
lock or transaction.
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from shared.models import Thread

logger = logging.getLogger("worker")

#: Reddit-style decay constant: a day of age costs about the same as a two-fold
#: drop in votes. Bigger values let older threads stay near the top longer. It is
#: deliberately the same value the seed uses so both rank a thread identically.
HOT_SCORE_DIVISOR = 45000.0

#: The epoch the age term is measured from (Reddit's convention).
HOT_SCORE_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

#: How many threads are recomputed per transaction before the batch is committed.
BATCH_SIZE = 500


def compute_hot_score(score: int, created_at: datetime) -> float:
    """A thread's hot score: the log of its votes, shifted by its creation age.

    A newer thread with more votes ranks above an older one with fewer; the log
    keeps a huge score from running away with the list on its own, while the age
    term makes the score decay relative to younger content.
    """
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    order = math.log10(max(abs(score), 1))
    sign = 0 if score == 0 else (1 if score > 0 else -1)
    seconds = (created_at - HOT_SCORE_EPOCH).total_seconds()
    return round(order * sign + seconds / HOT_SCORE_DIVISOR, 6)


def handle_recompute_hot(db: Session, payload: dict[str, Any]) -> None:
    """Recompute the hot score of every non-deleted thread, in committed batches.

    The payload is empty. The walk is keyed on ``Thread.id`` so it never misses a
    row and never re-reads one, and each batch is committed before the next one is
    fetched. Threads that change while the job runs are simply picked up by the
    next periodic run; the order of the listing stays coherent either way.
    """
    last_id = 0
    updated = 0
    while True:
        rows = db.execute(
            select(Thread.id, Thread.score, Thread.created_at)
            .where(Thread.deleted.is_(False), Thread.id > last_id)
            .order_by(Thread.id)
            .limit(BATCH_SIZE)
        ).all()
        if not rows:
            break
        for thread_id, score, created_at in rows:
            db.execute(
                update(Thread)
                .where(Thread.id == thread_id)
                .values(hot_score=compute_hot_score(score, created_at))
            )
        last_id = rows[-1][0]
        updated += len(rows)
        db.commit()

    logger.info("recomputed the hot score of %d thread(s)", updated)
