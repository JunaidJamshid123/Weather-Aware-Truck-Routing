"""PlanService, the use case behind POST /api/plan. Weather for every route's checkpoints
and the heatmap is fetched in a single batched pass."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Collection, Iterable, Mapping, Sequence
from typing import Final, Protocol

from routing.clients.interfaces import CacheBackend, WeatherProvider
from routing.domain.constants import ROUTE_LABELS, SIMPLIFY_TOLERANCE_DEG
from routing.domain.models import GridCell, HourlySeries, LatLon, RoutePath, TripRequest
from routing.domain.results import CheckpointPlacement, RankedRoute, RoutePlan, TripPlan
from routing.geo.geometry import simplify
from routing.services.alternatives import RouteAlternatives
from routing.services.assessment import assess_checkpoints, summarize_route
from routing.services.checkpoints import place_checkpoints
from routing.services.heatmap import build_heatmap, heatmap_corridor_points
from routing.services.recommendation import format_miles, rank_routes

logger = logging.getLogger(__name__)

PLAN_CACHE_TTL_S: Final = 10 * 60
PLAN_CACHE_KEY_PREFIX: Final = "plan:v1:"
COORDINATE_KEY_DECIMALS: Final = 4
ALL_BLOCKED_WARNING: Final = "Every route has a No Travel segment. Delay or reconsider this trip."
WEATHER_DOWN_WARNING: Final = (
    "Weather forecasts are unavailable right now; risk could not be assessed."
)


class RouteFinder(Protocol):
    def find(self, origin: LatLon, destination: LatLon, load_lb: int) -> RouteAlternatives: ...


class PlanService:
    def __init__(
        self,
        route_finder: RouteFinder,
        weather: WeatherProvider,
        cache: CacheBackend,
        *,
        cache_ttl_s: int = PLAN_CACHE_TTL_S,
    ) -> None:
        self._route_finder = route_finder
        self._weather = weather
        self._cache = cache
        self._cache_ttl_s = cache_ttl_s

    def plan(self, trip: TripRequest) -> TripPlan:
        """Full trip plan, served from cache when the same trip was planned recently."""
        key = plan_cache_key(trip)
        cached = self._cache.get(key)
        if isinstance(cached, TripPlan):
            logger.info("plan cache hit")
            return cached
        logger.info("plan cache miss")
        plan = self._build(trip)
        self._cache.set(key, plan, self._cache_ttl_s)
        return plan

    def _build(self, trip: TripRequest) -> TripPlan:
        alternatives = self._route_finder.find(
            trip.origin.point, trip.destination.point, trip.load_lb
        )
        placements = [
            place_checkpoints(path, trip.departure_utc, trip.interval_mi)
            for path in alternatives.paths
        ]
        heatmap_points = heatmap_corridor_points(alternatives.paths)
        cells = _cells(heatmap_points, (p.point for route in placements for p in route))
        series_by_cell = self._weather.hourly_forecast(cells)
        route_plans = [
            _route_plan(index, path, route_placements, series_by_cell, trip)
            for index, (path, route_placements) in enumerate(
                zip(alternatives.paths, placements, strict=True)
            )
        ]
        ranked = rank_routes(route_plans)
        all_blocked = all(route.plan.stats.blocked for route in ranked)
        return TripPlan(
            trip=trip,
            routes=ranked,
            all_blocked=all_blocked,
            warnings=(
                *alternatives.warnings,
                *_weather_warnings(ranked, series_by_cell, cells),
                *((ALL_BLOCKED_WARNING,) if all_blocked else ()),
            ),
            heatmap=build_heatmap(heatmap_points, series_by_cell, trip.departure_utc, trip.load_lb),
        )


def _route_plan(
    index: int,
    path: RoutePath,
    placements: Sequence[CheckpointPlacement],
    series_by_cell: Mapping[GridCell, HourlySeries],
    trip: TripRequest,
) -> RoutePlan:
    checkpoints = assess_checkpoints(placements, series_by_cell, trip.load_lb, path.distance_mi)
    return RoutePlan(
        id=f"route-{index + 1}",
        label=ROUTE_LABELS[index],
        path=path,
        display_points=simplify(path.points, SIMPLIFY_TOLERANCE_DEG),
        checkpoints=checkpoints,
        stats=summarize_route(path, checkpoints, trip.departure_utc),
    )


def _cells(*point_groups: Iterable[LatLon]) -> frozenset[GridCell]:
    return frozenset(GridCell.containing(point) for group in point_groups for point in group)


def _weather_warnings(
    routes: Sequence[RankedRoute],
    series_by_cell: Mapping[GridCell, HourlySeries],
    requested: Collection[GridCell],
) -> tuple[str, ...]:
    if requested and not series_by_cell:
        return (WEATHER_DOWN_WARNING,)
    return tuple(
        f"No forecast for {format_miles(route.plan.stats.unknown_mi)} mi of {route.plan.label}; "
        "those miles are reported as unknown."
        for route in routes
        if route.plan.stats.unknown_mi > 0
    )


def plan_cache_key(trip: TripRequest) -> str:
    """sha256 of the normalized trip. Departure is kept to the minute because it shifts ETAs."""
    normalized = {
        "origin": _rounded(trip.origin.point),
        "destination": _rounded(trip.destination.point),
        "departure": trip.departure_utc.strftime("%Y-%m-%dT%H:%M"),
        "load_lb": trip.load_lb,
        "interval_mi": trip.interval_mi,
    }
    digest = hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()
    return PLAN_CACHE_KEY_PREFIX + digest


def _rounded(point: LatLon) -> list[float]:
    return [round(point.lat, COORDINATE_KEY_DECIMALS), round(point.lon, COORDINATE_KEY_DECIMALS)]
