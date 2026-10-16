# Community-Forum

Ein vollständiges Community-Forum als verteiltes Produkt aus eigenständig startbaren Diensten: eine REST-API
(Python, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic) auf PostgreSQL, ein separater Worker-Prozess, der Jobs
aus einer Job-Tabelle mit `FOR UPDATE SKIP LOCKED` abarbeitet (Benachrichtigungen, Hot-Ranking, Aufräumen
abgelaufener Sitzungen), ein Forum-Frontend (Vite + React + TypeScript) und ein eigenes Admin-Panel (Vite +
React + TypeScript, eigener Port). Ein gemeinsames Python-Paket hält die SQLAlchemy-Modelle, die
Pydantic-Schemas und die Datenbank-Session für API und Worker. Das Produkt deckt Konten mit Argon2-Hashing,
kurzlebigem Access-Token und rotierendem Refresh-Token im httpOnly-Cookie, Rollen (Nutzer, Moderator,
Administrator) mit serverseitiger Durchsetzung, Sperren, Kategorien, Threads mit bereinigtem Markdown und
Schlagwörtern, verschachtelte Kommentare bis Tiefe 5, Stimmen und Karma, die Sortierungen neu/top/hot mit
Zeitverfall, PostgreSQL-Volltextsuche, Abonnements, @-Erwähnungen, Benachrichtigungen mit Ungelesen-Zähler,
Meldungen, Ratenbegrenzung, Moderationswerkzeuge und ein Audit-Log ab.

## Tech-Stack

- **Sprache**: Python 3.12+ für API und Worker, TypeScript für Forum und Admin-Panel
- **API**: FastAPI mit Pydantic v2 und SQLAlchemy 2.0, Alembic für Migrationen
- **Datenbank**: PostgreSQL 18 (echte Datenbank, kein SQLite — auch nicht in Tests)
- **Worker**: eigener Python-Prozess, Job-Tabelle mit `FOR UPDATE SKIP LOCKED`
- **Frontend**: Vite + React + TypeScript, zwei getrennte Apps (Forum und Admin-Panel) mit eigenem Port
- **Sicherheit**: Argon2-Passwort-Hashing, kurzlebiges JWT-Access-Token, rotierendes Refresh-Token im
  httpOnly-Cookie
- **Tests**: pytest + FastAPI-TestClient gegen PostgreSQL für API und Worker; Vitest + Testing Library für
  Forum und Admin-Panel
- **Start**: `RUN.json` als Startvertrag; eine dokumentierte Anweisung startet das gesamte Produkt

## Dienste

| Dienst   | Verzeichnis | Stack             | Port | Beschreibung                                        |
| -------- | ----------- | ----------------- | ---- | --------------------------------------------------- |
| `shared` | `shared/`   | Python (Bibliothek) | –    | Modelle, Schemas, Datenbank-Session, Jobs, Markdown |
| `api`    | `backend/`  | Python (FastAPI)  | 8000 | REST-API                                            |
| `worker` | `worker/`   | Python            | –    | Job-Verarbeitung im Hintergrund                     |
| `web`    | `frontend/` | Vite + React      | 5173 | Forum                                               |
| `admin`  | `admin/`    | Vite + React      | 5174 | Admin-Panel                                         |

## Voraussetzungen

- Python 3.12 oder neuer
- Node.js 20 oder neuer (für Forum und Admin-Panel)
- Docker (für die PostgreSQL-Entwicklungsdatenbank) oder eine erreichbare PostgreSQL-18-Instanz
- GNU Make ist nicht erforderlich; alle Befehle stehen unten einzeln

## Installation

```bash
# 1. PostgreSQL starten (Docker, nur beim ersten Mal dauerhaft; Daten im Volume db-data)
docker compose up -d db

# 2. API und Worker installieren (shared wird als editierbares Paket mitinstalliert)
cd backend
pip install -r requirements.txt
cd ../worker
pip install -r requirements.txt

# 3. Forum und Admin-Panel installieren
cd ../frontend && npm install
cd ../admin && npm install
```

## Starten in der Entwicklung

### Gesamtes Produkt — ein Befehl

Ein einziger Befehl startet das komplette Produkt: die Datenbank, das gemeinsame Paket `shared` (als
editierbare Abhängigkeit), die API, den Worker sowie Forum und Admin-Panel.

```bash
./dev.sh
```

