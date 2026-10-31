"""GeocodeService: cached place autocomplete for the trip form."""

from __future__ import annotations

import hashlib
import logging
from typing import Final

from routing.clients.interfaces import CacheBackend, GeocodingProvider
from routing.domain.models import Location

logger = logging.getLogger(__name__)

GEOCODE_CACHE_TTL_S: Final = 24 * 60 * 60
GEOCODE_CACHE_KEY_PREFIX: Final = "geocode:v1:"


def normalize_query(text: str) -> str:
    """Lower-case and collapse whitespace so trivially different queries share a cache entry."""
    return " ".join(text.lower().split())


class GeocodeService:
    def __init__(
        self,
        geocoder: GeocodingProvider,
        cache: CacheBackend,
        *,
        cache_ttl_s: int = GEOCODE_CACHE_TTL_S,
    ) -> None:
        self._geocoder = geocoder
        self._cache = cache
        self._cache_ttl_s = cache_ttl_s

    def search(self, query: str, *, size: int) -> tuple[Location, ...]:
        normalized = normalize_query(query)
        digest = hashlib.sha256(f"{normalized}|{size}".encode()).hexdigest()
        key = GEOCODE_CACHE_KEY_PREFIX + digest
        cached = self._cache.get(key)
        if isinstance(cached, tuple):
            logger.info("geocode cache hit")
            return cached
        logger.info("geocode cache miss")
        results = tuple(self._geocoder.autocomplete(normalized, size=size))
        self._cache.set(key, results, self._cache_ttl_s)
        return results
