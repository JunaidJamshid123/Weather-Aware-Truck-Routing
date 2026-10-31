import pytest

from routing.domain.models import LatLon
from routing.geo.overlap import overlap_fraction, route_overlap, self_overlap_fraction
from routing.tests.factories import make_path

THRESHOLD_MI = 1.25
SPACING_MI = 1.25
A = LatLon(35.0, -100.0)
B = LatLon(35.0, -98.0)
C = LatLon(35.0, -96.0)


def overlap(probe, target):
    return overlap_fraction(probe, target, threshold_mi=THRESHOLD_MI, spacing_mi=SPACING_MI)


def test_identical_routes_fully_overlap():
    path = make_path(A, C)
    assert overlap(path, path) == pytest.approx(1.0)


def test_parallel_routes_far_apart_do_not_overlap():
    north = make_path(LatLon(36.0, -100.0), LatLon(36.0, -96.0))
    assert overlap(make_path(A, C), north) == 0


def test_partial_overlap_is_proportional():
    full = make_path(A, C)
    half = make_path(A, B)
    assert overlap(half, full) == pytest.approx(1.0)
    assert overlap(full, half) == pytest.approx(0.5, abs=0.02)
    assert route_overlap(
        full, half, threshold_mi=THRESHOLD_MI, spacing_mi=SPACING_MI
    ) == pytest.approx(1.0)


def test_straight_route_does_not_overlap_itself():
    fraction = self_overlap_fraction(
        make_path(A, C), threshold_mi=THRESHOLD_MI, spacing_mi=SPACING_MI, min_gap_mi=6
    )
    assert fraction == 0


def test_out_and_back_spur_is_detected_as_self_overlap():
    spur_tip = LatLon(36.0, -98.0)  # ~69 mi north of B, driven out and back.
    path = make_path(A, B, spur_tip, B, C)
    fraction = self_overlap_fraction(
        path, threshold_mi=THRESHOLD_MI, spacing_mi=SPACING_MI, min_gap_mi=6
    )
    spur_share = 2 * 69 / path.distance_mi
    assert fraction == pytest.approx(spur_share, abs=0.05)
