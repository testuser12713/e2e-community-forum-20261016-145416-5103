"""Seed command: fill an empty database with realistic demo content.

Run it from ``backend/`` as::

    python -m scripts.seed

The command is idempotent: a database that already carries the demo accounts is
left untouched, so running it a second time changes nothing. It is a manual
command — it is deliberately NOT wired into the API's startup and must never be
executed by the test suite (the tests call :func:`seed_database` directly against
the isolated test database instead).

The seed writes the rows the product needs to look alive before the worker has
ever run: categories in their display order, one demo account per role, dozens of
threads spread over the last days, nested comment trees, votes (so scores and
karma are non-zero), a couple of subscriptions, notifications, one open report
and audit rows. It also computes the hot score for every thread it creates, so
the "hot" listing is meaningful immediately.
"""

from __future__ import annotations

import argparse
import logging
import math
import os
import random
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.security import hash_password
from shared.models import (
    AuditLog,
    Category,
    Comment,
    Notification,
    Report,
    Subscription,
    Thread,
    User,
    Vote,
)

logger = logging.getLogger("scripts.seed")

DEMO_PASSWORD = "Demo1234!"
DEMO_ADMIN_EMAIL = "admin@forum.test"

# A single audit row marks a completed seed run. It is written last, so a run
# that dies halfway is retried in full instead of being mistaken for a finished
# one — and a database seeded any other way is still filled.
SEED_MARKER_ACTION = "seed.complete"

# Reddit-style decay constant: a day of age costs about the same as a two-fold
# drop in votes. Bigger values let older threads stay near the top longer.
HOT_SCORE_DIVISOR = 45000.0

# (username, email, role, bio)
DEMO_USERS: tuple[tuple[str, str, str, str | None], ...] = (
    (
        "admin",
        DEMO_ADMIN_EMAIL,
        "admin",
        "Administratorin dieses Forums. Meldet euch gern bei Fragen.",
    ),
    (
        "moderator",
        "moderator@forum.test",
        "moderator",
        "Moderiert das Forum und hält die Warteschlange kurz.",
    ),
    (
        "demo",
        "demo@forum.test",
        "user",
        "Ich baue kleine Webprojekte mit Python und React.",
    ),
    ("mara", "mara@forum.test", "user", "Datenbanken und Performance sind mein Ding."),
    ("lea", "lea@forum.test", "user", "Backend-Entwicklerin, liebt saubere APIs."),
    ("timo", "timo@forum.test", "user", "Frontend, Vite und alles im Browser."),
    ("jonas", "jonas@forum.test", "user", "CI/CD, Docker und langweilige Deployments."),
    ("sara", "sara@forum.test", "user", "Schreibt Tests, bevor sie Code schreibt."),
)

# (name, slug, description, position)
CATEGORIES: tuple[tuple[str, str, str, int], ...] = (
    ("Backend", "backend", "Server, APIs und alles rund um Python und FastAPI.", 1),
    ("Frontend", "frontend", "Vite, React, TypeScript, CSS und was im Browser läuft.", 2),
    ("Datenbanken", "datenbanken", "PostgreSQL, SQL, Indizes, Migrationen und Performance.", 3),
    ("DevOps", "devops", "Docker, CI/CD, Deployment und der Betrieb.", 4),
    ("Community", "community", "Ankündigungen, Feedback und alles rund um dieses Forum.", 5),
)

