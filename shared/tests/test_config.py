"""Tests for shared.config — the environment-derived settings."""

from __future__ import annotations

import pytest

from shared.config import get_settings, reset_settings_cache


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


def test_settings_read_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/forum")
    monkeypatch.setenv("JWT_SECRET", "secret-value")
    monkeypatch.setenv("ACCESS_TOKEN_TTL_SECONDS", "1200")
    monkeypatch.setenv("REFRESH_TOKEN_TTL_DAYS", "7")
    monkeypatch.setenv("WORKER_POLL_INTERVAL_SECONDS", "2")
    settings = get_settings()
    assert settings.database_url == "postgresql://u:p@db:5432/forum"
    assert settings.jwt_secret == "secret-value"
    assert settings.access_token_ttl_seconds == 1200
    assert settings.refresh_token_ttl_days == 7
    assert settings.worker_poll_interval_seconds == 2
    assert settings.database_url == settings.DATABASE_URL
    assert settings.jwt_secret == settings.JWT_SECRET
    assert settings.ACCESS_TOKEN_TTL_SECONDS == 1200


def test_missing_database_url_names_the_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        get_settings()


def test_missing_jwt_secret_is_generated_per_process(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/forum")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    settings = get_settings()
    assert settings.jwt_secret
    assert len(settings.jwt_secret) == 64


def test_unresolved_service_placeholder_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/forum")
    monkeypatch.setenv("FRONTEND_ORIGIN", "${service:web.origin}")
    settings = get_settings()
    assert settings.frontend_origin == "http://localhost:5173"
    assert "http://localhost:5173" in settings.cors_origins


def test_cors_origins_include_both_frontends(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/forum")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("ADMIN_ORIGIN", "http://localhost:5174")
    settings = get_settings()
    assert settings.cors_origins == ["http://localhost:5173", "http://localhost:5174"]
