"""Weather risk classification and load rules from the brief's table.
Lower bounds are inclusive (rain 0.25 -> HIGH); No Travel is `>=` for wind but `>` for rain/snow."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

from routing.domain.models import Weather


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


@dataclass(frozen=True, slots=True)
class Thresholds:
    """Inclusive lower bound of each level above LOW, in the condition's unit."""

    moderate: float
    high: float
    severe: float
    no_travel: float
    no_travel_inclusive: bool  # True: `>=` reaches No Travel; False: strictly `>`.

    def __post_init__(self) -> None:
        if not self.moderate < self.high < self.severe <= self.no_travel:
            raise ValueError("Thresholds must be ascending.")


WIND_MPH_THRESHOLDS = Thresholds(
    moderate=25, high=35, severe=45, no_travel=55, no_travel_inclusive=True
)
RAIN_IN_HR_THRESHOLDS = Thresholds(
    moderate=0.10, high=0.25, severe=0.50, no_travel=1.00, no_travel_inclusive=False
)
SNOW_IN_HR_THRESHOLDS = Thresholds(
    moderate=0.5, high=1.0, severe=2.0, no_travel=3.0, no_travel_inclusive=False
)


def classify(value: float, thresholds: Thresholds) -> Risk:
    reaches_no_travel = (
        value >= thresholds.no_travel
        if thresholds.no_travel_inclusive
        else value > thresholds.no_travel
    )
    if reaches_no_travel:
        return Risk.NO_TRAVEL
    for level, lower_bound in (
        (Risk.SEVERE, thresholds.severe),
        (Risk.HIGH, thresholds.high),
        (Risk.MODERATE, thresholds.moderate),
    ):
        if value >= lower_bound:
            return level
    return Risk.LOW


@dataclass(frozen=True, slots=True)
class LoadRule:
    """Wind band `[min_wind_mph, max_wind_mph)` where loads above `over_load_lb` escalate."""

    min_wind_mph: float
    max_wind_mph: float
    over_load_lb: int
    level: Risk

    def applies(self, wind_mph: float, load_lb: int) -> bool:
        in_band = self.min_wind_mph <= wind_mph < self.max_wind_mph
        return in_band and load_lb > self.over_load_lb


# Wind >= 55 mph is already No Travel for any load via WIND_MPH_THRESHOLDS.
LOAD_RULES: tuple[LoadRule, ...] = (
    LoadRule(min_wind_mph=45, max_wind_mph=55, over_load_lb=30_000, level=Risk.NO_TRAVEL),
    LoadRule(min_wind_mph=35, max_wind_mph=45, over_load_lb=40_000, level=Risk.SEVERE),
)

DRIVER_WIND = "wind"
DRIVER_RAIN = "rain"
DRIVER_SNOW = "snow"
DRIVER_LOAD = "load"


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    level: Risk
    drivers: tuple[str, ...]  # Conditions that set the level, e.g. ("wind", "load").
    load_override_applied: bool  # True only when a load rule raised the level.


def assess_checkpoint(weather: Weather, load_lb: int) -> RiskAssessment:
    """Worst of wind, rain and snow, then wind/load rules (which can only raise the level)."""
    levels = {
        DRIVER_WIND: classify(weather.wind_mph, WIND_MPH_THRESHOLDS),
        DRIVER_RAIN: classify(weather.rain_in_hr, RAIN_IN_HR_THRESHOLDS),
        DRIVER_SNOW: classify(weather.snow_in_hr, SNOW_IN_HR_THRESHOLDS),
    }
    base = max(levels.values())
    escalated = _apply_load_rules(base, weather.wind_mph, load_lb)
    if escalated > base:
        return RiskAssessment(escalated, (DRIVER_WIND, DRIVER_LOAD), load_override_applied=True)
    drivers = tuple(name for name, level in levels.items() if level == base > Risk.LOW)
    return RiskAssessment(base, drivers, load_override_applied=False)


def _apply_load_rules(base: Risk, wind_mph: float, load_lb: int) -> Risk:
    level = base
    for rule in LOAD_RULES:
        if rule.applies(wind_mph, load_lb):
            level = max(level, rule.level)
    return level
