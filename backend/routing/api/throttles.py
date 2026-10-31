"""Per-IP throttling that protects the free ORS and Open-Meteo quotas."""

from __future__ import annotations

from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle


class ScopedIpRateThrottle(ScopedRateThrottle):
    """Reads the rate per request; DRF's version freezes it at import, ignoring overrides."""

    def get_rate(self) -> str | None:
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)
