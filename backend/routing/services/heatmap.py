"""Corridor heatmap: risk at each corridor point for every hour 0-48 after departure.
Unlike checkpoint risk (evaluated at the truck's ETA), this backs the time slider."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta

from routing.domain.constants import (
    HEATMAP_HOURS,
    HEATMAP_MAX_POINTS_PER_ROUTE,
    HEATMAP_MIN_SPACING_MI,
    HEATMAP_UNKNOWN_RISK,
)
from routing.domain.models import GridCell, HourlySeries, LatLon, RoutePath
from routing.domain.results import Heatmap, HeatmapPoint
from routing.domain.risk import assess_checkpoint
from routing.geo.geometry import evenly_spaced_distances, point_at_distance

HALF_HOUR = timedelta(minutes=30)


def heatmap_corridor_points(paths: Sequence[RoutePath]) -> tuple[LatLon, ...]:
    """Points every max(10 mi, length/150) along each route, one per weather grid cell."""
    seen: set[GridCell] = set()
    points: list[LatLon] = []
    for path in paths:
        spacing_mi = max(HEATMAP_MIN_SPACING_MI, path.distance_mi / HEATMAP_MAX_POINTS_PER_ROUTE)
        for mile in evenly_spaced_distances(path.distance_mi, spacing_mi):
            point = point_at_distance(path.points, path.cumulative_mi, mile)
            cell = GridCell.containing(point)
            if cell not in seen:
                seen.add(cell)
                points.append(point)
    return tuple(points)


def heatmap_start_utc(departure_utc: datetime) -> datetime:
    """Departure rounded to the nearest whole hour (half past rounds up)."""
    floored = departure_utc.replace(minute=0, second=0, microsecond=0)
    return floored + timedelta(hours=1) if departure_utc - floored >= HALF_HOUR else floored


def build_heatmap(
    points: Sequence[LatLon],
    series_by_cell: Mapping[GridCell, HourlySeries],
    departure_utc: datetime,
    load_lb: int,
) -> Heatmap:
    """Risk value (0-4, or -1 when unknown) per point per hour, using the trip's load."""
    start_utc = heatmap_start_utc(departure_utc)
    hours_utc = [start_utc + timedelta(hours=h) for h in range(HEATMAP_HOURS)]
    return Heatmap(
        start_utc=start_utc,
        hours=HEATMAP_HOURS,
        points=tuple(
            HeatmapPoint(
                point=point,
                risk=_hourly_risk(
                    series_by_cell.get(GridCell.containing(point)), hours_utc, load_lb
                ),
            )
            for point in points
        ),
    )


def _hourly_risk(
    series: HourlySeries | None, hours_utc: Sequence[datetime], load_lb: int
) -> tuple[int, ...]:
    if series is None:
        return (HEATMAP_UNKNOWN_RISK,) * len(hours_utc)
    risks = []
    for hour_utc in hours_utc:
        weather = series.at(hour_utc)
        risks.append(
            int(assess_checkpoint(weather, load_lb).level) if weather else HEATMAP_UNKNOWN_RISK
        )
    return tuple(risks)