Das Skript `dev.sh` im Projektwurzelverzeichnis startet zunächst PostgreSQL (`docker compose up -d db`),
wartet auf die Bereitschaft der Datenbank, installiert alle Abhängigkeiten und startet danach API, Worker,
Forum und Admin-Panel. Danach erreichbar:

| Dienst            | Adresse                              |
| ----------------- | ------------------------------------ |
| Forum (`web`)     | http://localhost:5173                |
| Admin-Panel       | http://localhost:5174                |
| API (`api`)       | http://localhost:8000/api/health     |

Mit `Ctrl+C` werden API, Worker und beide Dev-Server beendet; den Datenbank-Container stoppt man separat mit
`docker compose down`. Alle Zugangsdaten (Datenbank, flüchtiges `JWT_SECRET`, CORS-Herkünfte,
`VITE_API_BASE_URL`) setzt das Skript selbst — es ist keine manuelle Konfiguration nötig. Für eigene Werte
können die Variablen aus der Tabelle unten vor dem Aufruf exportiert werden.

### Alternativ: Dienste einzeln in Terminals

`RUN.json` im Projektwurzelverzeichnis ist der Startvertrag: Er beschreibt für jeden Dienst den Installations-,
Start- und Testbefehl, den Port, den Health-Pfad und alle Umgebungsvariablen. Ein Runner, der diese Datei liest
(z. B. die Prüfung `python _office_run_check.py`), startet damit das gesamte Produkt. Sind alle Dienste
installiert, lässt es sich so in fünf Terminals betreiben — genau in dieser Reihenfolge:

```bash
# Terminal 1 — Datenbank
docker compose up -d db

# Terminal 2 — API (legt beim Start das Schema automatisch an)
cd backend
export DATABASE_URL=postgresql://app@localhost:5432/app
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
export FRONTEND_ORIGIN=http://localhost:5173
export ADMIN_ORIGIN=http://localhost:5174
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 3 — Worker
cd worker
export DATABASE_URL=postgresql://app@localhost:5432/app
python main.py

# Terminal 4 — Forum
cd frontend
export VITE_API_BASE_URL=http://localhost:8000
npm run dev          # http://localhost:5173

# Terminal 5 — Admin-Panel
cd admin
export VITE_API_BASE_URL=http://localhost:8000
npm run dev          # http://localhost:5174
```

`GET http://localhost:8000/api/health` antwortet `{"status":"ok","db":"ok"}`, sobald die API bereit ist.
Die API führt beim Start die Alembic-Migrationen automatisch aus, eine frische Datenbank ist sofort nutzbar.

### Einzelne Dienste

Jeder Dienst ist eigenständig startbar: die API mit dem `uvicorn`-Befehl oben, der Worker mit dem in
`RUN.json` deklarierten Befehl (`python main.py` im Verzeichnis `worker/`), das Forum mit `npm run dev` in
`frontend/`, das Admin-Panel mit `npm run dev` in `admin/` und PostgreSQL mit `docker compose up -d db`.
Die API ist ohne Worker lauffähig (nur Benachrichtigungen, Hot-Ranking und das Aufräumen laufen dann nicht),
der Worker wartet auf die Datenbank und das Schema der API.

## Bauen für Produktion

```bash
# Forum und Admin-Panel als statische Dateien nach frontend/dist bzw. admin/dist
cd frontend && npm run build
cd ../admin && npm run build
```

Die API und der Worker laufen direkt aus dem Python-Code (kein Build-Schritt). Für den Produktivbetrieb die
statischen Verzeichnisse über einen Webserver ausliefern und `VITE_API_BASE_URL` beim Build auf die echte
API-Adresse setzen.

## Konfiguration (Umgebungsvariablen)

| Variable                      | Standard (Entwicklung)             | Bedeutung                                                                 |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                | – (erforderlich)                   | PostgreSQL-Verbindung, z. B. `postgresql://app@localhost:5432/app`        |
| `JWT_SECRET`                  | wird sonst flüchtig erzeugt        | Signaturschlüssel der Access-Tokens; pro Lauf gesetzt (nie im Repo)       |
| `ACCESS_TOKEN_TTL_SECONDS`    | `900`                              | Lebensdauer des Access-Tokens in Sekunden                                 |
| `REFRESH_TOKEN_TTL_DAYS`      | `14`                               | Lebensdauer des Refresh-Tokens in Tagen                                   |
| `WORKER_POLL_INTERVAL_SECONDS`| `5`                                | Pausenzeit des Workers zwischen zwei Job-Abfragen                         |
| `FRONTEND_ORIGIN`             | `http://localhost:5173`            | erlaubte Browser-Herkunft des Forums (CORS)                               |
| `ADMIN_ORIGIN`                | `http://localhost:5174`            | erlaubte Browser-Herkunft des Admin-Panels (CORS)                         |
| `ADMIN_PASSWORD`              | –                                  | nur für `scripts.create_admin`: Startpasswort des ersten Administrators   |
| `VITE_API_BASE_URL`           | `http://localhost:8000`            | Basisadresse der API für Forum und Admin-Panel                            |

