import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import requests
import responses

from routing.clients.base import UpstreamError, build_session
from routing.clients.open_meteo import OPEN_METEO_URL, OpenMeteoClient, parse_forecasts
from routing.domain.models import GridCell, Weather
from routing.tests.factories import DictCache

FIXTURES = Path(__file__).parent.parent / "fixtures"
START = datetime(2026, 11, 2, 14, tzinfo=UTC)
DALLAS_CELL = GridCell(328, -968)
DENVER_CELL = GridCell(397, -1050)


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def test_parses_multi_location_response_with_null_hours():
    dallas, denver = parse_forecasts(fixture("open_meteo_multi.json"), expected=2)
    assert dallas.start_utc == START
    assert dallas.values[0] == Weather(wind_mph=12.1, rain_in_hr=0.0, snow_in_hr=0.0)
    assert dallas.values[2] is None  # Null wind -> unknown hour.
    assert denver.at(START + timedelta(hours=3)).snow_in_hr == 3.1


def test_parses_single_location_object():
    (series,) = parse_forecasts(fixture("open_meteo_single.json"), expected=1)
    assert series.values[1].rain_in_hr == 0.3


def test_location_count_mismatch_is_an_upstream_error():
    with pytest.raises(UpstreamError, match="Expected 3"):
        parse_forecasts(fixture("open_meteo_multi.json"), expected=3)


def test_unequal_columns_are_an_upstream_error():
    payload = fixture("open_meteo_single.json")
    payload["hourly"]["rain"] = [0.0]
    with pytest.raises(UpstreamError, match="malformed"):
        parse_forecasts(payload, expected=1)


@responses.activate
def test_fetches_once_then_serves_from_cache():
    responses.get(OPEN_METEO_URL, json=fixture("open_meteo_multi.json"))
    client = OpenMeteoClient(build_session(), DictCache())
    first = client.hourly_forecast([DENVER_CELL, DALLAS_CELL, DALLAS_CELL])
    second = client.hourly_forecast([DALLAS_CELL, DENVER_CELL])
    assert len(responses.calls) == 1
    assert first == second
    assert first[DALLAS_CELL].values[0].wind_mph == 12.1  # Cells are mapped in request order.
    params = responses.calls[0].request.params
    assert params["latitude"] == "32.8000,39.7000"
    assert params["longitude"] == "-96.8000,-105.0000"
    assert params["hourly"] == "wind_speed_10m,rain,snowfall"
    assert params["wind_speed_unit"] == "mph"
    assert params["precipitation_unit"] == "inch"
    assert params["timezone"] == "UTC"


@responses.activate
def test_large_requests_are_split_into_chunks():
    responses.get(OPEN_METEO_URL, json=fixture("open_meteo_single.json"))
    client = OpenMeteoClient(build_session(), DictCache(), chunk_size=1)
    result = client.hourly_forecast([DALLAS_CELL, DENVER_CELL])
    assert len(responses.calls) == 2
    assert set(result) == {DALLAS_CELL, DENVER_CELL}


@pytest.mark.parametrize(
    "response_kwargs",
    [
        {"json": {"error": True, "reason": "Latitude must be in range"}, "status": 400},
        {"json": {"reason": "busy"}, "status": 503},
        {"body": "not json"},
        {"body": requests.ConnectionError("down")},
    ],
)
@responses.activate
def test_failures_degrade_to_missing_cells_without_raising(response_kwargs):
    responses.get(OPEN_METEO_URL, **response_kwargs)
    cache = DictCache()
    client = OpenMeteoClient(build_session(), cache)
    assert client.hourly_forecast([DALLAS_CELL]) == {}
    assert cache.data == {}  # Failures are never cached.


def test_no_cells_means_no_request():
    assert OpenMeteoClient(build_session(), DictCache()).hourly_forecast([]) == {}
