#!/usr/bin/env bash
#
# dev.sh — start the whole Community-Forum product for development.
#
# Starts every part the product is made of:
#   db      PostgreSQL 18 (docker compose)
#   api     FastAPI backend      http://localhost:8000
#   worker  background job loop
#   web     forum frontend       http://localhost:5173
#   admin   admin panel          http://localhost:5174
#   shared  installed as an editable dependency (no process of its own)
#
# Usage:  ./dev.sh
# Stop:   Ctrl+C (stops the API, the worker and both dev servers; the
#         database container keeps running — stop it with `docker compose down`).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python}"
DATABASE_URL="${DATABASE_URL:-postgresql://app@localhost:5432/app}"
export DATABASE_URL
export JWT_SECRET="${JWT_SECRET:-$("$PYTHON" -c 'import secrets; print(secrets.token_hex(32))')}"
export ACCESS_TOKEN_TTL_SECONDS="${ACCESS_TOKEN_TTL_SECONDS:-900}"
export REFRESH_TOKEN_TTL_DAYS="${REFRESH_TOKEN_TTL_DAYS:-14}"
export WORKER_POLL_INTERVAL_SECONDS="${WORKER_POLL_INTERVAL_SECONDS:-5}"
export FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-http://localhost:5173}"
export ADMIN_ORIGIN="${ADMIN_ORIGIN:-http://localhost:5174}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8000}"

pids=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "[dev] Shutting down ..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait_for_db() {
  echo "[dev] Waiting for PostgreSQL ..."
  for _ in $(seq 1 60); do
    if "$PYTHON" - "$DATABASE_URL" <<'PY' 2>/dev/null
import sys

import psycopg

with psycopg.connect(sys.argv[1], connect_timeout=2):
    pass
PY
    then
      echo "[dev] PostgreSQL is ready."
      return 0
    fi
    sleep 2
  done
  echo "[dev] ERROR: PostgreSQL is not reachable at $DATABASE_URL" >&2
  return 1
}

echo "[dev] Starting PostgreSQL (docker compose) ..."
docker compose up -d db
wait_for_db

echo "[dev] Installing dependencies ..."
"$PYTHON" -m pip install -q -r backend/requirements.txt
"$PYTHON" -m pip install -q -r worker/requirements.txt
"$PYTHON" -m pip install -q -e shared
( cd frontend && npm install --no-audit --no-fund )
( cd admin && npm install --no-audit --no-fund )

echo "[dev] Starting API on http://localhost:8000 ..."
( cd backend && "$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 ) &
pids+=($!)

echo "[dev] Starting worker ..."
( cd worker && "$PYTHON" main.py ) &
pids+=($!)

echo "[dev] Starting forum frontend on http://localhost:5173 ..."
( cd frontend && npm run dev -- --host 0.0.0.0 --port 5173 ) &
pids+=($!)

echo "[dev] Starting admin panel on http://localhost:5174 ..."
( cd admin && npm run dev -- --host 0.0.0.0 --port 5174 ) &
pids+=($!)

echo
echo "[dev] Whole product is starting:"
echo "[dev]   Forum      http://localhost:5173"
echo "[dev]   Admin      http://localhost:5174"
echo "[dev]   API health http://localhost:8000/api/health"
echo "[dev] Press Ctrl+C to stop."

wait
