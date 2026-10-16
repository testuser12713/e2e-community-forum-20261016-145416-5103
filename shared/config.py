"""Application settings, read lazily from the environment.

Every value is read when ``get_settings()`` is first called, never at import
time: a process that is missing a required variable must be able to import its
modules, log, and fail with a message that names the variable.
"""

from __future__ import annotations

import functools
import logging
import os
import secrets
from typing import ClassVar

logger = logging.getLogger(__name__)

DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900
DEFAULT_REFRESH_TOKEN_TTL_DAYS = 14
DEFAULT_WORKER_POLL_INTERVAL_SECONDS = 5
DEFAULT_FRONTEND_ORIGIN = "http://localhost:5173"
DEFAULT_ADMIN_ORIGIN = "http://localhost:5174"


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc


def _env_origin(name: str, default: str) -> str:
    """An origin from the environment, falling back to the dev default.

    A value that still carries an unresolved ``${service:...}`` placeholder (the
    variable names a service that is not declared yet) is treated as unset, so
    the product keeps a working default instead of sending a literal token as a
    CORS origin.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip()
    if not raw or "${" in raw:
        return default
    return raw


def cors_origins_from_env() -> list[str]:
    """The browser origins allowed to call the API.

    Readable without touching DATABASE_URL, so the app object can be built at
    import time while the rest of the configuration stays lazy.
    """
    origins: list[str] = []
    for name, default in (
        ("FRONTEND_ORIGIN", DEFAULT_FRONTEND_ORIGIN),
        ("ADMIN_ORIGIN", DEFAULT_ADMIN_ORIGIN),
    ):
        for part in _env_origin(name, default).split(","):
            part = part.strip()
            if part and part not in origins:
                origins.append(part)
    return origins


class Settings:
    """The product's configuration, materialised from the environment."""

    def __init__(self) -> None:
        database_url = os.environ.get("DATABASE_URL", "").strip()
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL is not set. Declare it in RUN.json as "
                '"DATABASE_URL": {"dev": "${service:db.url}"} or export it before '
                "starting the process (PostgreSQL is required, there is no fallback)."
            )
        self.database_url: str = database_url

        jwt_secret = os.environ.get("JWT_SECRET", "").strip()
        if not jwt_secret:
            jwt_secret = secrets.token_hex(32)
            logger.warning(
                "JWT_SECRET is not set — generating an ephemeral one for this process. "
                "Tokens issued now become invalid when the process restarts. Declare "
                '"JWT_SECRET": {"generate": "hex", "bytes": 32} in RUN.json.'
            )
        self.jwt_secret: str = jwt_secret
        self.jwt_algorithm: str = "HS256"

        self.access_token_ttl_seconds: int = _env_int(
            "ACCESS_TOKEN_TTL_SECONDS", DEFAULT_ACCESS_TOKEN_TTL_SECONDS
        )
        self.refresh_token_ttl_days: int = _env_int(
            "REFRESH_TOKEN_TTL_DAYS", DEFAULT_REFRESH_TOKEN_TTL_DAYS
        )
        self.worker_poll_interval_seconds: int = _env_int(
            "WORKER_POLL_INTERVAL_SECONDS", DEFAULT_WORKER_POLL_INTERVAL_SECONDS
        )

        self.frontend_origin: str = _env_origin("FRONTEND_ORIGIN", DEFAULT_FRONTEND_ORIGIN)
        self.admin_origin: str = _env_origin("ADMIN_ORIGIN", DEFAULT_ADMIN_ORIGIN)

    @property
    def cors_origins(self) -> list[str]:
        """The browser origins allowed to call the API, comma separated forms flattened."""
        origins: list[str] = []
        for value in (self.frontend_origin, self.admin_origin):
            for part in value.split(","):
                part = part.strip()
                if part and part not in origins:
                    origins.append(part)
        return origins

    @property
    def access_token_ttl(self) -> int:
        """Alias kept readable at call sites."""
        return self.access_token_ttl_seconds

    # Uppercase aliases: both spellings are used by callers of the shared contract.
    _UPPERCASE_ALIASES: ClassVar[dict[str, str]] = {
        "DATABASE_URL": "database_url",
        "JWT_SECRET": "jwt_secret",
        "ACCESS_TOKEN_TTL_SECONDS": "access_token_ttl_seconds",
        "REFRESH_TOKEN_TTL_DAYS": "refresh_token_ttl_days",
        "WORKER_POLL_INTERVAL_SECONDS": "worker_poll_interval_seconds",
    }

    def __getattr__(self, name: str) -> object:
        alias = self._UPPERCASE_ALIASES.get(name)
        if alias is not None:
            return getattr(self, alias)
        raise AttributeError(name)


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """The process-wide settings, built once on first use (and validated there)."""
    return Settings()


def reset_settings_cache() -> None:
    """Drop the cached settings — used by tests that repoint the environment."""
    get_settings.cache_clear()
