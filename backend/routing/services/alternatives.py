"""Up to three distinct truck routes. ORS only returns native alternatives for short trips
(~100 km), so we route through via points offset to either side of the fastest route."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from enum import IntEnum

from routing.clients.base import ProviderError
from routing.clients.interfaces import RoutingProvider
from routing.domain.constants import (
    BEARING_WINDOW_MI,
    KM_PER_MI,
    MAX_ALTERNATIVE_DURATION_RATIO,
    MAX_ROUTE_OVERLAP,
    MAX_ROUTES,
    MAX_SELF_OVERLAP,
    OVERLAP_SAMPLE_SPACING_MI,
    OVERLAP_THRESHOLD_MI,
    SELF_OVERLAP_MIN_GAP_MI,
    VIA_OFFSET_FRACTION_OF_TRIP,
    VIA_OFFSET_MAX_KM,
    VIA_OFFSET_MIN_KM,
    VIA_PRIMARY_FRACTIONS,
    VIA_RETRY_FRACTIONS,
    VIA_RETRY_OFFSET_MAX_KM,
    VIA_RETRY_OFFSET_MULTIPLIER,
)
from routing.domain.models import LatLon, RoutePath
from routing.geo.geometry import bearing_at_distance, offset_point, point_at_distance
from routing.geo.overlap import route_overlap, self_overlap_fraction

logger = logging.getLogger(__name__)


class Side(IntEnum):
    LEFT = -1
    RIGHT = 1


@dataclass(frozen=True, slots=True)
class ViaSpec:
    fraction: float  # Position along the fastest route, 0-1.
    side: Side
    offset_mi: float


@dataclass(frozen=True, slots=True)
class RouteAlternatives:
    paths: tuple[RoutePath, ...]  # Fastest first, then alternatives by duration.
    warnings: tuple[str, ...]


def via_offset_mi(total_mi: float, *, retry: bool = False) -> float:
    """Perpendicular via offset: clamp(12% of trip, 25 km, 120 km); larger on retry."""
    offset_km = min(
        max(VIA_OFFSET_FRACTION_OF_TRIP * total_mi * KM_PER_MI, VIA_OFFSET_MIN_KM),
        VIA_OFFSET_MAX_KM,
    )
    if retry:
        offset_km = min(offset_km * VIA_RETRY_OFFSET_MULTIPLIER, VIA_RETRY_OFFSET_MAX_KM)
    return offset_km / KM_PER_MI


def via_point(path: RoutePath, spec: ViaSpec) -> LatLon:
    """Point `spec.offset_mi` to the left or right of the route at `spec.fraction`."""
    distance_mi = path.distance_mi * spec.fraction
    anchor = point_at_distance(path.points, path.cumulative_mi, distance_mi)
    heading = bearing_at_distance(path.points, path.cumulative_mi, distance_mi, BEARING_WINDOW_MI)
    return offset_point(anchor, heading + 90 * spec.side, spec.offset_mi)


def rejection_reason(
    candidate: RoutePath, fastest: RoutePath, accepted: Sequence[RoutePath]
) -> str | None:
    """Why `candidate` is not a useful alternative, or None if it should be kept."""
    if candidate.duration_s > MAX_ALTERNATIVE_DURATION_RATIO * fastest.duration_s:
        return "too slow"
    self_overlap = self_overlap_fraction(
        candidate,
        threshold_mi=OVERLAP_THRESHOLD_MI,
        spacing_mi=OVERLAP_SAMPLE_SPACING_MI,
        min_gap_mi=SELF_OVERLAP_MIN_GAP_MI,
    )
    if self_overlap > MAX_SELF_OVERLAP:
        return f"backtracks ({self_overlap:.0%} driven twice)"
    for existing in accepted:
        overlap = route_overlap(
            candidate,
            existing,
            threshold_mi=OVERLAP_THRESHOLD_MI,
            spacing_mi=OVERLAP_SAMPLE_SPACING_MI,
        )
        if overlap > MAX_ROUTE_OVERLAP:
            return f"duplicates an accepted route ({overlap:.0%} shared)"
    return None


class AlternativeRouteFinder:
    def __init__(self, routing: RoutingProvider, *, max_workers: int = 4) -> None:
        self._routing = routing
        self._max_workers = max_workers

    def find(self, origin: LatLon, destination: LatLon, load_lb: int) -> RouteAlternatives:
        """Fastest route plus up to two alternatives; raises if the fastest route fails."""
        fastest = self._routing.route((origin, destination), load_lb=load_lb)
        offset_mi = via_offset_mi(fastest.distance_mi)
        accepted: list[RoutePath] = [fastest]
        primary = [ViaSpec(f, side, offset_mi) for f in VIA_PRIMARY_FRACTIONS for side in Side]
        found_sides = self._run_round(primary, accepted, origin, destination, load_lb)
        missing_sides = [side for side in Side if side not in found_sides]
        if len(accepted) < MAX_ROUTES and missing_sides:
            retry_offset_mi = via_offset_mi(fastest.distance_mi, retry=True)
            retry = [
                ViaSpec(f, side, retry_offset_mi)
                for side in missing_sides
                for f in VIA_RETRY_FRACTIONS
            ]
            self._run_round(retry, accepted, origin, destination, load_lb)
        alternatives = sorted(accepted[1:], key=lambda path: path.duration_s)
        return RouteAlternatives(paths=(fastest, *alternatives), warnings=_warnings(len(accepted)))

    def _run_round(
        self,
        specs: Sequence[ViaSpec],
        accepted: list[RoutePath],
        origin: LatLon,
        destination: LatLon,
        load_lb: int,
    ) -> set[Side]:
        """Fetch candidates in parallel, append the acceptable ones; return sides that succeeded."""
        fastest = accepted[0]

        def fetch(spec: ViaSpec) -> RoutePath | None:
            waypoints = (origin, via_point(fastest, spec), destination)
            try:
                return self._routing.route(waypoints, load_lb=load_lb)
            except ProviderError as exc:
                logger.info("alternative %s skipped: %s", spec, exc)
                return None

        with ThreadPoolExecutor(max_workers=min(len(specs), self._max_workers)) as pool:
            candidates = list(zip(specs, pool.map(fetch, specs), strict=True))
        found: set[Side] = set()
        for spec, path in sorted(candidates, key=_candidate_duration):
            if path is None or len(accepted) >= MAX_ROUTES:
                continue
            reason = rejection_reason(path, fastest, accepted)
            if reason:
                logger.info("alternative %s rejected: %s", spec, reason)
                continue
            accepted.append(path)
            found.add(spec.side)
        return found


def _candidate_duration(candidate: tuple[ViaSpec, RoutePath | None]) -> float:
    path = candidate[1]
    return path.duration_s if path else float("inf")


def _warnings(route_count: int) -> tuple[str, ...]:
    if route_count >= MAX_ROUTES:
        return ()
    noun = "route" if route_count == 1 else "routes"
    return (f"Only {route_count} distinct {noun} found for this trip.",)