## Erste Schritte: Administrator und Demo-Daten

```bash
# Ersten Administrator anlegen (einmalig; Passwort kommt aus ADMIN_PASSWORD)
cd backend
export DATABASE_URL=postgresql://app@localhost:5432/app
export ADMIN_PASSWORD='<IhrWunschPasswort>'
python -m scripts.create_admin --email admin@forum.test --username admin

# Demo-Inhalte einspielen (Kategorien, Threads, Kommentare, Stimmen, Demo-Zugänge)
python -m scripts.seed
```

Demo-Zugänge nach dem Seed — Passwort für alle: `Demo1234!`

| E-Mail                | Rolle     |
| --------------------- | --------- |
| `admin@forum.test`     | admin     |
| `moderator@forum.test` | moderator |
| `demo@forum.test`      | user      |

## Verwendung

### Forum (`frontend/`, Port 5173)

- **Registrierung und Anmeldung**: Konto mit Benutzername, E-Mail und Passwort anlegen; danach anmelden. Die
  Sitzung bleibt nach dem Neuladen der Seite erhalten.
- **Startseite**: Kategorien und Thread-Listen, sortierbar nach **neu**, **top** und **hot**, seitenblätterbar.
- **Thread-Seite**: Markdown-Inhalt (bereinigt gerendert), Schlagwörter, Abstimmung, Abonnieren, Kommentare.
  Kommentare sind verschachtelt bis Tiefe 5; eigene Inhalte lassen sich bearbeiten und löschen.
- **Suchen**: Volltextsuche über Titel und Text, filterbar nach Kategorie und Schlagwort.
- **Benachrichtigungen**: Glocke mit Ungelesen-Zähler; Antworten, Erwähnungen und neue Kommentare in
  abonnierten Threads erscheinen in der Liste und lassen sich als gelesen markieren.
- **Profil**: eigene Bio bearbeiten, Passwort ändern; öffentliche Profilseiten zeigen Bio, Karma, Threads und
  Kommentare.
- **Melden**: fremde Threads und Kommentare mit Grund melden.
- **Design**: heller und dunkler Modus, responsive; die Wahl bleibt nach dem Neuladen erhalten.

### Admin-Panel (`admin/`, Port 5174)

Das Admin-Panel hat eine eigene Anmeldung (es übernimmt keine Sitzung aus dem Forum) und einen Link zurück
zum Forum.

- **Dashboard**: Nutzer-, Thread- und Kommentarzahlen für heute und die letzten 7 Tage sowie offene Meldungen.
- **Nutzerverwaltung**: Suche, Rollenwechsel, Sperren mit Grund und optionalem Ablaufdatum, Entsperren.
- **Kategorien**: anlegen, bearbeiten und per Reihenfolge sortieren — sofort im Forum sichtbar.
- **Moderations-Warteschlange**: gemeldete Inhalte entfernen oder Meldungen verwerfen.
- **Audit-Log**: jede Moderations- und Admin-Aktion mit Akteur, Aktion, Ziel und Zeitpunkt.

Moderator und Administrator können Threads außerdem anheften, sperren, in eine andere Kategorie verschieben
und entfernen; ein gesperrter Thread nimmt keine neuen Kommentare mehr an.

### REST-API (`backend/`, Port 8000)

Alle Endpunkte liegen unter `/api`, sprechen JSON und erwarten bei geschützten Aufrufen den Header
`Authorization: Bearer <access_token>`. Das Refresh-Token liegt im httpOnly-Cookie `refresh_token`
(Pfad `/api/auth`, `SameSite=Lax`); jeder Refresh rotiert das Cookie und macht das vorherige Token ungültig.

