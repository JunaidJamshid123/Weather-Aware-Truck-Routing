from datetime import UTC, datetime

import pytest
from django.conf import settings
from django.test import override_settings
from freezegun import freeze_time
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from routing.api import views
from routing.clients.base import RateLimitError, UpstreamError
from routing.domain.models import LatLon, Location, Weather
from routing.services.alternatives import AlternativeRouteFinder
from routing.services.geocode import GeocodeService
from routing.services.plan import WEATHER_DOWN_WARNING, PlanService
from routing.tests.factories import (
    DictCache,
    FakeRouting,
    FakeWeather,
    NoRouting,
    UnavailableWeather,
)

NOW = datetime(2026, 11, 2, 13, 20, tzinfo=UTC)
VALID_REQUEST = {
    "origin": {"label": "Dallas, TX", "lat": 32.7767, "lon": -96.797},
    "destination": {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
    "departure_time": "2026-11-02T14:00:00Z",
    "load_weight_lb": 42000,
    "checkpoint_interval_mi": 25,
}


class FakeGeocoder:
    def __init__(self):
        self.queries = []

    def autocomplete(self, text, *, size):
        self.queries.append(text)
        return [Location("Dallas, TX, USA", LatLon(32.776664, -96.796988))][:size]


class FailingRouting:
    def __init__(self, error):
        self._error = error

    def route(self, waypoints, *, load_lb):
        raise self._error


@pytest.fixture(autouse=True)
def _frozen_clock():
    with freeze_time(NOW):
        yield


@pytest.fixture
def api():
    return APIClient()


def use_plan_service(monkeypatch, routing=None, weather=None):
    service = PlanService(
        route_finder=AlternativeRouteFinder(routing or FakeRouting()),
        weather=weather or FakeWeather(),
        cache=DictCache(),
    )
    monkeypatch.setattr(views, "plan_service", lambda: service)


def post_plan(api, **overrides):
    return api.post("/api/plan", {**VALID_REQUEST, **overrides}, format="json")


def test_health(api):
    response = api.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_plan_happy_path_matches_contract(api, monkeypatch):
    use_plan_service(monkeypatch)
    response = post_plan(api)
    assert response.status_code == 200
    body = response.json()
    assert body["departure_time"] == "2026-11-02T14:00:00Z"
    assert body["checkpoint_interval_mi"] == 25
    assert body["load_weight_lb"] == 42000
    assert body["all_blocked"] is False
    assert body["warnings"] == []
    assert len(body["routes"]) == 3
    first = body["routes"][0]
    assert body["recommended_route_id"] == first["id"]
    assert first["geometry"][0] == [-96.797, 32.7767]  # [lon, lat]
    summary = first["summary"]
    assert summary["is_recommended"] is True
    assert summary["rank"] == 1
    assert summary["max_risk"] == "LOW"
    assert summary["arrival_time"].endswith("Z")
    assert set(summary) >= {
        "distance_mi",
        "duration_s",
        "severe_miles",
        "high_miles",
        "moderate_miles",
        "no_travel_miles",
        "unknown_miles",
        "avg_risk",
        "blocked",
        "reason",
    }
    checkpoint = first["checkpoints"][0]
    assert checkpoint == {
        "index": 0,
        "mile": 0.0,
        "lat": 32.7767,
        "lon": -96.797,
        "eta": "2026-11-02T14:00:00Z",
        "weather": {"wind_mph": 5.0, "rain_in_hr": 0.0, "snow_in_hr": 0.0},
        "risk": "LOW",
        "risk_level": 0,
        "drivers": [],
        "load_override_applied": False,
        "owned_miles": 12.5,
    }
    heatmap = body["heatmap"]
    assert heatmap["start_time"] == "2026-11-02T14:00:00Z"
    assert heatmap["hours"] == 49
    assert all(len(point["risk"]) == 49 for point in heatmap["points"])


def test_plan_response_is_gzipped_when_accepted(api, monkeypatch):
    use_plan_service(monkeypatch)
    response = api.post("/api/plan", VALID_REQUEST, format="json", HTTP_ACCEPT_ENCODING="gzip")
    assert response["Content-Encoding"] == "gzip"


def test_weather_outage_still_returns_routes_with_null_weather(api, monkeypatch):
    use_plan_service(monkeypatch, weather=UnavailableWeather())
    body = post_plan(api).json()
    assert body["warnings"] == [WEATHER_DOWN_WARNING]
    checkpoint = body["routes"][0]["checkpoints"][0]
    assert checkpoint["weather"] is None
    assert checkpoint["risk"] is None
    assert checkpoint["risk_level"] is None
    assert body["routes"][0]["summary"]["avg_risk"] is None
    assert body["heatmap"]["points"][0]["risk"][0] == -1


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"load_weight_lb": 0}, "load_weight_lb"),
        ({"load_weight_lb": 80_001}, "load_weight_lb"),
        ({"load_weight_lb": 1000.5}, "load_weight_lb"),
        ({"checkpoint_interval_mi": 20}, "checkpoint_interval_mi"),
        ({"departure_time": "2026-11-02T12:59:00Z"}, "departure_time"),
        ({"departure_time": "2026-11-07T14:00:00Z"}, "departure_time"),
        ({"departure_time": "not a date"}, "departure_time"),
        ({"origin": {"label": "X", "lat": 91, "lon": 0}}, "origin"),
        ({"destination": {"label": "X", "lat": 0, "lon": -181}}, "destination"),
        ({"destination": {"label": "Same", "lat": 32.7767, "lon": -96.797}}, "destination"),
        ({"origin": None}, "origin"),
    ],
)
def test_plan_validation_errors(api, monkeypatch, overrides, field):
    use_plan_service(monkeypatch)
    response = post_plan(api, **overrides)
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert field in error["details"]
    assert error["message"].startswith(f"{field}:")