# (category_slug, author, title, tags, days_ago, body_markdown)
THREADS: tuple[tuple[str, str, str, tuple[str, ...], int, str], ...] = (
    (
        "backend",
        "lea",
        "FastAPI + SQLAlchemy 2.0: async oder sync — was nutzt ihr in Produktion?",
        ("fastapi", "sqlalchemy"),
        5,
        "AsyncSession sieht in den Docs gut aus, aber eine Sync-Engine mit psycopg3 "
        "läuft überraschend solide und ist deutlich einfacher zu debuggen.\n\n"
        "Wie handhabt ihr das?\n\n"
        "- Nutzt ihr durchgehend `async def`?\n"
        "- Wo sind euch echte Engpässe aufgefallen?\n\n"
        "Ich sammle Erfahrungen aus echten Projekten.",
    ),
    (
        "backend",
        "mara",
        "Argon2 vs. bcrypt in 2026 — was setzt ihr ein?",
        ("security", "python"),
        3,
        "Argon2id ist der Empfehlung nach Standard, aber die Parametrisierung "
        "(Memory, Iterationen, Parallelität) ist nicht trivial.\n\n"
        "Mein Ausgangspunkt: `argon2-cffi` mit den Defaults. Was fahrt ihr für Werte "
        "und wie messt ihr die Kosten pro Login?",
    ),
    (
        "backend",
        "timo",
        "Wie strukturiert ihr große FastAPI-Projekte?",
        ("fastapi", "architektur"),
        6,
        "Ein Router pro Ressource ist klar. Aber wo lasst ihr Business-Logik liegen?\n\n"
        "Ich schwanke zwischen `services/` und Methoden auf den Modellen. "
        "Was hat sich bei euch bewährt?",
    ),
    (
        "backend",
        "jonas",
        "Pydantic v2: Performance-Tipps für große Modelle",
        ("pydantic", "performance"),
        4,
        "Bei vielen verschachtelten Modellen merkt man den Validierungsaufwand.\n\n"
        "Was hilft wirklich?\n\n"
        "1. `model_config` mit `from_attributes`\n"
        "2. Weniger Union-Typen\n"
        "3. `TypeAdapter` statt Modell-Neubauten\n\n"
        "Habt ihr Benchmarks?",
    ),
    (
        "backend",
        "sara",
        "Dependency Injection in FastAPI richtig nutzen",
        ("fastapi",),
        8,
        "Dependencies sind mächtig, aber schnell wächst ein Netz aus Abhängigkeiten.\n\n"
        "Ich trenne gern:\n\n"
        "- `get_db` für die Session\n"
        "- `get_current_user` für Auth\n"
        "- Services als normale Funktionen\n\n"
        "Wie haltet ihr die Router schlank?",
    ),
    (
        "backend",
        "demo",
        "Hintergrundaufgaben mit FastAPI — BackgroundTasks oder Queue?",
        ("fastapi", "worker"),
        2,
        "Kurze Aufgaben lief ich mit `BackgroundTasks` laufen, alles andere kommt in "
        "eine Job-Tabelle, die ein eigener Worker mit `FOR UPDATE SKIP LOCKED` abarbeitet.\n\n"
        "Wo zieht ihr die Grenze?",
    ),
    (
        "backend",
        "lea",
        "Fehlerbehandlung: ein einheitliches Fehlerformat für die API",
        ("api", "fehler"),
        7,
        "Ein Format für alle Fehler spart im Frontend enorm viel Arbeit:\n\n"
        "```json\n"
        '{"error": {"code": "not_found", "message": "...", "fields": {}}}\n'
        "```\n\n"
        "So muss das Formular nur `fields` lesen und die Meldung am richtigen Feld "
        "anzeigen.",
    ),
    (
        "backend",
        "timo",
        "WebSockets im Forum — lohnt sich das?",
        ("fastapi", "websocket"),
        11,
        "Live-Benachrichtigungen klingen verlockend, kosten aber eine dauerhafte "
        "Verbindung pro Nutzer.\n\n"
        "Reicht ein Polling alle paar Sekunden für den Ungelesen-Zähler?",
    ),
    (
        "frontend",
        "timo",
        "Vite HMR bricht im Monorepo ab — Lösung mit einem shared tsconfig",
        ("vite", "typescript"),
        1,
        "Nach dem Umbau auf Workspaces hat der Dev-Server die Änderungen im shared "
        "Paket nicht mehr gesehen.\n\n"
        "Die Lösung war ein gemeinsames `tsconfig.base.json` plus "
        "`optimizeDeps.exclude` für das lokale Paket.",
    ),
    (
        "frontend",
        "mara",
        "React 19: Was ändert sich für euch?",
        ("react",),
        4,
        "Neue Hooks und kleinere Bundles — aber auch ein paar Verhaltensänderungen.\n\n"
        "Was hat bei euch die Migration ausgelöst und was war überraschend?",
    ),
    (
        "frontend",
        "lea",
        "State-Management 2026: Context, Zustand oder Redux?",
        ("react", "state"),
        9,
        "Für Auth und Theme reicht Context. Für serverseitige Daten nehme ich lieber "
        "einen Query-Cache als einen globalen Store.\n\n"
        "Wann greift ihr zu Redux?",
    ),
    (
        "frontend",
        "sara",
        "Barrierefreiheit im Forum — wo fange ich an?",
        ("a11y", "css"),
        5,
        "Kontrast, Fokus-Ringe und semantische Überschriften bringen am meisten.\n\n"
        "Ein guter Anfang:\n\n"
        "1. Mit der Tastatur durchklicken\n"
        "2. `aria-live` für Fehlermeldungen\n"
        "3. Nie Farbe allein als Signal",
    ),
    (
        "frontend",
        "jonas",
        "Tailwind 4 vs. handgeschriebenes CSS",
        ("css", "tailwind"),
        3,
        "Utility-Klassen sind schnell, aber ein Design-System braucht Tokens.\n\n"
        "Ich kombiniere: Tokens als CSS-Variablen, Layout mit Utilities.",
    ),
    (
        "frontend",
        "demo",
        "Barrierefreie Formulare: Fehlermeldungen richtig anbinden",
        ("a11y", "formular"),
        2,
        "Ein Formular startet neutral und zeigt Fehler erst nach dem Absenden oder "
        "sobald ein Feld berührt wurde.\n\n"
        "Die Meldung gehört mit `aria-describedby` an das Feld gebunden, nicht nur "
        "darunter geschrieben.",
    ),
    (
        "datenbanken",
        "mara",
        "PostgreSQL Indizes richtig einsetzen — ein Leitfaden mit EXPLAIN ANALYZE",
        ("postgresql", "index"),
        3,
        "Bevor irgendein Index angelegt wird: messen.\n\n"
        "`EXPLAIN (ANALYZE, BUFFERS)` zeigt, ob wirklich ein Seq Scan statt eines "
        "Index Scan läuft. Steht dort ein Seq Scan auf einer großen Tabelle, lohnt "
        "sich der Blick.\n\n"
        "- Composite statt vieler Einzelindizes\n"
        "- Ein Teilindex kann bei `WHERE deleted = false` viel kleiner sein\n"
        "- `pg_stat_user_indexes` zeigt ungenutzte Indizes\n\n"
        "Wie geht ihr vor? Nutzt ihr `pg_stat_statements`?",
    ),
    (
        "datenbanken",
        "timo",
        "Alembic-Migrationen im Team sauber halten — Namenskonvention als Basis",
        ("alembic", "postgresql"),
        5,
        "Ohne feste `naming_convention` erzeugt Alembic für Constraints Namen, die "
        "sich von Umgebung zu Umgebung unterscheiden können.\n\n"
        "Eine gemeinsame `MetaData`-Konvention verhindert genau das.",
    ),
    (
        "datenbanken",
        "lea",
        "Full-Text-Suche in PostgreSQL: tsvector statt LIKE",
        ("postgresql", "suche"),
        6,
        "`LIKE '%wort%'` skaliert nicht. Ein generierter `tsvector` mit GIN-Index "
        "macht aus der Suche eine Sekundenangelegenheit.\n\n"
        "```sql\n"
        "to_tsvector('english', titel || ' ' || text)\n"
        "```\n\n"
        "Bei deutschsprachigem Inhalt lohnt sich die Sprachkonfiguration `german`.",
    ),
    (
        "datenbanken",
        "jonas",
        "N+1-Abfragen finden und beheben",
        ("sqlalchemy", "performance"),
        4,
        "Das Lazy Loading von Beziehungen ist bequem und erzeugt schnell hunderte "
        "kleine Abfragen.\n\n"
        "`selectinload` bzw. `joinedload` lösen das Problem an der Wurzel. Wie "
        "protokolliert ihr die Abfragen im Test?",
    ),
    (
        "datenbanken",
        "sara",
        "FOR UPDATE SKIP LOCKED für eine Job-Queue",
        ("postgresql", "worker"),
        2,
        "Eine Job-Tabelle mit Status und `FOR UPDATE SKIP LOCKED` ist eine "
        "erstaunlich robuste Warteschlange ohne zusätzliche Infrastruktur.\n\n"
        "Wichtig ist ein `locked_until`, damit abgestürzte Worker ihre Jobs wieder "
        "freigeben.",
    ),
    (
        "datenbanken",
        "demo",
        "Zeitzonen in PostgreSQL: timestamptz ist Pflicht",
        ("postgresql",),
        7,
        "Ein `timestamp without time zone` ist eine Falle, sobald Server und "
        "Datenbank in verschiedenen Zonen laufen.\n\n"
        "`timestamptz` speichert den Zeitpunkt eindeutig. Immer.",
    ),
    (
        "devops",
        "lea",
        "Docker Compose für eine lokale Postgres-Instanz — euer Setup?",
        ("docker", "postgresql"),
        4,
        "Healthcheck, Volume und Init-Skripte — ich zeige mein Setup und würde gern "
        "eures sehen.\n\n"
        "Wie stellt ihr sicher, dass die Datenbank beim Start der API wirklich bereit "
        "ist?",
    ),
    (
        "devops",
        "jonas",
        "GitHub Actions: Caching richtig einsetzen",
        ("ci", "github-actions"),
        6,
        "Ein falscher Cache-Key kann mehr schaden als nutzen. Ich cachen den "
        "Lockfile-Hash, nicht den Branch.\n\n"
        "Was sind eure Erfahrungen mit Build-Caches für Vite?",
    ),
    (
        "devops",
        "timo",
        "Umgebungsvariablen vs. Secrets im Deployment",
        ("devops", "security"),
        3,
        "Alles Konfiguration ist, was nicht ins Repository gehört.\n\n"
        "Meine Faustregel: keine echten Werte im Repo, nur Platzhalter — und Secrets "
        "werden beim Start generiert oder aus dem Secret-Store gelesen.",
    ),
    (
        "devops",
        "sara",
        "Backups richtig planen: pg_dump, WAL und Restore-Tests",
        ("postgresql", "backup"),
        5,
        "Ein Backup, das nie zurückgespielt wurde, ist kein Backup.\n\n"
        "Ich teste den Restore regelmäßig gegen eine Wegwerf-Datenbank.",
    ),
    (
        "devops",
        "mara",
        "Zero-Downtime-Deployments mit Alembic",
        ("alembic", "deployment"),
        8,
        "Migrationen müssen abwärtskompatibel sein: erst neue Spalte hinzufügen, "
        "Code deployen, dann alte Spalte entfernen.\n\n"
        "So bleibt während des Deployments jeder Zwischenstand lauffähig.",
    ),
    (
        "community",
        "admin",
        "Willkommen im neuen Forum!",
        ("ankündigung",),
        12,
        "Schön, dass ihr da seid! Dieses Forum ist der Ort für Fragen rund um "
        "Backend, Frontend, Datenbanken und Betrieb.\n\n"
        "Legt los und stellt euch gern im Vorstellungsthread vor.",
    ),
    (
        "community",
        "moderator",
        "Regeln und Netiquette — bitte zuerst lesen",
        ("regeln",),
        12,
        "Damit sich alle wohlfühlen:\n\n"
        "1. Seid freundlich und bleibt beim Thema.\n"
        "2. Keine Werbung ohne Bezug zur Frage.\n"
        "3. Meldet problematische Inhalte, statt euch zu streiten.\n\n"
        "Danke!",
    ),
    (
        "community",
        "demo",
        "Feedback zur neuen Benutzeroberfläche",
        ("feedback", "ui"),
        1,
        "Das neue Forum wirkt aufgeräumt. Zwei Dinge sind mir aufgefallen:\n\n"
        "- Der Ungelesen-Zähler ist super.\n"
        "- Auf dem Handy wäre ein größerer Abstand zwischen den Karten schön.",
    ),
    (
        "community",
        "lea",
        "Feature-Wunsch: Dark Mode pro Kategorie",
        ("feature", "ui"),
        2,
        "Ein globaler Dark Mode ist da. Ich fände es praktisch, die Wahl pro Gerät "
        "zu behalten — habt ihr dazu eine Meinung?",
    ),
    (
        "community",
        "mara",
        "Vorstellungsthread — erzählt von euch",
        ("community",),
        10,
        "Ich fange an: Ich arbeite viel mit PostgreSQL und messe gern Dinge, bevor "
        "ich sie optimiere. Was macht ihr?",
    ),
)

