from dataclasses import replace

import pytest

from routing.domain.models import Weather
from routing.services.alternatives import AlternativeRouteFinder
from routing.services.plan import (
    ALL_BLOCKED_WARNING,
    WEATHER_DOWN_WARNING,
    PlanService,
    plan_cache_key,
)
from routing.tests.factories import (
    DictCache,
    FakeRouting,
    FakeWeather,
    UnavailableWeather,
    make_trip,
)

HURRICANE = Weather(wind_mph=70, rain_in_hr=0, snow_in_hr=0)


def build_service(weather=None, cache=None, routing=None):
    return PlanService(
        route_finder=AlternativeRouteFinder(routing or FakeRouting()),
        weather=weather or FakeWeather(),
        cache=cache or DictCache(),
    )


def test_plan_returns_ranked_routes_with_checkpoints_and_heatmap():
    weather = FakeWeather()
    plan = build_service(weather).plan(make_trip())
    assert len(plan.routes) == 3
    assert {r.plan.id for r in plan.routes} == {"route-1", "route-2", "route-3"}
    assert plan.recommended_route_id == plan.routes[0].plan.id
    assert plan.routes[0].is_recommended
    assert not plan.all_blocked
    assert plan.warnings == ()
    assert all(r.plan.checkpoints for r in plan.routes)
    assert all(len(r.plan.display_points) < len(r.plan.path.points) for r in plan.routes)
    assert plan.heatmap.points
    assert len(weather.calls) == 1  # One weather pass for checkpoints and heatmap together.


def test_plan_is_cached_by_normalized_request():
    weather, cache = FakeWeather(), DictCache()
    service = build_service(weather, cache)
    trip = make_trip()
    first = service.plan(trip)
    second = service.plan(replace(trip, origin=replace(trip.origin, label="Another label")))
    assert second is first
    assert len(weather.calls) == 1


def test_cache_key_changes_with_inputs_that_affect_the_plan():
    trip = make_trip()
    assert plan_cache_key(trip) != plan_cache_key(replace(trip, load_lb=trip.load_lb + 1))
    assert plan_cache_key(trip) != plan_cache_key(replace(trip, interval_mi=10))


def test_all_blocked_plan_still_recommends_and_warns():
    plan = build_service(FakeWeather(lambda _: HURRICANE)).plan(make_trip())
    assert plan.all_blocked
    assert ALL_BLOCKED_WARNING in plan.warnings
    assert plan.routes[0].is_recommended


def test_weather_outage_degrades_to_unknown_miles():
    plan = build_service(UnavailableWeather()).plan(make_trip())
    assert plan.warnings == (WEATHER_DOWN_WARNING,)
    stats = plan.routes[0].plan.stats
    assert stats.unknown_mi == pytest.approx(stats.distance_mi)
    assert stats.avg_risk is None
    assert all(c.weather is None for c in plan.routes[0].plan.checkpoints)


def test_partial_weather_warns_per_route():
    cutoff_lat_index = 360  # No forecast north of ~36 deg.
    weather = FakeWeather(
        lambda cell: None if cell.lat_index > cutoff_lat_index else Weather(5, 0, 0)
    )
    plan = build_service(weather).plan(make_trip())
    assert any(w.startswith("No forecast for") for w in plan.warnings)
