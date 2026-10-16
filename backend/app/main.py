"""The API application: routes, the contract's error envelope and CORS."""

from __future__ import annotations

import importlib
import importlib.util
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.errors import STATUS_CODES, error_body
from shared.config import cors_origins_from_env, get_settings
from shared.db import dispose_engine

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]

ROUTER_MODULES = (
    "health",
    "auth",
    "users",
    "categories",
    "threads",
    "listing",
    "comments",
    "votes",
    "subscriptions",
    "notifications",
    "reports",
    "moderation",
    "admin",
)


def router_modules() -> tuple[str, ...]:
    """The router modules to mount.

    ``search`` (GET /api/search) is delivered by its own ticket: as soon as
    ``app/routers/search.py`` exists it is wired in here automatically, without
    anyone having to edit this shared entry point.
    """
    modules = list(ROUTER_MODULES)
    if "search" not in modules and importlib.util.find_spec("app.routers.search") is not None:
        modules.append("search")
    return tuple(modules)


def run_migrations() -> None:
    """Bring the declared database up to the current schema (idempotent)."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Validate the configuration once, prepare the schema, then serve."""
    settings = get_settings()
    logger.info("API starting; allowed browser origins: %s", settings.cors_origins)
    try:
        run_migrations()
    except Exception as exc:
        raise RuntimeError(
            "The API cannot start: the database declared by DATABASE_URL (see RUN.json) "
            f"is unreachable or could not be migrated: {exc}"
        ) from exc
    yield
    dispose_engine()


class UnhandledErrorMiddleware(BaseHTTPMiddleware):
    """Answer unhandled errors in the contract's envelope *inside* the CORS
    layer, so a 5xx keeps its CORS headers and the browser can read it."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        try:
            return await call_next(request)
        except Exception:
            logger.exception("unhandled error on %s %s", request.method, request.url.path)
            return JSONResponse(
                status_code=500, content=error_body("internal_error", "Internal Server Error")
            )


def create_app() -> FastAPI:
    app = FastAPI(
        title="Community Forum API",
        version="1.0.0",
        lifespan=lifespan,
        redirect_slashes=False,
    )

    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins_from_env(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            content = detail
        else:
            code = STATUS_CODES.get(exc.status_code, "error")
            content = error_body(code, str(detail))
        return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields: dict[str, str] = {}
        for error in exc.errors():
            location = [
                str(part)
                for part in error.get("loc", ())
                if part not in ("body", "query", "path", "header")
            ]
            key = ".".join(location) or "request"
            fields.setdefault(key, str(error.get("msg", "invalid value")))
        return JSONResponse(
            status_code=422,
            content=error_body("validation_error", "Some fields are invalid", fields),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500, content=error_body("internal_error", "Internal Server Error")
        )

    for module_name in router_modules():
        module = importlib.import_module(f"app.routers.{module_name}")
        app.include_router(module.router)

    return app


app = create_app()
