"""How much two routes (or one route with itself) share the same road. Samples are bucketed
in a grid at least `threshold_mi` wide, so each lookup only scans the 3x3 neighbouring cells."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass

from routing.domain.constants import MI_PER_DEG_LAT
from routing.domain.models import LatLon, RoutePath
from routing.geo.geometry import evenly_spaced_distances, haversine_mi, point_at_distance

_DENSE_SAMPLING_FACTOR = 4  # Target route is sampled 4x denser than the probe route.
_MIN_COS_LAT = 0.2  # Caps cell widening near the poles (|lat| <= ~78 deg).


@dataclass(frozen=True, slots=True)
class _Sample:
    point: LatLon
    mile: float


def sample_route(path: RoutePath, spacing_mi: float) -> tuple[_Sample, ...]:
    """Points every `spacing_mi` along the route, including both ends."""
    return tuple(
        _Sample(point_at_distance(path.points, path.cumulative_mi, mile), mile)
        for mile in evenly_spaced_distances(path.distance_mi, spacing_mi)
    )


class _GridIndex:
    def __init__(self, samples: tuple[_Sample, ...], threshold_mi: float) -> None:
        max_abs_lat = max((abs(s.point.lat) for s in samples), default=0.0)
        cos_lat = max(math.cos(math.radians(max_abs_lat)), _MIN_COS_LAT)
        self._lat_cell_deg = threshold_mi / MI_PER_DEG_LAT
        self._lon_cell_deg = self._lat_cell_deg / cos_lat
        self._cells: defaultdict[tuple[int, int], list[_Sample]] = defaultdict(list)
        for sample in samples:
            self._cells[self._key(sample.point)].append(sample)

    def _key(self, point: LatLon) -> tuple[int, int]:
        return math.floor(point.lat / self._lat_cell_deg), math.floor(
            point.lon / self._lon_cell_deg
        )

    def neighbours(self, point: LatLon) -> Iterator[_Sample]:
        row, col = self._key(point)
        for d_row in (-1, 0, 1):
            for d_col in (-1, 0, 1):
                yield from self._cells.get((row + d_row, col + d_col), ())


def overlap_fraction(
    probe: RoutePath, target: RoutePath, *, threshold_mi: float, spacing_mi: float
) -> float:
    """Share (0-1) of `probe` samples lying within `threshold_mi` of `target`."""
    probe_samples = sample_route(probe, spacing_mi)
    index = _GridIndex(sample_route(target, spacing_mi / _DENSE_SAMPLING_FACTOR), threshold_mi)
    near = sum(
        1
        for sample in probe_samples
        if any(
            haversine_mi(sample.point, n.point) <= threshold_mi
            for n in index.neighbours(sample.point)
        )
    )
    return near / len(probe_samples)


def route_overlap(a: RoutePath, b: RoutePath, *, threshold_mi: float, spacing_mi: float) -> float:
    """Symmetric overlap: the larger of the two directional overlap fractions."""
    return max(
        overlap_fraction(a, b, threshold_mi=threshold_mi, spacing_mi=spacing_mi),
        overlap_fraction(b, a, threshold_mi=threshold_mi, spacing_mi=spacing_mi),
    )


def self_overlap_fraction(
    path: RoutePath, *, threshold_mi: float, spacing_mi: float, min_gap_mi: float
) -> float:
    """Share (0-1) of the route driven twice, e.g. out and back on a spur to reach a via point."""
    samples = sample_route(path, spacing_mi)
    index = _GridIndex(sample_route(path, spacing_mi / _DENSE_SAMPLING_FACTOR), threshold_mi)
    revisited = sum(
        1
        for sample in samples
        if any(
            abs(n.mile - sample.mile) > min_gap_mi
            and haversine_mi(sample.point, n.point) <= threshold_mi
            for n in index.neighbours(sample.point)
        )
    )
    return revisited / len(samples)
