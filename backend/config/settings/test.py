from config.settings.base import *  # noqa: F403

TESTING = True
DEBUG = False
SECRET_KEY = "test-secret-key"
ORS_API_KEY = "test-ors-key"
MAX_DEPARTURE_LOOKAHEAD_DAYS = 5
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
