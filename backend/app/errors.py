"""Helpers for the API error envelope.

Every failure of the API answers the same body:

    {"error": {"code": str, "message": str, "fields": {"<field>": str}}}
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

STATUS_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    501: "not_implemented",
    503: "unavailable",
}


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "fields": fields or {}}}


def api_error(
    code: str,
    message: str,
    status: int,
    fields: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """Build the HTTPException whose handler emits the contract's error body."""
    return HTTPException(
        status_code=status,
        detail=error_body(code, message, fields),
        headers=headers,
    )


def not_implemented(feature: str, status: int = 501) -> HTTPException:
    """The declared answer of a route whose feature another ticket implements."""
    return api_error("not_implemented", f"{feature} is not implemented yet", status)