| Methode | Pfad                                     | Body / Parameter                                          | Antwort                              |
| ------- | ---------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| GET     | `/api/health`                            | –                                                         | `{"status":"ok","db":"ok"}`          |
| POST    | `/api/auth/register`                     | `{username,email,password}`                               | `201` `UserOut`                      |
| POST    | `/api/auth/login`                        | `{email,password}`                                        | `200` Tokenteil + `Set-Cookie`       |
| POST    | `/api/auth/refresh`                      | Cookie `refresh_token`                                    | `200` Tokenteil + rotiertes Cookie   |
| POST    | `/api/auth/logout`                       | Cookie `refresh_token`                                    | `204`                                |
| POST    | `/api/auth/password`                     | `{current_password,new_password}`                         | `204`                                |
| GET     | `/api/me`                                | –                                                         | `UserOut`                            |
| PATCH   | `/api/me`                                | `{bio?}`                                                  | `UserOut`                            |
| GET     | `/api/users/{username}`                  | –                                                         | `PublicProfile`                      |
| GET     | `/api/categories`                        | –                                                         | `CategoryOut[]`                      |
| POST    | `/api/admin/categories`                  | `{name,description,slug,position?}`                       | `201` `CategoryOut`                  |
| PATCH   | `/api/admin/categories/{id}`             | `{name?,description?,position?}`                          | `CategoryOut`                        |
| DELETE  | `/api/admin/categories/{id}`             | –                                                         | `204`                                |
| PUT     | `/api/admin/categories/order`            | `{ids:[int]}`                                             | `CategoryOut[]`                      |
| POST    | `/api/threads`                           | `{category_id,title,body_markdown,tags:[str]}`            | `201` `ThreadDetail`                 |
| GET     | `/api/threads`                           | `?category=<slug>&sort=new\|top\|hot&tag=<tag>&page&page_size` | `Page[ThreadSummary]`           |
| GET     | `/api/threads/{id}`                      | –                                                         | `ThreadDetail`                       |
| PATCH   | `/api/threads/{id}`                      | `{title?,body_markdown?,tags?}`                           | `ThreadDetail`                       |
| DELETE  | `/api/threads/{id}`                      | –                                                         | `204`                                |
| GET     | `/api/threads/{id}/comments`             | `?page&page_size`                                         | `Page[CommentNode]`                  |
| POST    | `/api/threads/{id}/comments`             | `{body_markdown,parent_id?}`                              | `201` `CommentNode`                  |
| PATCH   | `/api/comments/{id}`                     | `{body_markdown}`                                         | `CommentNode`                        |
| DELETE  | `/api/comments/{id}`                     | –                                                         | `204`                                |
| PUT     | `/api/threads/{id}/vote`                 | `{value:1\|-1\|0}`                                        | `{"score":int,"my_vote":int}`        |
| PUT     | `/api/comments/{id}/vote`                | `{value:1\|-1\|0}`                                        | `{"score":int,"my_vote":int}`        |
| GET     | `/api/threads/{id}/subscription`         | –                                                         | `{"subscribed":bool}`                |
| POST    | `/api/threads/{id}/subscription`         | –                                                         | `204`                                |
| DELETE  | `/api/threads/{id}/subscription`         | –                                                         | `204`                                |
| GET     | `/api/notifications`                     | `?unread_only=bool&page&page_size`                        | `Page[NotificationOut]`              |
| GET     | `/api/notifications/unread-count`        | –                                                         | `{"count":int}`                      |
| POST    | `/api/notifications/read`                | `{ids?:[int]}`                                            | `204`                                |
| POST    | `/api/reports`                           | `{content_type,content_id,reason,note?}`                  | `201` `ReportOut`                    |
| GET     | `/api/admin/reports`                     | `?status=open\|all&page&page_size`                        | `Page[ReportOut]`                    |
| POST    | `/api/admin/reports/{id}/resolve`        | `{action:"remove_content"\|"dismiss"}`                    | `ReportOut`                          |
| POST    | `/api/admin/users/{id}/ban`              | `{reason,expires_at?}`                                    | `UserAdmin`                          |
| DELETE  | `/api/admin/users/{id}/ban`              | –                                                         | `UserAdmin`                          |
| PATCH   | `/api/admin/users/{id}/role`             | `{role}`                                                  | `UserAdmin`                          |
| GET     | `/api/admin/users`                       | `?q=&role=&page&page_size`                                | `Page[UserAdmin]`                    |
| POST    | `/api/admin/threads/{id}/pin`            | `{pinned:bool}`                                           | `ThreadSummary`                      |
| POST    | `/api/admin/threads/{id}/lock`           | `{locked:bool}`                                           | `ThreadSummary`                      |
| POST    | `/api/admin/threads/{id}/move`           | `{category_id:int}`                                       | `ThreadSummary`                      |
| DELETE  | `/api/admin/threads/{id}`                | –                                                         | `204`                                |
| GET     | `/api/admin/stats`                       | –                                                         | `AdminStats`                         |
| GET     | `/api/admin/audit-log`                   | `?page&page_size`                                         | `Page[AuditEntry]`                   |
| GET     | `/api/search`                            | `?q=&category=<slug>&tag=&page&page_size`                 | `Page[ThreadSummary]`                |

