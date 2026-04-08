"""Minimal Django settings for the @webhouse/cms consumer example."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-example-only-do-not-use-in-production"
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "blog",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "mysite.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "blog.context_processors.webhouse_globals",
            ],
        },
    },
]

WSGI_APPLICATION = "mysite.wsgi.application"

DATABASES = {}  # We don't use a database — content is in JSON files

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static + media
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "public"]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# @webhouse/cms content directory
WEBHOUSE_CONTENT_DIR = BASE_DIR / "content"
