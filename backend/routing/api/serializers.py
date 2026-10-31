"""Request validation and response shaping. No business logic: values are only
checked against input limits or formatted (rounding, ISO strings, GeoJSON order)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from routing.domain.constants import (
    CHECKPOINT_INTERVALS_MI,
    MAX_LOAD_LB,
    MIN_LOAD_LB,
    MIN_TRIP_DISTANCE_MI,
)
from routing.domain.models import LatLon, Location, TripRequest
from routing.domain.results import Checkpoint, Heatmap, RankedRoute, TripPlan
from routing.geo.geometry import haversine_mi

COORDINATE_DECIMALS = 5
MILES_DECIMALS = 1
WEATHER_DECIMALS = 2
AVG_RISK_DECIMALS = 3
MAX_GEOCODE_RESULTS = 10


class LocationSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=200)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class PlanRequestSerializer(serializers.Serializer):
    origin = LocationSerializer()
    destination = LocationSerializer()
    departure_time = serializers.DateTimeField(default_timezone=UTC)
    load_weight_lb = serializers.IntegerField(min_value=MIN_LOAD_LB, max_value=MAX_LOAD_LB)
    checkpoint_interval_mi = serializers.ChoiceField(choices=CHECKPOINT_INTERVALS_MI)

    def validate_departure_time(self, value: datetime) -> datetime:
        departure = value.astimezone(UTC)
        now = timezone.now()
        current_hour = now.replace(minute=0, second=0, microsecond=0)
        lookahead_days = settings.MAX_DEPARTURE_LOOKAHEAD_DAYS
        if departure < current_hour:
            raise serializers.ValidationError("Departure time cannot be in the past.")
        if departure > now + timedelta(days=lookahead_days):
            raise serializers.ValidationError(
                f"Departure must be within the next {lookahead_days} days (forecast range)."
            )
        return departure

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        origin, destination = attrs["origin"], attrs["destination"]
        distance_mi = haversine_mi(
            LatLon(origin["lat"], origin["lon"]), LatLon(destination["lat"], destination["lon"])
        )
        if distance_mi < MIN_TRIP_DISTANCE_MI:
            raise serializers.ValidationError(
                {"destination": ["Origin and destination must be at least 1 mile apart."]}
            )
        return attrs

    def to_trip(self) -> TripRequest:
        data = self.validated_data
        return TripRequest(
            origin=_location(data["origin"]),
            destination=_location(data["destination"]),
            departure_utc=data["departure_time"],
            load_lb=data["load_weight_lb"],
            interval_mi=int(data["checkpoint_interval_mi"]),
        )


class GeocodeQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=3, max_length=200)
    size = serializers.IntegerField(min_value=1, max_value=MAX_GEOCODE_RESULTS, default=5)


def _location(data: dict[str, Any]) -> Location:
    return Location(label=data["label"], point=LatLon(lat=data["lat"], lon=data["lon"]))


# --- Response shaping --------------------------------------------------------


def iso_utc(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def present_locations(locations: Sequence[Location]) -> dict[str, Any]:
    return {
        "results": [
            {
                "label": location.label,
                "lat": round(location.point.lat, COORDINATE_DECIMALS),
                "lon": round(location.point.lon, COORDINATE_DECIMALS),
            }
            for location in locations
        ]
    }


def present_plan(plan: TripPlan) -> dict[str, Any]:
    return {
        "departure_time": iso_utc(plan.trip.departure_utc),
        "checkpoint_interval_mi": plan.trip.interval_mi,
        "load_weight_lb": plan.trip.load_lb,
        "recommended_route_id": plan.recommended_route_id,
        "all_blocked": plan.all_blocked,
        "warnings": list(plan.warnings),
        "routes": [_present_route(route) for route in plan.routes],
        "heatmap": _present_heatmap(plan.heatmap),
    }


def _present_route(route: RankedRoute) -> dict[str, Any]:
    plan, stats = route.plan, route.plan.stats
    return {
        "id": plan.id,
        "label": plan.label,
        "geometry": [
            [round(p.lon, COORDINATE_DECIMALS), round(p.lat, COORDINATE_DECIMALS)]
            for p in plan.display_points
        ],
        "summary": {
            "distance_mi": round(stats.distance_mi, MILES_DECIMALS),
            "duration_s": round(stats.duration_s),
            "arrival_time": iso_utc(stats.arrival_utc),
            "severe_miles": round(stats.severe_mi, MILES_DECIMALS),
            "high_miles": round(stats.high_mi, MILES_DECIMALS),
            "moderate_miles": round(stats.moderate_mi, MILES_DECIMALS),
            "no_travel_miles": round(stats.no_travel_mi, MILES_DECIMALS),
            "unknown_miles": round(stats.unknown_mi, MILES_DECIMALS),
            "avg_risk": None
            if stats.avg_risk is None
            else round(stats.avg_risk, AVG_RISK_DECIMALS),
            "max_risk": stats.max_risk.name if stats.max_risk is not None else None,
            "blocked": stats.blocked,
            "rank": route.rank,
            "is_recommended": route.is_recommended,
            "reason": route.reason,
        },
        "checkpoints": [_present_checkpoint(c) for c in plan.checkpoints],
    }


def _present_checkpoint(checkpoint: Checkpoint) -> dict[str, Any]:
    weather, assessment = checkpoint.weather, checkpoint.assessment
    return {
        "index": checkpoint.index,
        "mile": round(checkpoint.mile, MILES_DECIMALS),
        "lat": round(checkpoint.point.lat, COORDINATE_DECIMALS),
        "lon": round(checkpoint.point.lon, COORDINATE_DECIMALS),
        "eta": iso_utc(checkpoint.eta_utc),
        "weather": None
        if weather is None
        else {
            "wind_mph": round(weather.wind_mph, WEATHER_DECIMALS),
            "rain_in_hr": round(weather.rain_in_hr, WEATHER_DECIMALS),
            "snow_in_hr": round(weather.snow_in_hr, WEATHER_DECIMALS),
        },
        "risk": assessment.level.name if assessment else None,
        "risk_level": int(assessment.level) if assessment else None,
        "drivers": list(assessment.drivers) if assessment else [],
        "load_override_applied": assessment.load_override_applied if assessment else False,
        "owned_miles": round(checkpoint.owned_mi, MILES_DECIMALS),
    }


def _present_heatmap(heatmap: Heatmap) -> dict[str, Any]:
    return {
        "start_time": iso_utc(heatmap.start_utc),
        "hours": heatmap.hours,
        "points": [
            {
                "lat": round(p.point.lat, COORDINATE_DECIMALS),
                "lon": round(p.point.lon, COORDINATE_DECIMALS),
                "risk": list(p.risk),
            }
            for p in heatmap.points
        ],
    }
