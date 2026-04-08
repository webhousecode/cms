"""Template filters that read webhouse documents safely."""
from django import template

from .. import webhouse

register = template.Library()


@register.filter
def wh_string(doc, key):
    """{{ post|wh_string:"title" }}"""
    return webhouse.get_string(doc, key, "")


@register.filter
def wh_locale(doc):
    """{{ post|wh_locale }}"""
    return doc.get("locale", "") if doc else ""
