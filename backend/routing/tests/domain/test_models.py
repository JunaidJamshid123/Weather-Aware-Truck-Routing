import pickle
from datetime import UTC, datetime, timedelta

from routing.domain.models import GridCell, HourlySeries, LatLon, Weather

START = datetime(2026, 11, 2, 0, 0, tzinfo=UTC)
SERIES = HourlySeries(
    start_utc=START,
    values=(Weather(1, 0, 0), Weather(2, 0, 0), None, Weather(4, 0, 0)),
)


def test_series_picks_nearest_hour():
    assert SERIES.at(START + timedelta(minutes=29)).wind_mph == 1
    assert SERIES.at(START + timedelta(minutes=30)).wind_mph == 2  # Half past rounds up.
    assert SERIES.at(START + timedelta(hours=1, minutes=10)).wind_mph == 2


def test_series_returns_none_for_null_hours_and_out_of_range():
    assert SERIES.at(START + timedelta(hours=2)) is None
    assert SERIES.at(START - timedelta(hours=1)) is None
    assert SERIES.at(START + timedelta(hours=4)) is None
    assert SERIES.at(START + timedelta(hours=3, minutes=29)).wind_mph == 4


def test_grid_cell_rounds_to_nearest_tenth_degree():
    cell = GridCell.containing(LatLon(32.7767, -96.797))
    assert cell == GridCell(328, -968)
    assert cell.center == LatLon(32.8, -96.8)
    assert GridCell.containing(LatLon(32.81, -96.79)) == cell


def test_domain_objects_survive_cache_pickling():
    assert pickle.loads(pickle.dumps(SERIES)) == SERIES
