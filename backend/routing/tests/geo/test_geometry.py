from itertools import pairwise

import pytest

from routing.domain.models import LatLon
from routing.geo.geometry import (
    bearing_at_distance,
    bearing_deg,
    cumulative_distances_mi,
    evenly_spaced_distances,
    haversine_mi,
    offset_point,
    point_at_distance,
    simplify,
)
from routing.tests.factories import DALLAS, DENVER, make_path, polyline

NEW_YORK = LatLon(40.7128, -74.0060)
LOS_ANGELES = LatLon(34.0522, -118.2437)
LONDON = LatLon(51.5074, -0.1278)
PARIS = LatLon(48.8566, 2.3522)


@pytest.mark.parametrize(
    ("a", "b", "expected_mi"),
    [(NEW_YORK, LOS_ANGELES, 2445.6), (LONDON, PARIS, 213.5), (DALLAS, DENVER, 662.4)],
)
def test_haversine_matches_known_city_pairs(a, b, expected_mi):
    assert haversine_mi(a, b) == pytest.approx(expected_mi, rel=0.005)
    assert haversine_mi(b, a) == pytest.approx(haversine_mi(a, b))


def test_haversine_of_identical_points_is_zero():
    assert haversine_mi(DALLAS, DALLAS) == 0


def test_cumulative_distances_start_at_zero_and_never_decrease():
    points = polyline(DALLAS, DENVER, LOS_ANGELES)
    cumulative = cumulative_distances_mi(points)
    assert cumulative[0] == 0
    assert all(b >= a for a, b in pairwise(cumulative))
    assert cumulative[-1] == pytest.approx(
        haversine_mi(DALLAS, DENVER) + haversine_mi(DENVER, LOS_ANGELES), rel=1e-3
    )
    assert cumulative_distances_mi([]) == ()


class TestPointAtDistance:
    path = make_path(DALLAS, DENVER)

    def at(self, distance_mi):
        return point_at_distance(self.path.points, self.path.cumulative_mi, distance_mi)

    def test_endpoints(self):
        assert self.at(0) == DALLAS
        assert self.at(self.path.distance_mi).lat == pytest.approx(DENVER.lat)

    def test_midpoint_is_half_way_along(self):
        mid = self.at(self.path.distance_mi / 2)
        assert haversine_mi(DALLAS, mid) == pytest.approx(self.path.distance_mi / 2, rel=0.01)

    def test_clamps_beyond_the_route(self):
        assert self.at(-10) == DALLAS
        assert self.at(self.path.distance_mi + 500).lon == pytest.approx(DENVER.lon)

    def test_rejects_mismatched_inputs(self):
        with pytest.raises(ValueError, match="equal length"):
            point_at_distance([DALLAS], [0.0, 1.0], 0)

    def test_handles_duplicate_vertices(self):
        points = (DALLAS, DALLAS, DENVER)
        assert point_at_distance(points, cumulative_distances_mi(points), 0) == DALLAS


@pytest.mark.parametrize(
    ("total", "spacing", "expected"),
    [
        (100, 25, (0, 25, 50, 75, 100)),
        (60, 25, (0, 25, 50, 60)),
        (10, 25, (0, 10)),
        (0, 25, (0,)),
        (50.0000000001, 25, (0, 25, 50.0000000001)),
    ],
)
def test_evenly_spaced_distances(total, spacing, expected):
    assert evenly_spaced_distances(total, spacing) == pytest.approx(expected)


def test_evenly_spaced_distances_rejects_non_positive_spacing():
    with pytest.raises(ValueError, match="positive"):
        evenly_spaced_distances(10, 0)


def test_bearing_cardinal_directions():
    origin = LatLon(0, 0)
    assert bearing_deg(origin, LatLon(1, 0)) == pytest.approx(0)
    assert bearing_deg(origin, LatLon(0, 1)) == pytest.approx(90)
    assert bearing_deg(origin, LatLon(-1, 0)) == pytest.approx(180)
    assert bearing_deg(origin, LatLon(0, -1)) == pytest.approx(270)


def test_offset_point_travels_the_requested_distance_and_direction():
    target = offset_point(DALLAS, 45, 100)
    assert haversine_mi(DALLAS, target) == pytest.approx(100, rel=1e-6)
    assert bearing_deg(DALLAS, target) == pytest.approx(45, abs=0.01)


def test_offset_is_perpendicular_to_the_route():
    path = make_path(DALLAS, DENVER)
    middle_mi = path.distance_mi / 2
    heading = bearing_at_distance(path.points, path.cumulative_mi, middle_mi, 5)
    anchor = point_at_distance(path.points, path.cumulative_mi, middle_mi)
    left = offset_point(anchor, heading - 90, 50)
    # Moving perpendicular, the offset point stays about equidistant from both ends.
    assert haversine_mi(left, DALLAS) == pytest.approx(haversine_mi(left, DENVER), rel=0.02)
    assert haversine_mi(anchor, left) == pytest.approx(50, rel=1e-6)


def test_simplify_drops_collinear_points_and_keeps_corners():
    corner = LatLon(DALLAS.lat, DENVER.lon)
    points = polyline(DALLAS, corner, DENVER)
    simplified = simplify(points, 0.0005)
    assert simplified[0] == DALLAS
    assert simplified[-1] == points[-1]
    assert corner in simplified
    assert len(simplified) < 10


def test_simplify_keeps_short_lines_untouched():
    assert simplify([DALLAS, DENVER], 1) == (DALLAS, DENVER)
    assert simplify([DALLAS, DALLAS, DALLAS], 0.1) == (DALLAS, DALLAS)
