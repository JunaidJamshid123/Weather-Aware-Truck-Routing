import pytest

from routing.clients.base import NoRouteError, UpstreamError
from routing.domain.models import LatLon
from routing.geo.geometry import haversine_mi
from routing.services.alternatives import (
    AlternativeRouteFinder,
    Side,
    ViaSpec,
    rejection_reason,
    via_offset_mi,
    via_point,
)
from routing.tests.factories import DALLAS, DENVER, FakeRouting, make_path

FASTEST = make_path(DALLAS, DENVER)


def is_direct(waypoints):
    return len(waypoints) == 2


def is_left_of_trip(point):
    """Positive cross product of (Denver - Dallas) x (point - Dallas) means left of travel."""
    d_lon, d_lat = DENVER.lon - DALLAS.lon, DENVER.lat - DALLAS.lat
    return d_lon * (point.lat - DALLAS.lat) - d_lat * (point.lon - DALLAS.lon) > 0


@pytest.mark.parametrize(
    ("total_mi", "retry", "expected_km"),
    [(50, False, 25), (500, False, 0.12 * 500 * 1.609344), (2_000, False, 120), (2_000, True, 180)],
)
def test_via_offset_is_clamped(total_mi, retry, expected_km):
    assert via_offset_mi(total_mi, retry=retry) * 1.609344 == pytest.approx(expected_km)


def test_via_points_sit_on_opposite_sides_at_the_requested_offset():
    left = via_point(FASTEST, ViaSpec(0.5, Side.LEFT, 60))
    right = via_point(FASTEST, ViaSpec(0.5, Side.RIGHT, 60))
    assert haversine_mi(left, right) == pytest.approx(120, rel=0.01)
    assert is_left_of_trip(left)
    assert not is_left_of_trip(right)


def test_finds_three_distinct_routes_ordered_by_duration():
    routing = FakeRouting()
    result = AlternativeRouteFinder(routing).find(DALLAS, DENVER, 20_000)
    assert len(result.paths) == 3
    assert result.paths[0].points[0] == DALLAS
    assert result.paths[1].duration_s <= result.paths[2].duration_s
    assert result.warnings == ()
    assert len(routing.calls) == 3  # Fastest + one per side, no retry round.


def test_duplicate_candidates_are_rejected_and_warned_about():
    routing = FakeRouting(lambda _waypoints: FASTEST)
    result = AlternativeRouteFinder(routing).find(DALLAS, DENVER, 20_000)
    assert result.paths == (FASTEST,)
    assert result.warnings == ("Only 1 distinct route found for this trip.",)
    assert len(routing.calls) == 1 + 2 + 4  # Fastest, primary round, retry for both sides.


def test_retry_round_only_targets_the_side_that_failed():
    def build(waypoints):
        if is_direct(waypoints):
            return FASTEST
        return FASTEST if is_left_of_trip(waypoints[1]) else make_path(*waypoints)

    routing = FakeRouting(build)
    result = AlternativeRouteFinder(routing).find(DALLAS, DENVER, 20_000)
    assert len(routing.calls) == 1 + 2 + 2
    assert len(result.paths) == 2
    assert result.warnings == ("Only 2 distinct routes found for this trip.",)


def test_failed_candidate_requests_are_skipped():
    def build(waypoints):
        if is_direct(waypoints):
            return FASTEST
        raise UpstreamError("timeout")

    result = AlternativeRouteFinder(FakeRouting(build)).find(DALLAS, DENVER, 20_000)
    assert result.paths == (FASTEST,)


def test_fastest_route_failure_propagates():
    def build(waypoints):
        raise NoRouteError("none")

    with pytest.raises(NoRouteError):
        AlternativeRouteFinder(FakeRouting(build)).find(DALLAS, DENVER, 20_000)


def test_rejects_candidates_that_are_too_slow():
    detour = make_path(DALLAS, LatLon(36, -96), DENVER, duration_s=FASTEST.duration_s * 1.61)
    assert rejection_reason(detour, FASTEST, [FASTEST]) == "too slow"


def test_rejects_candidates_that_backtrack():
    mid = FASTEST.points[len(FASTEST.points) // 2]
    spur = LatLon(mid.lat - 1.5, mid.lon - 1.5)
    backtracking = make_path(DALLAS, mid, spur, mid, DENVER, duration_s=FASTEST.duration_s)
    assert rejection_reason(backtracking, FASTEST, [FASTEST]).startswith("backtracks")


def test_rejects_near_duplicates_and_accepts_distinct_routes():
    nudged = make_path(DALLAS, LatLon(36.25, -100.9), DENVER)
    assert rejection_reason(nudged, FASTEST, [FASTEST]).startswith("duplicates")
    distinct = make_path(DALLAS, LatLon(34.5, -103.5), DENVER)
    assert rejection_reason(distinct, FASTEST, [FASTEST]) is None
