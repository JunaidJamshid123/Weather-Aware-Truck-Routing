"""Settings shared by every environment. Values come from the environment (.env in dev)."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parents[2]

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
TESTING = False

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "routing.apps.RoutingConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
APPEND_SLASH = False

# No models: SQLite only satisfies Django's requirement for a database setting.
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}

_REDIS_URL = env("REDIS_URL", default="")
CACHES = {
    "default": (
        {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": _REDIS_URL}
        if _REDIS_URL
        else {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "routing",
            "OPTIONS": {"MAX_ENTRIES": 5000},
        }
    )
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": ["routing.api.throttles.ScopedIpRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"plan": "20/min", "geocode": "60/min"},
    "NUM_PROXIES": env.int("NUM_PROXIES", default=None),
    "EXCEPTION_HANDLER": "routing.api.exceptions.api_exception_handler",
}

# --- Routing app -------------------------------------------------------------
ORS_API_KEY = env("ORS_API_KEY", default="")
GEOCODE_COUNTRY = env("GEOCODE_COUNTRY", default="US")
ORS_APPLY_WEIGHT_RESTRICTION = env.bool("ORS_APPLY_WEIGHT_RESTRICTION", default=False)
MAX_DEPARTURE_LOOKAHEAD_DAYS = env.int("MAX_DEPARTURE_LOOKAHEAD_DAYS", default=5)

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "%(asctime)s level=%(levelname)s logger=%(name)s %(message)s",
        }
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "structured"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "routing": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "django": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
