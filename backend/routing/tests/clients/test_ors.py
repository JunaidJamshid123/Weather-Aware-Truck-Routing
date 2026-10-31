import json
from pathlib import Path

import pytest
import requests
import responses

from routing.clients.base import NoRouteError, RateLimitError, UpstreamError, build_session
from routing.clients.ors import AUTOCOMPLETE_PATH, DIRECTIONS_PATH, ORS_BASE_URL, OrsClient
from routing.domain.models import LatLon

FIXTURES = Path(__file__).parent.parent / "fixtures"
DIRECTIONS_URL = ORS_BASE_URL + DIRECTIONS_PATH
AUTOCOMPLETE_URL = ORS_BASE_URL + AUTOCOMPLETE_PATH
WAYPOINTS = (LatLon(32.0, -97.0), LatLon(33.0, -96.0))


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def client():
    return OrsClient(api_key="secret-key", session=build_session())


@responses.activate
def test_route_parses_geometry_distance_and_step_times(client):
    responses.post(DIRECTIONS_URL, json=fixture("ors_directions.json"))
    path = client.route(WAYPOINTS, load_lb=20_000)
    assert path.points[0] == LatLon(32.0, -97.0)
    assert len(path.points) == len(path.cumulative_mi) == 5
    assert path.distance_mi == pytest.approx(path.cumulative_mi[-1])
    assert path.duration_s == 5400
    profile = path.time_profile
    assert profile.cumulative_s == (0, 3600, 5400, 5400)
    assert profile.cumulative_mi[1] == pytest.approx(path.cumulative_mi[2])
    assert profile.cumulative_mi[-1] == pytest.approx(path.distance_mi)


@responses.activate
def test_route_request_body_and_auth_header(client):
    responses.post(DIRECTIONS_URL, json=fixture("ors_directions.json"))
    client.route(WAYPOINTS, load_lb=20_000)
    request = responses.calls[0].request
    body = json.loads(request.body)
    assert request.headers["Authorization"] == "secret-key"
    assert "application/geo+json" in request.headers["Accept"]  # Else ORS answers 406.
    assert body["coordinates"] == [[-97.0, 32.0], [-96.0, 33.0]]
    assert body["units"] == "mi"
    assert body["radiuses"] == [-1, -1]
    assert "options" not in body


@responses.activate
def test_weight_restriction_is_sent_in_metric_tons_when_enabled():
    responses.post(DIRECTIONS_URL, json=fixture("ors_directions.json"))
    client = OrsClient(api_key="k", session=build_session(), apply_weight_restriction=True)
    client.route(WAYPOINTS, load_lb=40_000)
    body = json.loads(responses.calls[0].request.body)
    assert body["options"]["profile_params"]["restrictions"]["weight"] == pytest.approx(18.14)


@responses.activate
def test_route_without_steps_falls_back_to_proportional_eta(client):
    payload = fixture("ors_directions.json")
    payload["features"][0]["properties"]["segments"] = []
    responses.post(DIRECTIONS_URL, json=payload)
    assert client.route(WAYPOINTS, load_lb=1).time_profile is None


@responses.activate
def test_malformed_steps_fall_back_to_proportional_eta(client):
    payload = fixture("ors_directions.json")
    payload["features"][0]["properties"]["segments"][0]["steps"][0].pop("way_points")
    responses.post(DIRECTIONS_URL, json=payload)
    assert client.route(WAYPOINTS, load_lb=1).time_profile is None


@pytest.mark.parametrize(
    ("status", "body", "error", "message"),
    [
        (
            404,
            {"error": {"code": 2009, "message": "Route could not be found"}},
            NoRouteError,
            "No drivable",
        ),
        (
            404,
            {"error": {"code": 2010, "message": "Could not find routable point"}},
            NoRouteError,
            "No drivable",
        ),
        (
            400,
            {"error": {"code": 2004, "message": "Request parameters exceed limits"}},
            NoRouteError,
            "longer",
        ),
        (403, {"error": "Quota exceeded"}, RateLimitError, "capacity"),
        (429, {"error": "Rate limit exceeded"}, RateLimitError, "capacity"),
        (500, {"error": {"code": 2099, "message": "Unknown"}}, UpstreamError, "unavailable"),
    ],
)
@responses.activate
def test_error_mapping(client, status, body, error, message):
    responses.post(DIRECTIONS_URL, json=body, status=status)
    with pytest.raises(error, match=message) as raised:
        client.route(WAYPOINTS, load_lb=1)
    assert "secret-key" not in str(raised.value)


@responses.activate
def test_malformed_route_payload_is_an_upstream_error(client):
    responses.post(DIRECTIONS_URL, json={"features": []})
    with pytest.raises(UpstreamError):
        client.route(WAYPOINTS, load_lb=1)


@responses.activate
def test_non_json_body_is_an_upstream_error(client):
    responses.post(DIRECTIONS_URL, body="<html>bad gateway</html>")
    with pytest.raises(UpstreamError, match="unreadable"):
        client.route(WAYPOINTS, load_lb=1)


@responses.activate
def test_single_point_geometry_means_no_route(client):
    payload = fixture("ors_directions.json")
    payload["features"][0]["geometry"]["coordinates"] = [[-97.0, 32.0]]
    responses.post(DIRECTIONS_URL, json=payload)
    with pytest.raises(NoRouteError):
        client.route(WAYPOINTS, load_lb=1)


@responses.activate
def test_network_failure_is_an_upstream_error(client):
    responses.post(DIRECTIONS_URL, body=requests.ConnectionError("down"))
    with pytest.raises(UpstreamError, match="could not be reached"):
        client.route(WAYPOINTS, load_lb=1)


@responses.activate
def test_autocomplete_parses_labels_and_coordinates(client):
    responses.get(AUTOCOMPLETE_URL, json=fixture("ors_autocomplete.json"))
    locations = client.autocomplete("dallas", size=5)
    assert [loc.label for loc in locations] == ["Dallas, TX, USA", "Dallas County, TX, USA"]
    assert locations[0].point == LatLon(32.77666, -96.79698)
    params = responses.calls[0].request.params
    assert params == {"text": "dallas", "size": "5", "boundary.country": "US"}


@responses.activate
def test_autocomplete_malformed_feature_is_an_upstream_error(client):
    responses.get(AUTOCOMPLETE_URL, json={"features": [{"properties": {}}]})
    with pytest.raises(UpstreamError):
        client.autocomplete("dallas", size=5)
