"""Place checkpoints along a route and compute the truck's ETA at each one."""

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Sequence
from datetime import datetime, timedelta

from routing.domain.models import RoutePath
from routing.domain.results import CheckpointPlacement
from routing.geo.geometry import evenly_spaced_distances, point_at_distance


def time_at_distance_s(path: RoutePath, distance_mi: float) -> float:
    """Interpolates within ORS steps; without steps, falls back to a proportional share."""
    distance = min(max(distance_mi, 0.0), path.distance_mi)
    profile = path.time_profile
    if profile is None:
        if path.distance_mi <= 0:
            return 0.0
        return path.duration_s * distance / path.distance_mi
    return _interpolate(profile.cumulative_mi, profile.cumulative_s, distance)


def _interpolate(xs: Sequence[float], ys: Sequence[float], x: float) -> float:
    """Piecewise-linear y(x) for non-decreasing `xs` starting at 0; clamps beyond the end."""
    if x >= xs[-1]:
        return ys[-1]
    index = bisect_right(xs, x)  # xs[index - 1] <= x < xs[index], so the span is non-zero.
    x0, x1 = xs[index - 1], xs[index]
    y0, y1 = ys[index - 1], ys[index]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def place_checkpoints(
    path: RoutePath, departure_utc: datetime, interval_mi: float
) -> tuple[CheckpointPlacement, ...]:
    """Checkpoints at mile 0, N, 2N, ... and at the destination, each with its UTC ETA."""
    return tuple(
        CheckpointPlacement(
            index=index,
            mile=mile,
            point=point_at_distance(path.points, path.cumulative_mi, mile),
            eta_utc=departure_utc + timedelta(seconds=time_at_distance_s(path, mile)),
        )
        for index, mile in enumerate(evenly_spaced_distances(path.distance_mi, interval_mi))
    )
