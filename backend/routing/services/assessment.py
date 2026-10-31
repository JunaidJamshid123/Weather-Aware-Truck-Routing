"""Attach weather and risk to checkpoints and aggregate per-route statistics. No I/O."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from itertools import pairwise

from routing.domain.models import GridCell, HourlySeries, RoutePath
from routing.domain.results import Checkpoint, CheckpointPlacement, RouteStats
from routing.domain.risk import Risk, assess_checkpoint


def owned_miles(checkpoint_miles: Sequence[float], total_mi: float) -> tuple[float, ...]:
    """Road each checkpoint stands for, split at midpoints between neighbours; sums to total."""
    if not checkpoint_miles:
        return ()
    midpoints = [(a + b) / 2 for a, b in pairwise(checkpoint_miles)]
    bounds = [0.0, *(min(max(m, 0.0), total_mi) for m in midpoints), total_mi]
    return tuple(upper - lower for lower, upper in pairwise(bounds))


def assess_checkpoints(
    placements: Sequence[CheckpointPlacement],
    series_by_cell: Mapping[GridCell, HourlySeries],
    load_lb: int,
    total_mi: float,
) -> tuple[Checkpoint, ...]:
    """Weather at each checkpoint's ETA (nearest forecast hour) and its risk assessment."""
    owned = owned_miles([p.mile for p in placements], total_mi)
    checkpoints = []
    for placement, owned_mi in zip(placements, owned, strict=True):
        series = series_by_cell.get(GridCell.containing(placement.point))
        weather = series.at(placement.eta_utc) if series else None
        checkpoints.append(
            Checkpoint(
                index=placement.index,
                mile=placement.mile,
                point=placement.point,
                eta_utc=placement.eta_utc,
                weather=weather,
                assessment=assess_checkpoint(weather, load_lb) if weather else None,
                owned_mi=owned_mi,
            )
        )
    return tuple(checkpoints)


def summarize_route(
    path: RoutePath, checkpoints: Sequence[Checkpoint], departure_utc: datetime
) -> RouteStats:
    """Checkpoints without weather count as unknown miles (never LOW) and skip the average."""
    miles_by_level: defaultdict[Risk, float] = defaultdict(float)
    unknown_mi = weighted_risk = known_mi = 0.0
    for checkpoint in checkpoints:
        if checkpoint.risk is None:
            unknown_mi += checkpoint.owned_mi
            continue
        miles_by_level[checkpoint.risk] += checkpoint.owned_mi
        weighted_risk += checkpoint.risk * checkpoint.owned_mi
        known_mi += checkpoint.owned_mi
    known_levels = [c.risk for c in checkpoints if c.risk is not None]
    # The destination checkpoint's ETA keeps the arrival consistent with checkpoint ETAs.
    arrival_utc = (
        checkpoints[-1].eta_utc
        if checkpoints
        else departure_utc + timedelta(seconds=path.duration_s)
    )
    return RouteStats(
        distance_mi=path.distance_mi,
        duration_s=path.duration_s,
        arrival_utc=arrival_utc,
        moderate_mi=miles_by_level[Risk.MODERATE],
        high_mi=miles_by_level[Risk.HIGH],
        severe_mi=miles_by_level[Risk.SEVERE],
        no_travel_mi=miles_by_level[Risk.NO_TRAVEL],
        unknown_mi=unknown_mi,
        avg_risk=weighted_risk / known_mi if known_mi > 0 else None,
        max_risk=max(known_levels, default=None),
        blocked=Risk.NO_TRAVEL in known_levels,
    )
