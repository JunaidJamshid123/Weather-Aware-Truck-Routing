from datetime import UTC, datetime, timedelta

import pytest

from routing.domain.constants import HEATMAP_HOURS, HEATMAP_UNKNOWN_RISK
from routing.domain.models import GridCell, HourlySeries, Weather
from routing.services.heatmap import build_heatmap, heatmap_corridor_points, heatmap_start_utc
from routing.tests.factories import CALM, DALLAS, DENVER, DEPARTURE, make_path

PATH = make_path(DALLAS, DENVER)


def test_corridor_points_are_spaced_and_deduped_across_routes():
    points = heatmap_corridor_points([PATH, PATH])
    cells = {GridCell.containing(p) for p in points}
    assert len(cells) == len(points)
    assert len(points) == len(heatmap_corridor_points([PATH]))
    assert 60 <= len(points) <= 70  # ~662 mi every 10 mi.


def test_corridor_spacing_caps_points_on_long_routes():
    long_path = make_path(DALLAS, DENVER, DALLAS.__class__(47.6, -122.3), points_per_leg=400)
    assert len(heatmap_corridor_points([long_path])) <= 151


@pytest.mark.parametrize(
    ("departure", "expected"),
    [
        (datetime(2026, 11, 2, 14, 0, tzinfo=UTC), datetime(2026, 11, 2, 14, tzinfo=UTC)),
        (datetime(2026, 11, 2, 14, 29, tzinfo=UTC), datetime(2026, 11, 2, 14, tzinfo=UTC)),
        (datetime(2026, 11, 2, 14, 30, tzinfo=UTC), datetime(2026, 11, 2, 15, tzinfo=UTC)),
        (datetime(2026, 11, 2, 23, 45, tzinfo=UTC), datetime(2026, 11, 3, 0, tzinfo=UTC)),
    ],
)
def test_heatmap_starts_at_nearest_hour(departure, expected):
    assert heatmap_start_utc(departure) == expected


def test_heatmap_risk_per_hour_uses_load_rules_and_marks_unknown():
    point = PATH.points[0]
    windy = Weather(wind_mph=50, rain_in_hr=0, snow_in_hr=0)
    # Calm for the first 10 hours, windy afterwards, and the series ends at hour 40.
    series = HourlySeries(start_utc=DEPARTURE, values=(CALM,) * 10 + (windy,) * 31)
    light = build_heatmap([point], {GridCell.containing(point): series}, DEPARTURE, 20_000)
    heavy = build_heatmap([point], {GridCell.containing(point): series}, DEPARTURE, 30_001)
    assert light.hours == HEATMAP_HOURS == len(light.points[0].risk)
    assert light.start_utc == DEPARTURE
    assert light.points[0].risk[:10] == (0,) * 10
    assert light.points[0].risk[10:41] == (3,) * 31
    assert light.points[0].risk[41:] == (HEATMAP_UNKNOWN_RISK,) * 8
    assert heavy.points[0].risk[10] == 4


def test_heatmap_point_without_series_is_all_unknown():
    heatmap = build_heatmap([PATH.points[0]], {}, DEPARTURE + timedelta(minutes=5), 20_000)
    assert heatmap.points[0].risk == (HEATMAP_UNKNOWN_RISK,) * HEATMAP_HOURS