Beispiel — anmelden und einen Thread anlegen:

```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@forum.test","password":"Demo1234!"}'
# {"access_token":"eyJ…","token_type":"bearer","expires_in":900,"user":{…}}

curl -s -X POST http://localhost:8000/api/threads \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJ…' \
  -d '{"category_id":1,"title":"Hallo Forum","body_markdown":"**Erster** Beitrag.","tags":["vorstellung"]}'
# {"id":1,"title":"Hallo Forum","body_html":"<p><strong>Erster</strong> Beitrag.</p>",…}
```

#### Fehlerformat

Jede Fehlerantwort hat dieselbe Form; Validierungsfehler antworten mit `422`:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid",
    "fields": { "password": "String should have at least 8 characters" }
  }
}
```

Verwendete Statuscodes: `400`, `401`, `403`, `404`, `409`, `422`, `429` (mit `Retry-After`-Header in
Sekunden). Rollen sind `user`, `moderator` und `admin` und werden immer serverseitig geprüft;
Endpunkte unter `/api/admin` verlangen Moderator oder Administrator. Ein gesperrter Nutzer darf weiterhin
lesen, aber nicht schreiben, abstimmen oder melden (`403`).

#### Seitenblätterung

Jeder Listen-Endpunkt nimmt `page` (1-basiert, Standard 1) und `page_size` (Standard 20, Maximum 100) und
antwortet:

```json
{ "items": [], "total": 0, "page": 1, "page_size": 20, "pages": 0 }
```

## Tests

```bash
# API (gegen eine isolierte PostgreSQL-Testdatenbank, Datenbank erforderlich)
cd backend && PYTHONPATH=. pytest

# Worker
cd worker && PYTHONPATH=. pytest

# Gemeinsames Paket
cd shared && PYTHONPATH=. pytest

# Forum und Admin-Panel
cd frontend && npm test
cd admin && npm test
```

## Projektstruktur

```
RUN.json          Startvertrag aller Dienste (Ports, Health-Pfade, Umgebungsvariablen)
compose.yaml      PostgreSQL für die lokale Entwicklung
shared/           Modelle, Schemas, Datenbank-Session, Jobs, Markdown (Bibliothek)
backend/          FastAPI-App, Router, Sicherheit, Alembic-Migrationen, Skripte, Tests
worker/           Job-Schleife und Job-Handler
frontend/         Forum (Vite + React + TypeScript)
admin/            Admin-Panel (Vite + React + TypeScript)
```

## Funktionen

- Konten mit Argon2-Hashing, kurzlebigem Access-Token und rotierendem Refresh-Token im httpOnly-Cookie
- Rollen `user`, `moderator`, `admin` mit serverseitiger Durchsetzung; Sperren mit Ablaufdatum
- Kategorien mit Name, Beschreibung und Sortierreihenfolge
- Threads mit Titel, bereinigtem Markdown und Schlagwörtern; Bearbeiten mit „bearbeitet“-Kennzeichnung,
  Löschen mit sichtbarem Grundgerüst
- Verschachtelte Kommentare bis Tiefe 5
- Stimmen und Karma (eine Stimme pro Nutzer und Inhalt, Umschalten verschiebt um zwei)
- Sortierung neu/top/hot mit Zeitverfall, berechnet vom Worker
- PostgreSQL-Volltextsuche über Titel und Text, filterbar nach Kategorie und Schlagwort
- Abonnements, @-Erwähnungen und Benachrichtigungen mit Ungelesen-Zähler
- Meldungen und Moderations-Warteschlange
- Ratenbegrenzung für Schreibvorgänge (`429` mit `Retry-After`)
- Moderationswerkzeuge: anheften, sperren, verschieben, entfernen
- Admin-Dashboard, Nutzerverwaltung, Kategorienverwaltung, Audit-Log
- Zwei Oberflächen mit hellem und dunklem Modus, responsiv, mit eigener Anmeldung
