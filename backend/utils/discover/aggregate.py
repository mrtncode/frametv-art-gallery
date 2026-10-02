"""Search caching and the daily highlights, shared by the endpoints.

Searches are cached on disk for a day (per source, query, page and type), so repeating a
search, switching a shape filter, or opening the page again costs the sources nothing. The
cache stores the source's raw page and the shape and sharpness filters are applied
afterwards, which is why changing them never needs a new request.
"""

import datetime
import re

from .common import (
    DiscoverError,
    DiskCache,
    apply_shape,
    matches_sharp,
    matches_shape,
)

SEARCH_TTL_SECONDS = 24 * 3600
HIGHLIGHTS_TTL_SECONDS = 24 * 3600

# One theme a day, so the hero changes without anyone choosing what is in it.
MOODS = [
    "landscape", "seascape", "sunset", "mountains", "garden", "winter",
    "river", "forest", "harbor", "flowers", "village", "coast",
]
# The Met is left out: it does not list image sizes, and it is the costly source to ask.
HERO_SOURCES = ("reframed", "artic", "cleveland", "smk", "louvre", "worldmuseums")
PER_SOURCE = 2
MAX_SLIDES = 12


def cached_search(source, query, page, paintings_only):
    """(raw page, whether it came from the cache). Only successful searches are kept."""
    ttl = getattr(source, "search_cache_ttl", SEARCH_TTL_SECONDS)
    cache = DiskCache("search", ttl)
    key = f"{source.id}|{(query or '').strip().lower()}|{page}|{int(bool(paintings_only))}"
    hit = cache.get(key)
    if hit is not None:
        return hit, True
    raw = source.search(query, page, paintings_only, "any")
    stored = {"results": raw["results"], "has_more": raw["has_more"], "total": raw["total"]}
    cache.put(key, stored)
    return stored, False


def filter_results(results, shape, sharp):
    """Apply the shape and sharpness filters; also say how many were hidden."""
    kept, hidden = apply_shape(results, shape)
    if sharp:
        sharp_kept = [item for item in kept if matches_sharp(item)]
        hidden += len(kept) - len(sharp_kept)
        kept = sharp_kept
    return kept, hidden


def hero_url(art):
    """A larger version of a tile's picture, where the source lets us ask for one."""
    url = art["thumb_url"]
    source = art["source"]
    if source == "reframed":
        return url.replace("width=480", "width=1600")
    if source == "artic":
        return url.replace("/full/400,/", "/full/1400,/")
    if source == "smk":
        return url.replace("!480,", "!1400,")
    if source in ("louvre", "worldmuseums"):
        return re.sub(r"/\d+px-", "/1280px-", url)
    return url


def highlights(sources, today=None):
    """A few wide, sharp pictures from different sources, for the hero. Cached for a day.

    Each source contributes at most PER_SOURCE, interleaved so the hero moves from one
    source to the next. A source that is resting or failing is skipped, never fatal.
    """
    today = today or datetime.date.today()
    cache = DiskCache("highlights", HIGHLIGHTS_TTL_SECONDS)
    key = today.isoformat()
    hit = cache.get(key)
    if hit is not None:
        return hit

    mood = MOODS[today.toordinal() % len(MOODS)]
    columns = []
    for source_id in HERO_SOURCES:
        source = sources.get(source_id)
        if source is None:
            continue
        try:
            raw, _ = cached_search(source, mood, 1, True)
        except DiscoverError:
            continue
        picks = [art for art in raw["results"] if matches_shape(art, "wide") and matches_sharp(art)]
        columns.append([{**art, "hero_url": hero_url(art)} for art in picks[:PER_SOURCE]])

    items = []
    for rank in range(PER_SOURCE):
        for column in columns:
            if rank < len(column):
                items.append(column[rank])
    result = {"mood": mood, "items": items[:MAX_SLIDES]}
    if items:  # do not remember an empty day: try again on the next visit
        cache.put(key, result)
    return result