def test_departure_in_current_hour_is_accepted(api, monkeypatch):
    use_plan_service(monkeypatch)
    assert post_plan(api, departure_time="2026-11-02T13:05:00Z").status_code == 200


def test_malformed_json_is_a_uniform_error(api):
    response = api.post("/api/plan", "{bad json", content_type="application/json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "parse_error"


@pytest.mark.parametrize(
    ("routing", "status", "code"),
    [
        (NoRouting(), 422, "no_route_found"),
        (
            FailingRouting(RateLimitError("Routing capacity is temporarily exhausted.")),
            503,
            "routing_limit_exceeded",
        ),
        (
            FailingRouting(UpstreamError("The routing provider is temporarily unavailable.")),
            502,
            "upstream_unavailable",
        ),
    ],
)
def test_upstream_failures_map_to_error_codes(api, monkeypatch, routing, status, code):
    use_plan_service(monkeypatch, routing=routing)
    response = post_plan(api)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_unexpected_errors_do_not_leak_details(api, monkeypatch):
    use_plan_service(monkeypatch, routing=FailingRouting(RuntimeError("secret internals")))
    response = post_plan(api)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "secret" not in response.content.decode()


def test_unknown_url_returns_json_404(api):
    response = api.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_wrong_method_is_a_uniform_error(api):
    response = api.get("/api/plan")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"


def test_geocode_returns_results_and_caches_by_normalized_query(api, monkeypatch):
    geocoder = FakeGeocoder()
    service = GeocodeService(geocoder, DictCache())
    monkeypatch.setattr(views, "geocode_service", lambda: service)
    first = api.get("/api/geocode", {"q": "Dallas"})
    api.get("/api/geocode", {"q": "  dallas "})
    assert first.status_code == 200
    assert first.json() == {
        "results": [{"label": "Dallas, TX, USA", "lat": 32.77666, "lon": -96.79699}]
    }
    assert geocoder.queries == ["dallas"]


@pytest.mark.parametrize(
    "params", [{"q": "da"}, {}, {"q": "dallas", "size": 0}, {"q": "dallas", "size": 11}]
)
def test_geocode_validation(api, params):
    response = api.get("/api/geocode", params)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_plan_is_throttled_per_ip(api, monkeypatch):
    use_plan_service(monkeypatch)
    rates = {**api_settings.DEFAULT_THROTTLE_RATES, "plan": "2/min"}
    with override_settings(
        REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": rates}
    ):
        statuses = [post_plan(api).status_code for _ in range(3)]
        response = post_plan(api)
    assert statuses == [200, 200, 429]
    assert response.json()["error"]["code"] == "throttled"
    assert "Retry-After" in response


def test_unexpected_weather_value_is_reported(api, monkeypatch):
    windy = FakeWeather(lambda _: Weather(wind_mph=40, rain_in_hr=0, snow_in_hr=0))
    use_plan_service(monkeypatch, weather=windy)
    checkpoint = post_plan(api).json()["routes"][0]["checkpoints"][0]
    assert checkpoint["risk"] == "SEVERE"
    assert checkpoint["drivers"] == ["wind", "load"]
    assert checkpoint["load_override_applied"] is True
