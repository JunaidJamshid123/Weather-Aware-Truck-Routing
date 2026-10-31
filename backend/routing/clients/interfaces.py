"""Ports the services depend on. Production adapters live next to this module;
tests inject in-memory fakes that satisfy the same Protocols."""

from __future__ import annotations

from collections.abc import Collection, Iterable, Mapping, Sequence
from typing import Any, Protocol

from routing.domain.models import GridCell, HourlySeries, LatLon, Location, RoutePath


class RoutingProvider(Protocol):
    def route(self, waypoints: Sequence[LatLon], *, load_lb: int) -> RoutePath:
        """Raises NoRouteError, RateLimitError or UpstreamError."""
        ...


class GeocodingProvider(Protocol):
    def autocomplete(self, text: str, *, size: int) -> list[Location]: ...


class WeatherProvider(Protocol):
    def hourly_forecast(self, cells: Collection[GridCell]) -> Mapping[GridCell, HourlySeries]:
        """Cells that could not be fetched are absent; never raises."""
        ...


class CacheBackend(Protocol):
    """The subset of Django's cache API the services use."""

    def get(self, key: str, default: Any = None) -> Any: ...

    def set(self, key: str, value: Any, timeout: float | None = ...) -> Any: ...

    def get_many(self, keys: Iterable[str]) -> dict[str, Any]: ...

    def set_many(self, data: Mapping[str, Any], timeout: float | None = ...) -> Any: ...
