"""Open-Meteo adapter: batched, cached hourly forecasts per weather grid cell.
Uses `rain` + `snowfall` because `precipitation` already includes snow and would double count."""

from __future__ import annotations

import logging
from collections.abc import Collection, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any, Final

import requests

from routing.clients.base import ProviderError, UpstreamError, json_body, send
from routing.clients.interfaces import CacheBackend
from routing.domain.models import GridCell, HourlySeries, Weather

logger = logging.getLogger(__name__)

OPEN_METEO_URL: Final = "https://api.open-meteo.com/v1/forecast"
# Sustained 10 m wind. Switch to "wind_gusts_10m" here to classify on gusts instead.
WIND_VARIABLE: Final = "wind_speed_10m"
RAIN_VARIABLE: Final = "rain"
SNOW_VARIABLE: Final = "snowfall"
# Series starts at 00:00 UTC today, so 8 days covers a 5-day lookahead + heatmap + drive.
FORECAST_DAYS: Final = 8
MAX_LOCATIONS_PER_REQUEST: Final = 50
MAX_PARALLEL_REQUESTS: Final = 4
CACHE_TTL_S: Final = 30 * 60
CACHE_KEY_PREFIX: Final = f"weather:v1:{WIND_VARIABLE}"


class OpenMeteoClient:
    """Implements WeatherProvider."""

    def __init__(
        self,
        session: requests.Session,
        cache: CacheBackend,
        *,
        url: str = OPEN_METEO_URL,
        chunk_size: int = MAX_LOCATIONS_PER_REQUEST,
        cache_ttl_s: int = CACHE_TTL_S,
    ) -> None:
        self._session = session
        self._cache = cache
        self._url = url
        self._chunk_size = chunk_size
        self._cache_ttl_s = cache_ttl_s

    def hourly_forecast(self, cells: Collection[GridCell]) -> dict[GridCell, HourlySeries]:
        unique_cells = sorted(set(cells))
        keys = {cell: _cache_key(cell) for cell in unique_cells}
        cached = self._cache.get_many(keys.values())
        result = {cell: cached[key] for cell, key in keys.items() if key in cached}
        missing = [cell for cell in unique_cells if cell not in result]
        logger.info("weather cache hits=%d misses=%d", len(result), len(missing))
        fetched = self._fetch(missing)
        if fetched:
            self._cache.set_many(
                {keys[cell]: series for cell, series in fetched.items()}, self._cache_ttl_s
            )
        result.update(fetched)
        return result

    def _fetch(self, cells: Sequence[GridCell]) -> dict[GridCell, HourlySeries]:
        chunks = [cells[i : i + self._chunk_size] for i in range(0, len(cells), self._chunk_size)]
        if not chunks:
            return {}
        with ThreadPoolExecutor(max_workers=min(len(chunks), MAX_PARALLEL_REQUESTS)) as pool:
            results = pool.map(self._fetch_chunk, chunks)
        merged: dict[GridCell, HourlySeries] = {}
        for chunk_result in results:
            merged.update(chunk_result)
        return merged

    def _fetch_chunk(self, cells: Sequence[GridCell]) -> dict[GridCell, HourlySeries]:
        try:
            response = send(self._session, "GET", self._url, params=_query(cells))
            if not response.ok:
                raise UpstreamError(f"Open-Meteo answered {response.status_code}")
            series = parse_forecasts(json_body(response), expected=len(cells))
        except ProviderError as exc:
            logger.warning("weather chunk of %d cells unavailable: %s", len(cells), exc)
            return {}
        return dict(zip(cells, series, strict=True))


def _query(cells: Sequence[GridCell]) -> dict[str, str | int]:
    centers = [cell.center for cell in cells]
    return {
        "latitude": ",".join(f"{c.lat:.4f}" for c in centers),
        "longitude": ",".join(f"{c.lon:.4f}" for c in centers),
        "hourly": f"{WIND_VARIABLE},{RAIN_VARIABLE},{SNOW_VARIABLE}",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "timeformat": "unixtime",
        "forecast_days": FORECAST_DAYS,
    }


def _cache_key(cell: GridCell) -> str:
    return f"{CACHE_KEY_PREFIX}:{cell.lat_index}:{cell.lon_index}"


def parse_forecasts(payload: Any, *, expected: int) -> list[HourlySeries]:
    """Parse a response for `expected` locations (a list, or one object for a single location)."""
    entries = payload if isinstance(payload, list) else [payload]
    if len(entries) != expected:
        raise UpstreamError(f"Expected {expected} forecasts, received {len(entries)}.")
    try:
        return [parse_series(entry["hourly"]) for entry in entries]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise UpstreamError("Open-Meteo returned a malformed forecast.") from exc


def parse_series(hourly: Mapping[str, Any]) -> HourlySeries:
    """Build one HourlySeries; an hour with any null variable becomes None (unknown)."""
    times = hourly["time"]
    columns = (hourly[WIND_VARIABLE], hourly[RAIN_VARIABLE], hourly[SNOW_VARIABLE])
    if not times or any(len(column) != len(times) for column in columns):
        raise ValueError("Hourly columns are empty or of unequal length.")
    values = tuple(
        Weather(wind_mph=float(wind), rain_in_hr=float(rain), snow_in_hr=float(snow))
        if None not in (wind, rain, snow)
        else None
        for wind, rain, snow in zip(*columns, strict=True)
    )
    return HourlySeries(start_utc=datetime.fromtimestamp(int(times[0]), tz=UTC), values=values)
