from datetime import timedelta
from itertools import pairwise

import pytest

from routing.domain.models import TimeProfile
from routing.services.checkpoints import place_checkpoints, time_at_distance_s
from routing.tests.factories import DALLAS, DENVER, DEPARTURE, make_path


def test_checkpoints_are_evenly_spaced_and_end_at_destination():
    path = make_path(DALLAS, DENVER)
    placements = place_checkpoints(path, DEPARTURE, 25)
    miles = [p.mile for p in placements]
    assert miles[0] == 0
    assert all(b - a == pytest.approx(25) for a, b in pairwise(miles[:-1]))
    assert miles[-1] == pytest.approx(path.distance_mi)
    assert 0 < miles[-1] - miles[-2] <= 25
    assert [p.index for p in placements] == list(range(len(placements)))
    assert placements[-1].point.lat == pytest.approx(DENVER.lat)


def test_etas_are_monotonic_and_start_at_departure():
    path = make_path(DALLAS, DENVER, duration_s=43_200)
    placements = place_checkpoints(path, DEPARTURE, 10)
    etas = [p.eta_utc for p in placements]
    assert etas[0] == DEPARTURE
    assert etas == sorted(etas)
    assert etas[-1] == DEPARTURE + timedelta(seconds=43_200)


def test_interval_longer_than_trip_gives_start_and_end_only():
    path = make_path(DALLAS, DALLAS.__class__(DALLAS.lat + 0.1, DALLAS.lon))
    placements = place_checkpoints(path, DEPARTURE, 50)
    assert [p.mile for p in placements] == [0, pytest.approx(path.distance_mi)]


def test_proportional_eta_without_steps():
    path = make_path(DALLAS, DENVER, duration_s=10_000)
    assert time_at_distance_s(path, path.distance_mi / 4) == pytest.approx(2_500)
    assert time_at_distance_s(path, -5) == 0
    assert time_at_distance_s(path, path.distance_mi * 2) == pytest.approx(10_000)


def test_eta_interpolates_inside_a_step():
    # 100 mi of highway in 1 h, then 50 mi of slow road in 2 h.
    profile = TimeProfile(cumulative_mi=(0, 100, 150), cumulative_s=(0, 3_600, 10_800))
    path = make_path(DALLAS, DENVER, duration_s=10_800, time_profile=profile)
    assert time_at_distance_s(path, 50) == pytest.approx(1_800)
    assert time_at_distance_s(path, 125) == pytest.approx(7_200)
    assert time_at_distance_s(path, 400) == pytest.approx(10_800)  # Beyond the last step.


def test_zero_length_steps_do_not_break_interpolation():
    profile = TimeProfile(cumulative_mi=(0, 0, 100, 100), cumulative_s=(0, 60, 3_660, 3_660))
    path = make_path(DALLAS, DENVER, time_profile=profile)
    assert time_at_distance_s(path, 0) == pytest.approx(60)
    assert time_at_distance_s(path, 50) == pytest.approx(1_860)