COMMENT_BODIES: tuple[str, ...] = (
    "Guter Punkt — genau das hat bei uns den Ausschlag gegeben.",
    "Ich sehe das etwas anders: Die Einfachheit spart am Ende mehr Zeit als die "
    "theoretische Geschwindigkeit.",
    "Danke fürs Teilen, das probiere ich direkt aus.",
    "Bei uns läuft das seit Monaten stabil, ich kann das nur bestätigen.",
    "Hast du dazu einen Benchmark? Ohne Zahlen ist es schwer einzuschätzen.",
    "Das ist der wichtigste Satz im ganzen Thread.",
    "Kleine Ergänzung: Achte auf die Reihenfolge der Spalten im Index.",
    "Wir hatten genau dasselbe Problem und mit einem Teilindex gelöst.",
    "Ich würde mit der einfachsten Lösung anfangen und erst dann optimieren.",
    "Genau, und `CREATE INDEX CONCURRENTLY` vermeidet die Sperre im Betrieb.",
    "Wie verhält sich das unter Last? Da würde ich gern mehr zu wissen.",
    "Das gehört in die Dokumentation, nicht nur in einen Kommentar.",
    "Bei mir war der Unterschied am Ende messbar, aber kleiner als gedacht.",
    "Stimmt, aber vergiss die Barrierefreiheit nicht.",
    "Ich habe das in einem kleinen Projekt ausprobiert — klappt gut.",
    "Wichtig ist vor allem, dass es für Neue im Team verständlich bleibt.",
    "Danke, das erklärt ein Verhalten, über das ich lange gerätselt habe.",
    "Kann ich bestätigen. Bei uns hat das den Fehler behoben.",
    "@demo genau das meinte ich — danke fürs Zusammenfassen.",
    "Noch eine Frage: Wie testet ihr das automatisiert?",
)


