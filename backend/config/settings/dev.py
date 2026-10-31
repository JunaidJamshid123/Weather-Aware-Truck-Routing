from config.settings.base import *  # noqa: F403
from config.settings.base import env

DEV_SECRET_KEY = "dev-insecure-secret-key-do-not-use-in-production"

DEBUG = env.bool("DJANGO_DEBUG", default=True)
# A blank DJANGO_SECRET_KEY= line (as in .env.example) must still fall back.
SECRET_KEY = env("DJANGO_SECRET_KEY", default="") or DEV_SECRET_KEY
