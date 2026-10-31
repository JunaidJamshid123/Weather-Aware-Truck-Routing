import pytest

from routing.domain.models import Weather
from routing.domain.risk import (
    RAIN_IN_HR_THRESHOLDS,
    SNOW_IN_HR_THRESHOLDS,
    WIND_MPH_THRESHOLDS,
    Risk,
    Thresholds,
    assess_checkpoint,
    classify,
)

L, M, H, S, N = Risk.LOW, Risk.MODERATE, Risk.HIGH, Risk.SEVERE, Risk.NO_TRAVEL


@pytest.mark.parametrize(
    ("wind_mph", "expected"),
    [
        (0, L),
        (24.99, L),
        (25, M),
        (25.01, M),
        (34.99, M),
        (35, H),
        (35.01, H),
        (44.99, H),
        (45, S),
        (45.01, S),
        (54.99, S),
        (55, N),
        (55.01, N),
        (90, N),
    ],
)
def test_wind_boundaries(wind_mph, expected):
    assert classify(wind_mph, WIND_MPH_THRESHOLDS) is expected


@pytest.mark.parametrize(
    ("rain_in_hr", "expected"),
    [
        (0, L),
        (0.0999, L),
        (0.10, M),
        (0.1001, M),
        (0.2499, M),
        (0.25, H),
        (0.2501, H),
        (0.4999, H),
        (0.50, S),
        (0.5001, S),
        (1.00, S),
        (1.0001, N),
        (2.5, N),
    ],
)
def test_rain_boundaries(rain_in_hr, expected):
    assert classify(rain_in_hr, RAIN_IN_HR_THRESHOLDS) is expected


@pytest.mark.parametrize(
    ("snow_in_hr", "expected"),
    [
        (0, L),
        (0.499, L),
        (0.5, M),
        (0.501, M),
        (0.999, M),
        (1.0, H),
        (1.001, H),
        (1.999, H),
        (2.0, S),
        (2.001, S),
        (3.0, S),
        (3.001, N),
    ],
)
def test_snow_boundaries(snow_in_hr, expected):
    assert classify(snow_in_hr, SNOW_IN_HR_THRESHOLDS) is expected


def test_thresholds_must_ascend():
    with pytest.raises(ValueError, match="ascending"):
        Thresholds(moderate=2, high=1, severe=3, no_travel=4, no_travel_inclusive=True)


def weather(wind=0.0, rain=0.0, snow=0.0):
    return Weather(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow)


def test_calm_weather_is_low_without_drivers():
    result = assess_checkpoint(weather(wind=10), load_lb=80_000)
    assert result.level is L
    assert result.drivers == ()
    assert not result.load_override_applied


def test_worst_of_three_conditions_wins():
    result = assess_checkpoint(weather(wind=30, rain=0.3, snow=2.5), load_lb=1_000)
    assert result.level is S
    assert result.drivers == ("snow",)


def test_drivers_list_every_condition_at_the_final_level():
    result = assess_checkpoint(weather(wind=36, rain=0.3, snow=0.2), load_lb=1_000)
    assert result.level is H
    assert result.drivers == ("wind", "rain")


@pytest.mark.parametrize("load_lb", [1, 30_000, 80_000])
def test_wind_55_is_no_travel_for_any_load(load_lb):
    result = assess_checkpoint(weather(wind=55), load_lb)
    assert result.level is N
    assert not result.load_override_applied
    assert result.drivers == ("wind",)


@pytest.mark.parametrize(
    ("wind_mph", "load_lb", "expected", "overridden"),
    [
        (45, 30_000, S, False),  # Exactly 30,000 lb is not over the limit.
        (45, 30_001, N, True),
        (54.99, 30_001, N, True),
        (44.99, 30_001, H, False),  # Below the 45 mph band; 40,000 lb rule not met.
        (35, 40_000, H, False),  # Exactly 40,000 lb is not over the limit.
        (35, 40_001, S, True),
        (44.99, 40_001, S, True),
        (34.99, 80_000, M, False),
    ],
)
def test_load_rules(wind_mph, load_lb, expected, overridden):
    result = assess_checkpoint(weather(wind=wind_mph), load_lb)
    assert result.level is expected
    assert result.load_override_applied is overridden
    if overridden:
        assert result.drivers == ("wind", "load")


def test_load_override_never_lowers_a_worse_level():
    result = assess_checkpoint(weather(wind=40, rain=1.5), load_lb=45_000)
    assert result.level is N
    assert not result.load_override_applied
    assert result.drivers == ("rain",)


def test_load_override_not_flagged_when_base_already_matches():
    result = assess_checkpoint(weather(wind=40, snow=2.5), load_lb=45_000)
    assert result.level is S
    assert not result.load_override_applied
    assert result.drivers == ("snow",)