@dataclass
class SeedResult:
    """What one seed run created (or that it was a no-op)."""

    seeded: bool
    users: int = 0
    categories: int = 0
    threads: int = 0
    comments: int = 0
    votes: int = 0
    subscriptions: int = 0
    notifications: int = 0
    reports: int = 0
    audit_entries: int = 0

    @property
    def already_present(self) -> bool:
        return not self.seeded


def is_seeded(db: Session) -> bool:
    """True when a completed seed run left its marker behind."""
    return (
        db.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.action == SEED_MARKER_ACTION)
        )
        > 0
    )


def _get_or_create_user(
    db: Session,
    *,
    username: str,
    email: str,
    role: str,
    bio: str | None,
    password_hash: str,
    created_at: datetime,
) -> User:
    """Reuse a demo account that already exists (e.g. from ``create_admin``)."""
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = db.scalar(select(User).where(User.username == username))
    if user is not None:
        user.role = role
        if bio and not user.bio:
            user.bio = bio
        return user
    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        role=role,
        bio=bio,
        created_at=created_at,
    )
    db.add(user)
    return user


def _get_or_create_category(
    db: Session,
    *,
    name: str,
    slug: str,
    description: str,
    position: int,
    created_at: datetime,
) -> Category:
    """Reuse a category that already exists, identified by slug or name."""
    category = db.scalar(select(Category).where(Category.slug == slug))
    if category is None:
        category = db.scalar(select(Category).where(Category.name == name))
    if category is not None:
        category.position = position
        if description and not category.description:
            category.description = description
        return category
    category = Category(
        name=name,
        slug=slug,
        description=description,
        position=position,
        created_at=created_at,
    )
    db.add(category)
    return category


