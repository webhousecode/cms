"""F125 reference reader for @webhouse/cms file-based content (Python).

Reads JSON documents from content/{collection}/ and exposes them as plain
dicts (with helper functions). Designed to be thin (stdlib only), and safe —
slugs and collection names are validated against SAFE_NAME to prevent path
traversal.

Reference implementation for the future webhouse-cms-reader PyPI package.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

from django.conf import settings

SAFE_NAME = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")


class InvalidName(ValueError):
    """Raised when a collection name or slug fails validation."""


def _content_dir() -> Path:
    return Path(settings.WEBHOUSE_CONTENT_DIR).resolve()


def _validate(name: str) -> None:
    if not name or not SAFE_NAME.match(name):
        raise InvalidName(f"Invalid name '{name}' — must match {SAFE_NAME.pattern}")


def collection(name: str, locale: Optional[str] = None) -> list[dict]:
    """List all published documents in a collection.

    Args:
        name: collection name (e.g. "posts")
        locale: optional locale filter; pass None for all locales

    Returns:
        documents sorted by data.date descending (newest first)
    """
    _validate(name)
    folder = _content_dir() / name
    if not folder.is_dir():
        return []

    docs: list[dict] = []
    for f in folder.glob("*.json"):
        try:
            doc = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if doc.get("status") != "published":
            continue
        if locale and doc.get("locale") != locale:
            continue
        docs.append(doc)

    docs.sort(key=lambda d: d.get("data", {}).get("date", "") or "", reverse=True)
    return docs


def document(collection_name: str, slug: str) -> Optional[dict]:
    """Load a single published document by collection and slug.

    Returns None if not found, malformed, or unpublished.
    Raises InvalidName for path traversal attempts.
    """
    _validate(collection_name)
    _validate(slug)
    path = _content_dir() / collection_name / f"{slug}.json"
    abs_path = path.resolve()
    if not str(abs_path).startswith(str(_content_dir())):
        raise InvalidName(f"path escapes content dir: {abs_path}")
    if not abs_path.is_file():
        return None
    try:
        doc = json.loads(abs_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return doc if doc.get("status") == "published" else None


def find_translation(doc: dict, collection_name: str) -> Optional[dict]:
    """Find the sibling translation of a document via translationGroup."""
    tg = doc.get("translationGroup")
    if not tg:
        return None
    for other in collection(collection_name):
        if other.get("translationGroup") == tg and other.get("locale") != doc.get("locale"):
            return other
    return None


# ── Helpers ─────────────────────────────────────────────────────


def get_string(doc: dict, key: str, default: str = "") -> str:
    """Safely extract a string field from doc.data."""
    if not doc:
        return default
    value = doc.get("data", {}).get(key)
    return value if isinstance(value, str) else default


def get_string_array(doc: dict, key: str) -> list[str]:
    """Extract a string array field (e.g. tags)."""
    if not doc:
        return []
    value = doc.get("data", {}).get(key)
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    return []


# ── Globals (cached singleton) ──────────────────────────────────


@lru_cache(maxsize=1)
def globals_doc() -> dict:
    """Return the globals/site.json document, cached for the process lifetime.

    In production with content webhooks, you'd invalidate this cache instead
    of using lru_cache. For dev, restart the server to pick up changes.
    """
    return document("globals", "site") or {}
