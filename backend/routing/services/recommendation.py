"""Rank routes by safety, then travel time, with a one-line reason for each. No Travel ranks
ahead of severe miles (which the brief lists first) so a blocked route is never preferred."""

from __future__ import annotations

import math
from collections.abc import Sequence

from routing.domain.results import RankedRoute, RoutePlan, RouteStats

MILES_KEY_DECIMALS = 1
AVG_RISK_KEY_DECIMALS = 3
ONLY_ROUTE_REASON = "Only route found for this trip"
TIED_WINNER_REASON = "Fastest of equally safe routes"

RankingKey = tuple[bool, float, float, float, float, float]

_MILE_CRITERIA = (
    ("no_travel_mi", "No Travel miles"),
    ("severe_mi", "severe miles"),
    ("high_mi", "high-risk miles"),
)


def ranking_key(stats: RouteStats) -> RankingKey:
    """Sort key; values are rounded so float noise cannot decide a rank."""
    return (
        stats.blocked,
        round(stats.no_travel_mi, MILES_KEY_DECIMALS),
        round(stats.severe_mi, MILES_KEY_DECIMALS),
        round(stats.high_mi, MILES_KEY_DECIMALS),
        _avg_risk_key(stats),
        round(stats.duration_s),
    )


def _avg_risk_key(stats: RouteStats) -> float:
    # A route with no forecast at all cannot claim to be the safest on average.
    return math.inf if stats.avg_risk is None else round(stats.avg_risk, AVG_RISK_KEY_DECIMALS)


def rank_routes(routes: Sequence[RoutePlan]) -> tuple[RankedRoute, ...]:
    """Routes ordered best first, each with a reason. Ties keep the input order (fastest first)."""
    if not routes:
        raise ValueError("At least one route is required.")
    ordered = sorted(routes, key=lambda route: ranking_key(route.stats))
    winner = ordered[0]
    if len(ordered) == 1:
        return (RankedRoute(plan=winner, rank=1, reason=ONLY_ROUTE_REASON),)
    ranked = [RankedRoute(plan=winner, rank=1, reason=explain(winner, ordered[1], is_winner=True))]
    ranked.extend(
        RankedRoute(plan=route, rank=rank, reason=explain(route, winner, is_winner=False))
        for rank, route in enumerate(ordered[1:], start=2)
    )
    return tuple(ranked)


def explain(subject: RoutePlan, other: RoutePlan, *, is_winner: bool) -> str:
    """Name the first ranking criterion on which `subject` and `other` differ."""
    s, o = subject.stats, other.stats
    if s.blocked != o.blocked:
        if s.blocked:
            return f"Crosses No Travel conditions that {other.label} avoids"
        return f"Avoids the No Travel conditions on {other.label}"
    for attribute, noun in _MILE_CRITERIA:
        mine = round(getattr(s, attribute), MILES_KEY_DECIMALS)
        theirs = round(getattr(o, attribute), MILES_KEY_DECIMALS)
        if mine != theirs:
            return f"{format_miles(mine)} {noun} vs {format_miles(theirs)} on {other.label}"
    if _avg_risk_key(s) != _avg_risk_key(o):
        return (
            f"Average risk {_format_avg(s.avg_risk)} vs {_format_avg(o.avg_risk)} on {other.label}"
        )
    return _explain_duration(round(s.duration_s), round(o.duration_s), other.label, is_winner)


def _explain_duration(mine_s: int, theirs_s: int, other_label: str, is_winner: bool) -> str:
    if mine_s == theirs_s:
        return TIED_WINNER_REASON if is_winner else f"Equally safe and as fast as {other_label}"
    gap = format_duration(abs(mine_s - theirs_s))
    if mine_s < theirs_s:
        return f"{TIED_WINNER_REASON}: {gap} faster than {other_label}"
    return f"Equally safe but {gap} slower than {other_label}"


def format_miles(miles: float) -> str:
    """`18.4` -> "18.4", `0.0` -> "0"."""
    return f"{miles:.1f}".removesuffix(".0")


def format_duration(seconds: int) -> str:
    """`3900` -> "1 h 5 min", `600` -> "10 min"."""
    hours, minutes = divmod(round(seconds / 60), 60)
    return f"{hours} h {minutes} min" if hours else f"{minutes} min"


def _format_avg(avg_risk: float | None) -> str:
    return "unknown" if avg_risk is None else f"{avg_risk:.2f}"
