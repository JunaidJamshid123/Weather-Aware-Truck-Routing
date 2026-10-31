"""openrouteservice adapter for truck directions and autocomplete.
No ORS payload leaves this module, and the API key only travels in the Authorization header."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from http import HTTPStatus
from typing import Any, Final

import requests

from routing.clients.base import (
    NoRouteError,
    RateLimitError,
    UpstreamError,
    json_body,
    send,
)
from routing.domain.constants import LB_TO_METRIC_TONS
from routing.domain.models import LatLon, Location, RoutePath, TimeProfile
from routing.geo.geometry import cumulative_distances_mi

logger = logging.getLogger(__name__)

ORS_BASE_URL: Final = "https://api.openrouteservice.org"
DIRECTIONS_PATH: Final = "/v2/directions/driving-hgv/geojson"
AUTOCOMPLETE_PATH: Final = "/geocode/autocomplete"
# The /geojson directions endpoint answers 406 (code 2007) unless geo+json is acceptable.
ACCEPT_HEADER: Final = "application/geo+json, application/json"
UNLIMITED_SNAP_RADIUS: Final = -1
MIN_ROUTE_POINTS: Final = 2
ERROR_ROUTE_TOO_LONG: Final = 2004
ERROR_ROUTE_NOT_FOUND: Final = 2009
ERROR_POINT_NOT_ROUTABLE: Final = 2010
NO_ROUTE_ERROR_CODES: Final = frozenset({ERROR_ROUTE_NOT_FOUND, ERROR_POINT_NOT_ROUTABLE})
# ORS answers 403 when the daily quota is spent.
RATE_LIMIT_STATUSES: Final = frozenset({HTTPStatus.FORBIDDEN, HTTPStatus.TOO_MANY_REQUESTS})


class OrsClient:
    """Implements RoutingProvider and GeocodingProvider."""

    def __init__(
        self,
        api_key: str,
        session: requests.Session,
        *,
        base_url: str = ORS_BASE_URL,
        geocode_country: str = "US",
        apply_weight_restriction: bool = False,
    ) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": api_key, "Accept": ACCEPT_HEADER}
        self._geocode_country = geocode_country
        self._apply_weight_restriction = apply_weight_restriction

    def route(self, waypoints: Sequence[LatLon], *, load_lb: int) -> RoutePath:
        """Fastest HGV route through `waypoints` (miles, seconds)."""
        response = send(
            self._session,
            "POST",
            self._base_url + DIRECTIONS_PATH,
            json=self._directions_body(waypoints, load_lb),
            headers=self._headers,
        )
        _raise_for_routing_error(response)
        return parse_route(json_body(response))

    def autocomplete(self, text: str, *, size: int) -> list[Location]:
        """Place suggestions for partial `text`, restricted to the configured country."""
        params = {"text": text, "size": size, "boundary.country": self._geocode_country}
        response = send(
            self._session,
            "GET",
            self._base_url + AUTOCOMPLETE_PATH,
            params=params,
            headers=self._headers,
        )
        _raise_for_routing_error(response)
        return parse_autocomplete(json_body(response))

    def _directions_body(self, waypoints: Sequence[LatLon], load_lb: int) -> dict[str, Any]:
        body: dict[str, Any] = {
            "coordinates": [[point.lon, point.lat] for point in waypoints],
            "units": "mi",
            "instructions": True,  # Steps are needed for ETA interpolation.
            "radiuses": [UNLIMITED_SNAP_RADIUS] * len(waypoints),
        }
        if self._apply_weight_restriction:
            weight_tons = round(load_lb * LB_TO_METRIC_TONS, 2)
            body["options"] = {"profile_params": {"restrictions": {"weight": weight_tons}}}
        return body


def parse_route(payload: Any) -> RoutePath:
    try:
        feature = payload["features"][0]
        coordinates = feature["geometry"]["coordinates"]
        properties = feature["properties"]
        points = tuple(LatLon(lat=float(c[1]), lon=float(c[0])) for c in coordinates)
        duration_s = float(properties.get("summary", {}).get("duration", 0.0))
        segments = properties.get("segments", [])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise UpstreamError("The routing provider returned a malformed route.") from exc
    if len(points) < MIN_ROUTE_POINTS:
        raise NoRouteError("No drivable route was found between these locations.")
    cumulative_mi = cumulative_distances_mi(points)
    return RoutePath(
        points=points,
        cumulative_mi=cumulative_mi,
        distance_mi=cumulative_mi[-1],
        duration_s=duration_s,
        time_profile=_time_profile(segments, cumulative_mi),
    )


def _time_profile(segments: Any, cumulative_mi: tuple[float, ...]) -> TimeProfile | None:
    """Anchors steps to vertex miles so ETAs agree with haversine checkpoint placement."""
    miles, seconds = [0.0], [0.0]
    try:
        for segment in segments:
            for step in segment.get("steps", []):
                end_index = min(int(step["way_points"][1]), len(cumulative_mi) - 1)
                miles.append(max(miles[-1], cumulative_mi[end_index]))
                seconds.append(seconds[-1] + max(0.0, float(step["duration"])))
    except (KeyError, IndexError, TypeError, ValueError):
        logger.warning("ORS steps malformed; falling back to proportional ETAs")
        return None
    if len(miles) < MIN_ROUTE_POINTS or miles[-1] <= 0:
        return None
    return TimeProfile(cumulative_mi=tuple(miles), cumulative_s=tuple(seconds))


def parse_autocomplete(payload: Any) -> list[Location]:
    try:
        return [
            Location(
                label=str(feature["properties"]["label"]),
                point=LatLon(
                    lat=float(feature["geometry"]["coordinates"][1]),
                    lon=float(feature["geometry"]["coordinates"][0]),
                ),
            )
            for feature in payload.get("features", [])
        ]
    except (KeyError, IndexError, TypeError, ValueError, AttributeError) as exc:
        raise UpstreamError("The geocoding provider returned a malformed response.") from exc


def _raise_for_routing_error(response: requests.Response) -> None:
    if response.ok:
        return
    error_code = _ors_error_code(response)
    logger.warning(
        "ORS error status=%s code=%s body=%.300s", response.status_code, error_code, response.text
    )
    if response.status_code in RATE_LIMIT_STATUSES:
        raise RateLimitError("Routing capacity is temporarily exhausted. Please try again shortly.")
    if error_code == ERROR_ROUTE_TOO_LONG:
        raise NoRouteError("This trip is longer than the routing provider supports.")
    if error_code in NO_ROUTE_ERROR_CODES or response.status_code == HTTPStatus.NOT_FOUND:
        raise NoRouteError("No drivable truck route was found between these locations.")
    raise UpstreamError("The routing provider is temporarily unavailable.")


def _ors_error_code(response: requests.Response) -> int | None:
    try:
        error = response.json().get("error")
        return int(error["code"]) if isinstance(error, dict) else None
    except (ValueError, KeyError, TypeError, AttributeError):
        return None
