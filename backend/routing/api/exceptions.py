"""Uniform `{"error": {"code", "message", "details"}}` body for every API failure.
Provider errors map to stable codes; raw upstream details are logged, never returned."""

from __future__ import annotations

import logging
from typing import Any

from django.http import HttpRequest, JsonResponse
from rest_framework import exceptions, status
from rest_framework.response import Response

from routing.clients.base import NoRouteError, ProviderError, RateLimitError, UpstreamError

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "Something went wrong on our side. Please try again."

_PROVIDER_ERRORS: tuple[tuple[type[ProviderError], int, str], ...] = (
    (NoRouteError, status.HTTP_422_UNPROCESSABLE_ENTITY, "no_route_found"),
    (RateLimitError, status.HTTP_503_SERVICE_UNAVAILABLE, "routing_limit_exceeded"),
    (UpstreamError, status.HTTP_502_BAD_GATEWAY, "upstream_unavailable"),
)


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    if isinstance(exc, exceptions.ValidationError):
        return Response(
            error_body("validation_error", _first_message(exc.detail), exc.detail),
            status=status.HTTP_400_BAD_REQUEST,
        )
    if isinstance(exc, exceptions.Throttled):
        wait_s = round(exc.wait) if exc.wait is not None else None
        headers = {"Retry-After": str(wait_s)} if wait_s is not None else None
        message = "Too many requests. Please slow down and try again shortly."
        return Response(error_body("throttled", message), status=429, headers=headers)
    for error_type, status_code, code in _PROVIDER_ERRORS:
        if isinstance(exc, error_type):
            logger.warning("provider error %s: %s", code, exc)
            return Response(error_body(code, str(exc)), status=status_code)
    if isinstance(exc, exceptions.APIException):
        return Response(error_body(str(exc.default_code), str(exc.detail)), status=exc.status_code)
    logger.exception("unhandled error", exc_info=exc)
    return Response(error_body("internal_error", INTERNAL_ERROR_MESSAGE), status=500)


def _first_message(detail: Any) -> str:
    """Flatten DRF's nested error detail to its first human-readable message."""
    if isinstance(detail, dict):
        for field, value in detail.items():
            message = _first_message(value)
            prefix = "" if field == "non_field_errors" else f"{field}: "
            return prefix + message
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    return str(detail) if detail else "Invalid request."


def not_found_view(request: HttpRequest, exception: Exception) -> JsonResponse:
    return JsonResponse(error_body("not_found", "Not found."), status=404)


def server_error_view(request: HttpRequest) -> JsonResponse:
    return JsonResponse(error_body("internal_error", INTERNAL_ERROR_MESSAGE), status=500)
