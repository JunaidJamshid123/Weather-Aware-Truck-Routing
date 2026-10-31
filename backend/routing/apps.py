from django.apps import AppConfig
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


class RoutingConfig(AppConfig):
    name = "routing"
    verbose_name = "Weather-aware truck routing"

    def ready(self) -> None:
        if not settings.ORS_API_KEY and not settings.TESTING:
            raise ImproperlyConfigured("ORS_API_KEY is not set. Copy .env.example to .env.")
