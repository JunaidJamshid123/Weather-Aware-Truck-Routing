"""Shared HTTP plumbing for upstream clients: session, retries, timeouts, error types."""

from __future__ import annotations

import logging
import time
from typing import Any, Final

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT_S: Final = 3.0
READ_TIMEOUT_S: Final = 15.0
RETRY_ATTEMPTS: Final = 2
RETRY_BACKOFF_S: Final = 0.5
RETRY_STATUSES: Final = frozenset({429, 500, 502, 503, 504})
USER_AGENT: Final = "spotter-weather-routing/1.0"


class ProviderError(Exception):
    """Base for third-party provider failures; messages are safe to show users."""


class UpstreamError(ProviderError):
    """Provider timed out, returned 5xx, or sent a response we could not parse."""


class NoRouteError(ProviderError):
    """Provider answered, but no route exists between the requested points."""


class RateLimitError(ProviderError):
    """Provider quota or rate limit is exhausted."""


def build_session() -> requests.Session:
    """Session with connection pooling and bounded retries on 429/5xx and network errors."""
    retry = Retry(
        total=RETRY_ATTEMPTS,
        backoff_factor=RETRY_BACKOFF_S,
        status_forcelist=RETRY_STATUSES,
        allowed_methods=frozenset({"GET", "POST"}),
        raise_on_status=False,
        respect_retry_after_header=False,  # A long Retry-After would stall the request.
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=16)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers["User-Agent"] = USER_AGENT
    return session


def send(session: requests.Session, method: str, url: str, **kwargs: Any) -> requests.Response:
    """Send a request with our timeouts; network failures become UpstreamError."""
    started = time.perf_counter()
    try:
        response = session.request(
            method, url, timeout=(CONNECT_TIMEOUT_S, READ_TIMEOUT_S), **kwargs
        )
    except requests.RequestException as exc:
        logger.warning("upstream %s %s failed: %s", method, url, type(exc).__name__)
        raise UpstreamError("A data provider could not be reached.") from exc
    latency_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "upstream %s %s status=%s latency_ms=%.0f", method, url, response.status_code, latency_ms
    )
    return response


def json_body(response: requests.Response) -> Any:
    """Decoded JSON body; a non-JSON body becomes UpstreamError."""
    try:
        return response.json()
    except ValueError as exc:
        raise UpstreamError("A data provider returned an unreadable response.") from exc
