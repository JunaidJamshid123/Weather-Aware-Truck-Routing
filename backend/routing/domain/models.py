"""Immutable domain value types. Units live in field names (`_mi`, `_s`, `_mph`, `_in_hr`,
`_lb`) and datetimes are timezone-aware UTC."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

from routing.domain.constants import SECONDS_PER_HOUR, WEATHER_GRID_DEG


@dataclass(frozen=True, slots=True)
class LatLon:
    lat: float
    lon: float


@dataclass(frozen=True, slots=True)
class Location:
    label: str
    point: LatLon


@dataclass(frozen=True, slots=True)
class TimeProfile:
    """Piecewise-linear drive time: mile `cumulative_mi[i]` is reached at `cumulative_s[i]`."""

    cumulative_mi: tuple[float, ...]
    cumulative_s: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class RoutePath:
    """Full-resolution geometry; `cumulative_mi[i]` is haversine miles from start to `points[i]`."""

    points: tuple[LatLon, ...]
    cumulative_mi: tuple[float, ...]
    distance_mi: float
    duration_s: float
    time_profile: TimeProfile | None = None


@dataclass(frozen=True, slots=True)
class Weather:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True, slots=True)
class HourlySeries:
    """Hourly forecast for one grid cell; `values[i]` is the hour `start_utc + i h`."""

    start_utc: datetime
    values: tuple[Weather | None, ...]

    def at(self, when_utc: datetime) -> Weather | None:
        """Forecast for the nearest hour, or None if out of range."""
        offset_h = (when_utc - self.start_utc).total_seconds() / SECONDS_PER_HOUR
        index = math.floor(offset_h + 0.5)  # Round half up; avoids banker's rounding.
        if 0 <= index < len(self.values):
            return self.values[index]
        return None


@dataclass(frozen=True, slots=True, order=True)
class GridCell:
    """A WEATHER_GRID_DEG square used to dedupe and cache weather lookups."""

    lat_index: int
    lon_index: int

    @classmethod
    def containing(cls, point: LatLon) -> GridCell:
        return cls(
            lat_index=math.floor(point.lat / WEATHER_GRID_DEG + 0.5),
            lon_index=math.floor(point.lon / WEATHER_GRID_DEG + 0.5),
        )

    @property
    def center(self) -> LatLon:
        return LatLon(
            lat=round(self.lat_index * WEATHER_GRID_DEG, 4),
            lon=round(self.lon_index * WEATHER_GRID_DEG, 4),
        )


@dataclass(frozen=True, slots=True)
class TripRequest:
    origin: Location
    destination: Location
    departure_utc: datetime
    load_lb: int
    interval_mi: int