def compute_hot_score(score: int, created_at: datetime) -> float:
    """A Reddit-style hot score: log of the votes shifted by the creation age.

    A newer thread with more votes ranks above an older one with fewer; the
    log keeps a huge score from running away with the list on its own.
    """
    order = math.log10(max(abs(score), 1))
    sign = 0 if score == 0 else (1 if score > 0 else -1)
    seconds = (created_at - datetime(1970, 1, 1, tzinfo=UTC)).total_seconds()
    return round(order * sign + seconds / HOT_SCORE_DIVISOR, 6)


def seed_database(db: Session, *, now: datetime | None = None) -> SeedResult:
    """Fill an empty database with demo content; a second run changes nothing."""
    if is_seeded(db):
        logger.info("Database already seeded — nothing to do.")
        return SeedResult(seeded=False)

    now = now or datetime.now(UTC)
    rng = random.Random(20261016)

    password_hash = hash_password(DEMO_PASSWORD)

    users: list[User] = []
    for username, email, role, bio in DEMO_USERS:
        users.append(
            _get_or_create_user(
                db,
                username=username,
                email=email,
                role=role,
                bio=bio,
                password_hash=password_hash,
                created_at=now - timedelta(days=30 - rng.randint(0, 5)),
            )
        )
    db.flush()

    users_by_name = {user.username: user for user in users}

    categories: list[Category] = []
    for name, slug, description, position in CATEGORIES:
        categories.append(
            _get_or_create_category(
                db,
                name=name,
                slug=slug,
                description=description,
                position=position,
                created_at=now - timedelta(days=30),
            )
        )
    db.flush()

    categories_by_slug = {category.slug: category for category in categories}

    threads: list[Thread] = []
    for index, (slug, author, title, tags, days_ago, body) in enumerate(THREADS):
        created_at = now - timedelta(days=days_ago, hours=rng.randint(0, 20))
        thread = Thread(
            category=categories_by_slug[slug],
            author=users_by_name[author],
            title=title,
            body_markdown=body,
            tags=list(tags),
            created_at=created_at,
            edited_at=created_at + timedelta(hours=2) if index % 11 == 0 else None,
        )
        if index in (14, 25, 26):  # the index thread and both announcements are pinned
            thread.pinned = True
        if index == 26:  # the rules thread is locked
            thread.locked = True
        threads.append(thread)
    db.add_all(threads)
    db.flush()

    threads_by_title = {thread.title: thread for thread in threads}

    comments: list[Comment] = []
    for thread in threads:
        tree = _build_comment_tree(rng, thread, users, rng.randint(2, 9))
        thread.comment_count = len(tree)
        comments.extend(tree)
    db.add_all(comments)
    db.flush()

    # Votes on threads: every thread gets a handful, mostly upvotes.
    thread_votes: list[Vote] = []
    for thread in threads:
        voters = [user for user in users if user.id != thread.author_id]
        count = rng.randint(1, min(len(voters), 12))
        for voter in rng.sample(voters, count):
            thread_votes.append(
                Vote(
                    user_id=voter.id,
                    thread_id=thread.id,
                    value=1 if rng.random() > 0.15 else -1,
                )
            )
    db.add_all(thread_votes)
    db.flush()

    # Votes on comments, a little sparser.
    comment_votes: list[Vote] = []
    for comment in comments:
        if rng.random() > 0.65:
            continue
        voters = [user for user in users if user.id != comment.author_id]
        count = rng.randint(1, min(len(voters), 5))
        for voter in rng.sample(voters, count):
            comment_votes.append(
                Vote(
                    user_id=voter.id,
                    comment_id=comment.id,
                    value=1 if rng.random() > 0.12 else -1,
                )
            )
    db.add_all(comment_votes)
    db.flush()

    _apply_scores(db, threads, comments)

    # A couple of subscriptions, so the demo user sees activity in subscribed threads.
    subscription_threads = [
        threads_by_title[
            "FastAPI + SQLAlchemy 2.0: async oder sync — was nutzt ihr in Produktion?"
        ],
        threads_by_title[
            "PostgreSQL Indizes richtig einsetzen — ein Leitfaden mit EXPLAIN ANALYZE"
        ],
    ]
    subscriptions = [
        Subscription(user_id=users_by_name["demo"].id, thread_id=thread.id)
        for thread in subscription_threads
    ]
    db.add_all(subscriptions)
    db.flush()

    # Notifications for the demo user: a mention, a reply and a subscription update.
    backend_thread = threads_by_title[
        "FastAPI + SQLAlchemy 2.0: async oder sync — was nutzt ihr in Produktion?"
    ]
    mention_thread = threads_by_title["Barrierefreie Formulare: Fehlermeldungen richtig anbinden"]
    backend_comment = next(c for c in comments if c.thread_id == mention_thread.id)
    notifications = [
        Notification(
            user_id=users_by_name["demo"].id,
            kind="mention",
            thread_id=mention_thread.id,
            comment_id=backend_comment.id,
            actor_id=users_by_name["sara"].id,
            created_at=now - timedelta(minutes=22),
        ),
        Notification(
            user_id=users_by_name["demo"].id,
            kind="reply",
            thread_id=backend_thread.id,
            comment_id=next(c for c in comments if c.thread_id == backend_thread.id).id,
            actor_id=users_by_name["lea"].id,
            created_at=now - timedelta(hours=1),
        ),
        Notification(
            user_id=users_by_name["demo"].id,
            kind="comment",
            thread_id=subscription_threads[0].id,
            actor_id=users_by_name["mara"].id,
            created_at=now - timedelta(hours=3),
            read_at=now - timedelta(hours=2),
        ),
        Notification(
            user_id=users_by_name["demo"].id,
            kind="comment",
            thread_id=subscription_threads[1].id,
            actor_id=users_by_name["timo"].id,
            created_at=now - timedelta(days=1),
        ),
    ]
    db.add_all(notifications)
    db.flush()

    # One open report, so the moderation queue is not empty.
    reported_thread = threads_by_title["Tailwind 4 vs. handgeschriebenes CSS"]
    reports = [
        Report(
            reporter_id=users_by_name["demo"].id,
            content_type="thread",
            content_id=reported_thread.id,
            reason="spam",
            note="Der Thread passt nicht in diese Kategorie.",
            status="open",
            created_at=now - timedelta(minutes=34),
        )
    ]
    db.add_all(reports)
    db.flush()

    audit_entries = _build_audit_rows(db, users_by_name, categories, threads, now)
    # The completion marker is written last: a run that dies halfway is retried
    # in full, and the next successful run is a no-op.
    marker = AuditLog(
        actor_id=None,
        action=SEED_MARKER_ACTION,
        target_type="system",
        target_id=None,
        details='{"source": "scripts.seed"}',
        created_at=now,
    )
    db.add(marker)
    audit_entries = [*audit_entries, marker]
    db.flush()

    result = SeedResult(
        seeded=True,
        users=len(users),
        categories=len(categories),
        threads=len(threads),
        comments=len(comments),
        votes=len(thread_votes) + len(comment_votes),
        subscriptions=len(subscriptions),
        notifications=len(notifications),
        reports=len(reports),
        audit_entries=len(audit_entries),
    )
    db.commit()
    logger.info(
        "Seeded %(threads)d threads, %(comments)d comments, %(votes)d votes across "
        "%(categories)d categories.",
        result.__dict__,
    )
    return result


