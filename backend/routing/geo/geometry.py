"""Pure spherical geometry on polylines (miles, degrees). Lookups along a path binary-search
the precomputed cumulative-miles array, so placing many points on a long route stays cheap."""

from __future__ import annotations

import math
from bisect import bisect_left
from collections.abc import Sequence
from itertools import pairwise

from routing.domain.constants import DISTANCE_EPSILON_MI, EARTH_RADIUS_MI
from routing.domain.models import LatLon

_MIN_SIMPLIFIABLE_POINTS = 3


def haversine_mi(a: LatLon, b: LatLon) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    d_lat = lat2 - lat1
    d_lon = math.radians(b.lon - a.lon)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(h)))


def cumulative_distances_mi(points: Sequence[LatLon]) -> tuple[float, ...]:
    """Miles from the first point to each point."""
    if not points:
        return ()
    total = 0.0
    cumulative = [0.0]
    for previous, current in pairwise(points):
        total += haversine_mi(previous, current)
        cumulative.append(total)
    return tuple(cumulative)


def interpolate(a: LatLon, b: LatLon, fraction: float) -> LatLon:
    """Linear interpolation between two nearby points (`fraction` in [0, 1])."""
    return LatLon(lat=a.lat + (b.lat - a.lat) * fraction, lon=a.lon + (b.lon - a.lon) * fraction)


def point_at_distance(
    points: Sequence[LatLon], cumulative_mi: Sequence[float], distance_mi: float
) -> LatLon:
    """Point `distance_mi` miles along the polyline, clamped to its ends. O(log n)."""
    if not points or len(points) != len(cumulative_mi):
        raise ValueError("points and cumulative_mi must be non-empty and of equal length.")
    distance = min(max(distance_mi, 0.0), cumulative_mi[-1])
    index = bisect_left(cumulative_mi, distance)
    if index == 0:
        return points[0]
    segment_start = cumulative_mi[index - 1]
    segment_length = cumulative_mi[index] - segment_start
    if segment_length <= 0:
        return points[index]
    return interpolate(
        points[index - 1], points[index], (distance - segment_start) / segment_length
    )


def evenly_spaced_distances(total_mi: float, spacing_mi: float) -> tuple[float, ...]:
    """`0, s, 2s, ...` up to `total_mi`, always ending exactly at `total_mi`."""
    if spacing_mi <= 0:
        raise ValueError("spacing_mi must be positive.")
    if total_mi <= DISTANCE_EPSILON_MI:
        return (0.0,)
    count = math.floor(total_mi / spacing_mi + DISTANCE_EPSILON_MI)
    distances = [step * spacing_mi for step in range(count + 1)]
    if total_mi - distances[-1] > DISTANCE_EPSILON_MI:
        distances.append(total_mi)
    else:
        distances[-1] = total_mi
    return tuple(distances)


def bearing_deg(a: LatLon, b: LatLon) -> float:
    """Initial great-circle bearing from `a` to `b`, in degrees clockwise from north [0, 360)."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    d_lon = math.radians(b.lon - a.lon)
    x = math.sin(d_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return math.degrees(math.atan2(x, y)) % 360


def offset_point(origin: LatLon, bearing: float, distance_mi: float) -> LatLon:
    angular = distance_mi / EARTH_RADIUS_MI
    theta = math.radians(bearing)
    lat1, lon1 = math.radians(origin.lat), math.radians(origin.lon)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular) + math.cos(lat1) * math.sin(angular) * math.cos(theta)
    )
    lon2 = lon1 + math.atan2(
        math.sin(theta) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    return LatLon(lat=math.degrees(lat2), lon=(math.degrees(lon2) + 540) % 360 - 180)


def bearing_at_distance(
    points: Sequence[LatLon], cumulative_mi: Sequence[float], distance_mi: float, window_mi: float
) -> float:
    """Local direction of travel around `distance_mi`, smoothed over +/- `window_mi`."""
    before = point_at_distance(points, cumulative_mi, distance_mi - window_mi)
    after = point_at_distance(points, cumulative_mi, distance_mi + window_mi)
    return bearing_deg(before, after)


def simplify(points: Sequence[LatLon], tolerance_deg: float) -> tuple[LatLon, ...]:
    """Douglas-Peucker simplification in degree space (iterative, no recursion limit)."""
    if len(points) < _MIN_SIMPLIFIABLE_POINTS:
        return tuple(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        index, distance = _farthest_from_chord(points, start, end)
        if distance > tolerance_deg:
            keep[index] = True
            stack.extend(((start, index), (index, end)))
    return tuple(point for point, kept in zip(points, keep, strict=True) if kept)


def _farthest_from_chord(points: Sequence[LatLon], start: int, end: int) -> tuple[int, float]:
    farthest_index, farthest_distance = start, 0.0
    for index in range(start + 1, end):
        distance = _segment_distance_deg(points[index], points[start], points[end])
        if distance > farthest_distance:
            farthest_index, farthest_distance = index, distance
    return farthest_index, farthest_distance


def _segment_distance_deg(p: LatLon, a: LatLon, b: LatLon) -> float:
    dx, dy = b.lon - a.lon, b.lat - a.lat
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(p.lon - a.lon, p.lat - a.lat)
    t = max(0.0, min(1.0, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / length_sq))
    return math.hypot(p.lon - (a.lon + t * dx), p.lat - (a.lat + t * dy))
