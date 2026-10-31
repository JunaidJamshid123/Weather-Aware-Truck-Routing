import pytest
from django.core.cache import cache
from urllib3.util.retry import Retry


@pytest.fixture(autouse=True)
def _clear_cache():
    """Isolate tests from each other's cached plans, geocodes and throttle counters."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _no_retry_backoff(monkeypatch):
    """Keep retry semantics but skip the real sleeps between attempts."""
    monkeypatch.setattr(Retry, "sleep", lambda *_args, **_kwargs: None)