def _build_comment_tree(
    rng: random.Random, thread: Thread, authors: list[User], max_comments: int
) -> list[Comment]:
    """A deterministic, nested comment tree (depth at most 5) for one thread."""
    created: list[Comment] = []

    def add(parent: Comment | None, depth: int, created_at: datetime) -> None:
        if len(created) >= max_comments or depth > 5:
            return
        comment = Comment(
            thread=thread,
            parent=parent,
            author=rng.choice(authors),
            body_markdown=rng.choice(COMMENT_BODIES),
            depth=depth,
            created_at=created_at,
            edited_at=created_at + timedelta(minutes=15) if rng.random() < 0.08 else None,
        )
        created.append(comment)
        if depth < 5 and rng.random() < 0.55:
            add(comment, depth + 1, created_at + timedelta(minutes=rng.randint(20, 400)))
        if depth < 5 and rng.random() < 0.3:
            add(comment, depth + 1, created_at + timedelta(minutes=rng.randint(20, 400)))

    for _ in range(rng.randint(1, 4)):
        add(None, 1, thread.created_at + timedelta(hours=rng.randint(1, 36)))
    return created


def _apply_scores(db: Session, threads: list[Thread], comments: list[Comment]) -> None:
    """Recompute thread/comment scores, user karma and hot scores from the votes."""
    thread_scores: dict[int, int] = {}
    comment_scores: dict[int, int] = {}
    for vote in db.scalars(select(Vote)).all():
        if vote.thread_id is not None:
            thread_scores[vote.thread_id] = thread_scores.get(vote.thread_id, 0) + vote.value
        elif vote.comment_id is not None:
            comment_scores[vote.comment_id] = comment_scores.get(vote.comment_id, 0) + vote.value

    for thread in threads:
        thread.score = thread_scores.get(thread.id, 0)
        thread.hot_score = compute_hot_score(thread.score, thread.created_at)
    for comment in comments:
        comment.score = comment_scores.get(comment.id, 0)

    karma: dict[int, int] = {}
    for thread in threads:
        karma[thread.author_id] = karma.get(thread.author_id, 0) + thread.score
    for comment in comments:
        karma[comment.author_id] = karma.get(comment.author_id, 0) + comment.score

    authors = {user.id: user for user in db.scalars(select(User)).all()}
    for user_id, value in karma.items():
        if user_id in authors:
            authors[user_id].karma = value
    db.flush()


