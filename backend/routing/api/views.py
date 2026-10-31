"""Thin HTTP views: validate input, call one service, shape the response."""

from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from routing.api.serializers import (
    GeocodeQuerySerializer,
    PlanRequestSerializer,
    present_locations,
    present_plan,
)
from routing.services.container import geocode_service, plan_service


class HealthView(APIView):
    throttle_classes = ()

    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class GeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request: Request) -> Response:
        query = GeocodeQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        locations = geocode_service().search(
            query.validated_data["q"], size=query.validated_data["size"]
        )
        return Response(present_locations(locations))


class PlanView(APIView):
    throttle_scope = "plan"

    def post(self, request: Request) -> Response:
        trip_request = PlanRequestSerializer(data=request.data)
        trip_request.is_valid(raise_exception=True)
        plan = plan_service().plan(trip_request.to_trip())
        return Response(present_plan(plan))
