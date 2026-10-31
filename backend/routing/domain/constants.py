"""Unit conversions, input limits and algorithm tunables (the risk table lives in `risk.py`)."""

from typing import Final

# --- Units -------------------------------------------------------------------
EARTH_RADIUS_MI: Final = 3958.7613
KM_PER_MI: Final = 1.609344
MI_PER_DEG_LAT: Final = 69.055
SECONDS_PER_HOUR: Final = 3600
LB_TO_METRIC_TONS: Final = 0.00045359237
DISTANCE_EPSILON_MI: Final = 1e-6

# --- Trip request limits -----------------------------------------------------
CHECKPOINT_INTERVALS_MI: Final = (10, 25, 50)
DEFAULT_CHECKPOINT_INTERVAL_MI: Final = 25
MIN_LOAD_LB: Final = 1
MAX_LOAD_LB: Final = 80_000  # US federal gross vehicle weight limit.
MIN_TRIP_DISTANCE_MI: Final = 1.0

# --- Weather -----------------------------------------------------------------
WEATHER_GRID_DEG: Final = 0.1  # ~11 km, finer than the forecast model resolution.
HEATMAP_HOURS: Final = 49  # Hours 0..48 from departure.
HEATMAP_UNKNOWN_RISK: Final = -1
HEATMAP_MIN_SPACING_MI: Final = 10.0
HEATMAP_MAX_POINTS_PER_ROUTE: Final = 150

# --- Route alternatives (see services/alternatives.py) -----------------------
MAX_ROUTES: Final = 3
ROUTE_LABELS: Final = ("Fastest", "Alternative A", "Alternative B")
VIA_OFFSET_FRACTION_OF_TRIP: Final = 0.12
VIA_OFFSET_MIN_KM: Final = 25.0
VIA_OFFSET_MAX_KM: Final = 120.0
VIA_RETRY_OFFSET_MULTIPLIER: Final = 1.5
VIA_RETRY_OFFSET_MAX_KM: Final = 180.0
VIA_PRIMARY_FRACTIONS: Final = (0.5,)
VIA_RETRY_FRACTIONS: Final = (0.35, 0.65)
BEARING_WINDOW_MI: Final = 5.0
MAX_ALTERNATIVE_DURATION_RATIO: Final = 1.6
MAX_ROUTE_OVERLAP: Final = 0.8
MAX_SELF_OVERLAP: Final = 0.1
OVERLAP_SAMPLE_SPACING_MI: Final = 2.0 / KM_PER_MI
OVERLAP_THRESHOLD_MI: Final = 2.0 / KM_PER_MI
SELF_OVERLAP_MIN_GAP_MI: Final = 10.0 / KM_PER_MI

# --- Response shaping --------------------------------------------------------
SIMPLIFY_TOLERANCE_DEG: Final = 0.0005