def _build_audit_rows(
    db: Session,
    users_by_name: dict[str, User],
    categories: list[Category],
    threads: list[Thread],
    now: datetime,
) -> list[AuditLog]:
    """A few moderation/administration actions for the audit log."""
    admin = users_by_name["admin"]
    moderator = users_by_name["moderator"]
    community = next(category for category in categories if category.slug == "community")
    rules_thread = next(thread for thread in threads if thread.title.startswith("Regeln"))
    index_thread = next(
        thread for thread in threads if thread.title.startswith("PostgreSQL Indizes")
    )
    entries = [
        AuditLog(
            actor_id=admin.id,
            action="category.create",
            target_type="category",
            target_id=community.id,
            details='{"slug": "community"}',
            created_at=now - timedelta(days=12),
        ),
        AuditLog(
            actor_id=admin.id,
            action="user.role_change",
            target_type="user",
            target_id=moderator.id,
            details='{"role": "moderator"}',
            created_at=now - timedelta(days=12, hours=1),
        ),
        AuditLog(
            actor_id=moderator.id,
            action="thread.pin",
            target_type="thread",
            target_id=rules_thread.id,
            details='{"pinned": true}',
            created_at=now - timedelta(days=11),
        ),
        AuditLog(
            actor_id=moderator.id,
            action="thread.lock",
            target_type="thread",
            target_id=rules_thread.id,
            details='{"locked": true}',
            created_at=now - timedelta(days=11),
        ),
        AuditLog(
            actor_id=moderator.id,
            action="thread.pin",
            target_type="thread",
            target_id=index_thread.id,
            details='{"pinned": true}',
            created_at=now - timedelta(days=3),
        ),
    ]
    db.add_all(entries)
    return entries


