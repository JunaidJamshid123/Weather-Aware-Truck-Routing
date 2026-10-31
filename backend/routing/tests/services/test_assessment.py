from datetime import timedelta

import pytest

from routing.domain.models import GridCell, Weather
from routing.domain.risk import Risk
from routing.services.assessment import assess_checkpoints, owned_miles, summarize_route
from routing.services.checkpoints import place_checkpoints
from routing.tests.factories import CALM, DALLAS, DENVER, DEPARTURE, constant_series, make_path

STORM = Weather(wind_mph=48, rain_in_hr=0, snow_in_hr=0)  # SEVERE, NO_TRAVEL when heavy.


@pytest.mark.parametrize(
    ("miles", "total", "expected"),
    [
        ((0, 25, 50, 60), 60, (12.5, 25, 17.5, 5)),
        ((0, 10), 10, (5, 5)),
        ((0,), 0, (0,)),
    ],
)
def test_owned_miles(miles, total, expected):
    assert owned_miles(miles, total) == pytest.approx(expected)


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_owned_miles_sum_to_route_distance(interval):
    path = make_path(DALLAS, DENVER)
    placements = place_checkpoints(path, DEPARTURE, interval)
    assert sum(owned_miles([p.mile for p in placements], path.distance_mi)) == pytest.approx(
        path.distance_mi, abs=1e-6
    )


def plan_route(weather_for_index, load_lb=20_000):
    """Assess Dallas->Denver with weather chosen per checkpoint index."""
    path = make_path(DALLAS, DENVER)
    placements = place_checkpoints(path, DEPARTURE, 25)
    series = {
        GridCell.containing(p.point): constant_series(w)
        for p in placements
        if (w := weather_for_index(p.index)) is not None
    }
    checkpoints = assess_checkpoints(placements, series, load_lb, path.distance_mi)
    return path, checkpoints, summarize_route(path, checkpoints, DEPARTURE)


def test_stats_count_miles_per_level():
    _, checkpoints, stats = plan_route(lambda i: STORM if i in (3, 4) else CALM)
    assert stats.severe_mi == pytest.approx(50)
    assert stats.high_mi == stats.moderate_mi == stats.no_travel_mi == stats.unknown_mi == 0
    assert stats.max_risk is Risk.SEVERE
    assert not stats.blocked
    assert stats.avg_risk == pytest.approx(3 * 50 / stats.distance_mi)
    assert checkpoints[3].assessment.drivers == ("wind",)


def test_heavy_load_turns_storm_into_no_travel_and_blocks_route():
    _, checkpoints, stats = plan_route(lambda i: STORM if i == 3 else CALM, load_lb=35_000)
    assert stats.no_travel_mi == pytest.approx(25)
    assert stats.severe_mi == 0
    assert stats.blocked
    assert checkpoints[3].assessment.load_override_applied


def test_unknown_weather_is_excluded_from_average_not_treated_as_low():
    _, checkpoints, stats = plan_route(lambda i: None if i < 4 else STORM)
    assert checkpoints[0].weather is None
    assert checkpoints[0].risk is None
    assert stats.unknown_mi == pytest.approx(87.5)
    assert stats.avg_risk == pytest.approx(3.0)


def test_route_without_any_weather_has_no_average():
    _, _, stats = plan_route(lambda _: None)
    assert stats.avg_risk is None
    assert stats.max_risk is None
    assert stats.unknown_mi == pytest.approx(stats.distance_mi)


def test_arrival_matches_destination_eta():
    path, checkpoints, stats = plan_route(lambda _: CALM)
    assert stats.arrival_utc == checkpoints[-1].eta_utc
    assert stats.arrival_utc == DEPARTURE + timedelta(seconds=path.duration_s)
