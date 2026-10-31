"""Composition root: the only module in `services` that reads Django settings."""

from __future__ import annotations

from functools import cache

from django.conf import settings
from django.core.cache import cache as django_cache

from routing.clients.base import build_session
from routing.clients.open_meteo import OpenMeteoClient
from routing.clients.ors import OrsClient
from routing.services.alternatives import AlternativeRouteFinder
from routing.services.geocode import GeocodeService
from routing.services.plan import PlanService


def build_ors_client() -> OrsClient:
    return OrsClient(
        api_key=settings.ORS_API_KEY,
        session=build_session(),
        geocode_country=settings.GEOCODE_COUNTRY,
        apply_weight_restriction=settings.ORS_APPLY_WEIGHT_RESTRICTION,
    )


def build_plan_service() -> PlanService:
    weather = OpenMeteoClient(session=build_session(), cache=django_cache)
    return PlanService(
        route_finder=AlternativeRouteFinder(build_ors_client()),
        weather=weather,
        cache=django_cache,
    )


def build_geocode_service() -> GeocodeService:
    return GeocodeService(geocoder=build_ors_client(), cache=django_cache)


@cache
def plan_service() -> PlanService:
    """Process-wide so HTTP sessions and connection pools are reused."""
    return build_plan_service()


@cache
def geocode_service() -> GeocodeService:
    return build_geocode_service()