def ensure_schema() -> None:
    """Bring the declared database up to the current schema (idempotent).

    The seed may be the first process to touch an empty database, so it prepares
    the schema the same way the API does on startup. Imported lazily to keep the
    module cheap to import.
    """
    from app.main import run_migrations

    run_migrations()


def main(argv: list[str] | None = None) -> int:
    """Command-line entry point: seed the database declared by DATABASE_URL."""
    parser = argparse.ArgumentParser(description="Fill the database with demo content.")
    parser.add_argument(
        "--no-migrate",
        action="store_true",
        help="skip running Alembic before seeding (the schema must already exist)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if os.environ.get("PYTEST_CURRENT_TEST"):
        print(
            "Refusing to seed: this command must not run inside a test suite. "
            "Call scripts.seed.seed_database(db) from a test instead.",
            file=sys.stderr,
        )
        return 2

    if not args.no_migrate:
        ensure_schema()

    from shared.db import session_scope

    with session_scope() as db:
        result = seed_database(db)

    if result.already_present:
        print("Database already contains the demo content — nothing to do.")
        return 0

    print(
        "Seeded {users} users, {categories} categories, {threads} threads, "
        "{comments} comments, {votes} votes, {subscriptions} subscriptions, "
        "{notifications} notifications, {reports} reports, {audit_entries} audit entries.".format(
            **result.__dict__
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
