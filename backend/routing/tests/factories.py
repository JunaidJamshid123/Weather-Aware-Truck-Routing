"""Builders and in-memory fakes shared by the test suite. No network, no Django."""

from __future__ import annotations

from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from typing import Any

from routing.clients.base import NoRouteError
from routing.domain.models import (
    GridCell,
    HourlySeries,
    LatLon,
    Location,
    RoutePath,
    TimeProfile,
    TripRequest,
    Weather,
)
from routing.geo.geometry import cumulative_distances_mi, interpolate

DEPARTURE = datetime(2026, 11, 2, 14, 0, tzinfo=UTC)
CALM = Weather(wind_mph=5.0, rain_in_hr=0.0, snow_in_hr=0.0)
DALLAS = LatLon(32.7767, -96.7970)
DENVER = LatLon(39.7392, -104.9903)
AVERAGE_SPEED_MPH = 55.0


def polyline(*vertices: LatLon, points_per_leg: int = 50) -> tuple[LatLon, ...]:
    """Densified polyline through `vertices`."""
    points = [vertices[0]]
    for start, end in pairwise(vertices):
        points.extend(
            interpolate(start, end, i / points_per_leg) for i in range(1, points_per_leg + 1)
        )
    return tuple(points)


def make_path(
    *vertices: LatLon,
    duration_s: float | None = None,
    time_profile: TimeProfile | None = None,
    points_per_leg: int = 50,
) -> RoutePath:
    points = polyline(*vertices, points_per_leg=points_per_leg)
    cumulative = cumulative_distances_mi(points)
    return RoutePath(
        points=points,
        cumulative_mi=cumulative,
        distance_mi=cumulative[-1],
        duration_s=duration_s
        if duration_s is not None
        else cumulative[-1] / AVERAGE_SPEED_MPH * 3600,
        time_profile=time_profile,
    )


def make_trip(
    origin: LatLon = DALLAS,
    destination: LatLon = DENVER,
    *,
    load_lb: int = 20_000,
    interval_mi: int = 25,
    departure_utc: datetime = DEPARTURE,
) -> TripRequest:
    return TripRequest(
        origin=Location("Origin", origin),
        destination=Location("Destination", destination),
        departure_utc=departure_utc,
        load_lb=load_lb,
        interval_mi=interval_mi,
    )


def constant_series(
    weather: Weather | None, *, start: datetime = DEPARTURE, hours: int = 168
) -> HourlySeries:
    return HourlySeries(start_utc=start - timedelta(hours=12), values=(weather,) * hours)


class FakeWeather:
    """WeatherProvider returning `weather_for(cell)` for every requested cell."""

    def __init__(self, weather_for: Callable[[GridCell], Weather | None] = lambda _: CALM) -> None:
        self._weather_for = weather_for
        self.calls: list[frozenset[GridCell]] = []

    def hourly_forecast(self, cells: Collection[GridCell]) -> dict[GridCell, HourlySeries]:
        self.calls.append(frozenset(cells))
        return {cell: constant_series(self._weather_for(cell)) for cell in cells}


class UnavailableWeather:
    def hourly_forecast(self, cells: Collection[GridCell]) -> dict[GridCell, HourlySeries]:
        return {}


class FakeRouting:
    """RoutingProvider: straight legs through the waypoints, or a custom builder."""

    def __init__(self, builder: Callable[[Sequence[LatLon]], RoutePath] | None = None) -> None:
        self._builder = builder or (lambda waypoints: make_path(*waypoints))
        self.calls: list[tuple[LatLon, ...]] = []

    def route(self, waypoints: Sequence[LatLon], *, load_lb: int) -> RoutePath:
        self.calls.append(tuple(waypoints))
        return self._builder(waypoints)


class NoRouting:
    def route(self, waypoints: Sequence[LatLon], *, load_lb: int) -> RoutePath:
        raise NoRouteError("No drivable truck route was found between these locations.")


class DictCache:
    """CacheBackend backed by a dict (timeouts ignored)."""

    def __init__(self) -> None:
        self.data: dict[str, Any] = {}

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def set(self, key: str, value: Any, timeout: float | None = None) -> None:
        self.data[key] = value

    def get_many(self, keys: Iterable[str]) -> dict[str, Any]:
        return {key: self.data[key] for key in keys if key in self.data}

    def set_many(self, data: Mapping[str, Any], timeout: float | None = None) -> None:
        self.data.update(data)
