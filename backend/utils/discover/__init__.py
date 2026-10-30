"""Discover: search free, high-resolution art and import it ready for the Frame."""

import os
from urllib.parse import urlsplit

from .artic import artic
from .cleveland import cleveland
from . import credentials
from .common import DiscoverError, DiskCache
from .flickr import flickr
from .getty import getty
from .limits import Limiter
from .met import met
from .nasa import nasa
from .pixabay import pixabay
from .reframed import reframed
from .smithsonian import cooper_hewitt, saam
from .smk import smk
from .wikimedia import holidays, illustrations, louvre, moma, modern, nga, popart, posters, ukiyoe, world_museums, yale

# Reframed first: its files are already 3840x2160.
SOURCES = {
    source.id: source
    for source in (
        reframed, artic, met, cleveland, smk, getty, nga, yale, moma, louvre, world_museums,
        # Modern, pop and illustrated work.
        modern, popart, saam, cooper_hewitt, illustrations, pixabay, flickr, ukiyoe,
        holidays, posters, nasa,
    )
}

# Recommended defaults: high-resolution, public-domain or free museum/institutional collections.
# Other sources (including niche, opt-in Wikimedia feeds, personal-use, and keyed ones) are off by default.
DEFAULT_ENABLED_SOURCES = (
    "reframed",
    "artic",
    "met",
    "cleveland",
    "getty",
    "nasa",
    "worldmuseums",
)


def get_source(source_id):
    try:
        return SOURCES[source_id]
    except KeyError:
        raise DiscoverError("Unknown source", 404) from None


def source_info(source, enabled=None):
    """What the front end needs to describe a source, including where to send thanks."""
    if enabled is None:
        enabled = source.id in DEFAULT_ENABLED_SOURCES
    return {
        "id": source.id,
        "name": source.name,
        "short_name": source.short_name,
        "tagline": source.tagline,
        "site_url": source.site_url,
        "support_url": source.support_url,
        "support_label": source.support_label,
        "icon_url": source.icon_url,
        "support_name": getattr(source, "support_name", source.short_name),
        "support_icon_url": getattr(source, "support_icon_url", source.icon_url),
        "license": source.license_note,
        "default_query": source.default_query,
        # Set when the usual "wide" starting filter would hide most of what it has.
        "default_shape": getattr(source, "default_shape", None),
        "tv_ready": source.id == "reframed",
        # Not license-verified (personal use): the app keeps these off until asked.
        "flagged": getattr(source, "flagged", False),
        # Sources that need a key: Settings asks for it when the source is switched on.
        "credentials": credentials.describe(getattr(source, "service", None)),
        "has_type_filter": getattr(source, "has_type_filter", source.id != "reframed"),
        # How eagerly it may be searched: heavy sources wait until typing has settled.
        "weight": getattr(source, "weight", "light"),
        "search_delay_ms": getattr(source, "search_delay_ms", 350),
        "status": Limiter.status(getattr(source, "api_hosts", ())),
        "enabled": bool(enabled),
    }


def resolve_url(url):
    """Turn a page address from a supported site into (source id, item id)."""
    if not isinstance(url, str) or urlsplit(url.strip()).scheme not in ("http", "https"):
        raise DiscoverError("Enter the full web address of an artwork page")
    for source in SOURCES.values():
        item_id = source.from_url(url.strip())
        if item_id:
            return source.id, item_id
    raise DiscoverError(
        "That link is not from a supported site. Supported: "
        + ", ".join(s.name for s in SOURCES.values())
    )


def configure(cache_dir):
    DiskCache.directory = cache_dir
    Limiter.directory = os.path.join(cache_dir, "limits")
