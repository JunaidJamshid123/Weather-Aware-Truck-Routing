"""Value types produced by the planning use case (checkpoints, stats, ranked routes)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from routing.domain.models import LatLon, RoutePath, TripRequest, Weather
from routing.domain.risk import Risk, RiskAssessment


@dataclass(frozen=True, slots=True)
class CheckpointPlacement:
    """Where and when the truck passes a checkpoint, before weather is attached."""

    index: int
    mile: float
    point: LatLon
    eta_utc: datetime


@dataclass(frozen=True, slots=True)
class Checkpoint:
    index: int
    mile: float
    point: LatLon
    eta_utc: datetime
    weather: Weather | None  # Forecast at the ETA; None when unavailable.
    assessment: RiskAssessment | None
    owned_mi: float  # Stretch of road this checkpoint's risk stands for.

    @property
    def risk(self) -> Risk | None:
        return self.assessment.level if self.assessment else None


@dataclass(frozen=True, slots=True)
class RouteStats:
    distance_mi: float
    duration_s: float
    arrival_utc: datetime
    moderate_mi: float
    high_mi: float
    severe_mi: float
    no_travel_mi: float
    unknown_mi: float
    avg_risk: float | None  # Mile-weighted mean (0-4) over checkpoints with weather.
    max_risk: Risk | None
    blocked: bool


@dataclass(frozen=True, slots=True)
class RoutePlan:
    id: str
    label: str
    path: RoutePath
    display_points: tuple[LatLon, ...]  # Simplified geometry, for drawing only.
    checkpoints: tuple[Checkpoint, ...]
    stats: RouteStats


@dataclass(frozen=True, slots=True)
class RankedRoute:
    plan: RoutePlan
    rank: int  # 1 is the recommended route.
    reason: str

    @property
    def is_recommended(self) -> bool:
        return self.rank == 1


@dataclass(frozen=True, slots=True)
class HeatmapPoint:
    point: LatLon
    risk: tuple[int, ...]  # Risk value per hour from `Heatmap.start_utc`; -1 is unknown.


@dataclass(frozen=True, slots=True)
class Heatmap:
    start_utc: datetime
    hours: int
    points: tuple[HeatmapPoint, ...]


@dataclass(frozen=True, slots=True)
class TripPlan:
    trip: TripRequest
    routes: tuple[RankedRoute, ...]  # Ranked: index 0 is the recommendation.
    all_blocked: bool
    warnings: tuple[str, ...]
    heatmap: Heatmap

    @property
    def recommended_route_id(self) -> str:
        return self.routes[0].plan.id
