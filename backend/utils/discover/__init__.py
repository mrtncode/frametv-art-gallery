"""Discover: search free, high-resolution art and import it ready for the Frame."""

import os
from urllib.parse import urlsplit

from .artic import artic
from .cleveland import cleveland
from .common import DiscoverError, DiskCache
from .limits import Limiter
from .met import met
from .nasa import nasa
from .reframed import reframed
from .smk import smk
from .wikimedia import holidays, louvre, posters, world_museums

# Reframed first: its files are already 3840x2160.
SOURCES = {
    source.id: source
    for source in (reframed, artic, met, cleveland, smk, louvre, world_museums, holidays, posters, nasa)
}


def get_source(source_id):
    try:
        return SOURCES[source_id]
    except KeyError:
        raise DiscoverError("Unknown source", 404) from None


def source_info(source):
    """What the front end needs to describe a source, including where to send thanks."""
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
        "has_type_filter": getattr(source, "has_type_filter", source.id != "reframed"),
        # How eagerly it may be searched: heavy sources wait until typing has settled.
        "weight": getattr(source, "weight", "light"),
        "search_delay_ms": getattr(source, "search_delay_ms", 350),
        "status": Limiter.status(getattr(source, "api_hosts", ())),
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
