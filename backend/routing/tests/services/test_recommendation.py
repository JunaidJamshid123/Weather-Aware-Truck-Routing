from dataclasses import replace

import pytest

from routing.domain.results import RoutePlan, RouteStats
from routing.services.recommendation import (
    ONLY_ROUTE_REASON,
    TIED_WINNER_REASON,
    format_duration,
    format_miles,
    rank_routes,
)
from routing.tests.factories import DALLAS, DENVER, DEPARTURE, make_path

PATH = make_path(DALLAS, DENVER)
BASE_STATS = RouteStats(
    distance_mi=700.0,
    duration_s=40_000,
    arrival_utc=DEPARTURE,
    moderate_mi=0.0,
    high_mi=0.0,
    severe_mi=0.0,
    no_travel_mi=0.0,
    unknown_mi=0.0,
    avg_risk=0.5,
    max_risk=None,
    blocked=False,
)


def route(label, **stats):
    return RoutePlan(
        id=label.lower(),
        label=label,
        path=PATH,
        display_points=(),
        checkpoints=(),
        stats=replace(BASE_STATS, **stats),
    )


def ranked_labels(*routes):
    return [r.plan.label for r in rank_routes(routes)]


def test_blocked_route_loses_even_when_otherwise_better():
    blocked = route("Blocked", blocked=True, no_travel_mi=5, duration_s=1)
    safe = route("Safe", severe_mi=300, high_mi=100, avg_risk=2.9)
    ranked = rank_routes([blocked, safe])
    assert [r.plan.label for r in ranked] == ["Safe", "Blocked"]
    assert ranked[0].reason == "Avoids the No Travel conditions on Blocked"
    assert ranked[1].reason == "Crosses No Travel conditions that Safe avoids"


def test_fewer_no_travel_miles_wins_when_all_blocked():
    a = route("A", blocked=True, no_travel_mi=20)
    b = route("B", blocked=True, no_travel_mi=5)
    assert ranked_labels(a, b) == ["B", "A"]


def test_severe_miles_decide_before_high_miles():
    a = route("A", severe_mi=18.4, high_mi=0)
    b = route("B", severe_mi=0, high_mi=200)
    ranked = rank_routes([a, b])
    assert ranked[0].plan.label == "B"
    assert ranked[0].reason == "0 severe miles vs 18.4 on A"
    assert ranked[1].reason == "18.4 severe miles vs 0 on B"


def test_high_miles_decide_before_average_risk():
    a = route("A", high_mi=10, avg_risk=0.1)
    b = route("B", high_mi=5, avg_risk=1.9)
    assert ranked_labels(a, b) == ["B", "A"]
    assert rank_routes([a, b])[0].reason == "5 high-risk miles vs 10 on A"


def test_average_risk_decides_before_duration():
    slow_calm = route("Slow", avg_risk=0.2, duration_s=50_000)
    fast_rough = route("Fast", avg_risk=0.8, duration_s=30_000)
    ranked = rank_routes([fast_rough, slow_calm])
    assert ranked[0].plan.label == "Slow"
    assert ranked[0].reason == "Average risk 0.20 vs 0.80 on Fast"


def test_duration_decides_between_equally_safe_routes():
    slow = route("Slow", duration_s=45_000)
    fast = route("Fast", duration_s=41_100)
    ranked = rank_routes([slow, fast])
    assert ranked[0].plan.label == "Fast"
    assert ranked[0].reason == f"{TIED_WINNER_REASON}: 1 h 5 min faster than Slow"
    assert ranked[1].reason == "Equally safe but 1 h 5 min slower than Fast"


def test_float_noise_cannot_decide_a_rank():
    a = route("A", severe_mi=10.000001, avg_risk=0.5000001, duration_s=100)
    b = route("B", severe_mi=9.99999, avg_risk=0.4999999, duration_s=200)
    assert ranked_labels(a, b) == ["A", "B"]


def test_full_tie_keeps_input_order():
    a, b = route("A"), route("B")
    ranked = rank_routes([a, b])
    assert [r.plan.label for r in ranked] == ["A", "B"]
    assert ranked[0].reason == TIED_WINNER_REASON
    assert ranked[1].reason == "Equally safe and as fast as A"


def test_unknown_average_ranks_below_known_average():
    unknown = route("Unknown", avg_risk=None)
    known = route("Known", avg_risk=3.5)
    assert ranked_labels(unknown, known) == ["Known", "Unknown"]
    assert rank_routes([unknown, known])[0].reason == "Average risk 3.50 vs unknown on Unknown"


def test_ranks_and_recommendation_flags():
    ranked = rank_routes([route("A", high_mi=3), route("B"), route("C", high_mi=1)])
    assert [r.plan.label for r in ranked] == ["B", "C", "A"]
    assert [r.rank for r in ranked] == [1, 2, 3]
    assert [r.is_recommended for r in ranked] == [True, False, False]


def test_single_route():
    ranked = rank_routes([route("Only")])
    assert ranked[0].reason == ONLY_ROUTE_REASON


def test_no_routes_is_an_error():
    with pytest.raises(ValueError, match="At least one"):
        rank_routes([])


@pytest.mark.parametrize(("miles", "text"), [(0.0, "0"), (18.4, "18.4"), (12.0, "12")])
def test_format_miles(miles, text):
    assert format_miles(miles) == text


@pytest.mark.parametrize(
    ("seconds", "text"), [(600, "10 min"), (3_900, "1 h 5 min"), (7_200, "2 h 0 min")]
)
def test_format_duration(seconds, text):
    assert format_duration(seconds) == text
