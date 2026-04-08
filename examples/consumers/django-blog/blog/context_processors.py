"""Inject webhouse globals into every template as ${webhouse_globals}."""
from . import webhouse


def webhouse_globals(request):
    g = webhouse.globals_doc()
    return {
        "webhouse_globals": {
            "brand_prefix": webhouse.get_string(g, "brandPrefix", "@webhouse/cms"),
            "brand_suffix": webhouse.get_string(g, "brandSuffix", ""),
            "footer_text": webhouse.get_string(g, "footerText", "Powered by @webhouse/cms"),
        }
    }
