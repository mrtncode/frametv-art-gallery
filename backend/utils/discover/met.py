"""The Metropolitan Museum of Art Open Access API (CC0, no key).

Two quirks shape this module:

* Search cannot filter to open-access works: ``isPublicDomain`` and ``hasImages`` are
  ignored, and only about a third of the hits have a downloadable image. So each page
  looks at a window of raw hits and keeps the open-access ones.
* The Met's firewall blocks clients that burst, even below its documented 80 requests
  a second. Object lookups run three at a time and are cached on disk for a week.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from .common import (
    DiscoverError,
    DiskCache,
    DownloadPlan,
    artwork,
    http_get,
    apply_shape,
)

log = logging.getLogger(__name__)

API = "https://collectionapi.metmuseum.org/public/collection"
RAW_WINDOW = 48
_PAGE_URL = re.compile(r"^/art/collection/search/(\d+)$")


def _aspect(record):
    """Shape of the artwork itself, from its physical size; the images are not measured."""
    for measure in record.get("measurements") or []:
        if measure.get("elementName") == "Overall":
            dims = measure.get("elementMeasurements") or {}
            height, width = dims.get("Height"), dims.get("Width")
            if height and width:
                return round(width / height, 3)
    return None


def summarise(record):
    """The few fields we use, small enough to cache by the thousand."""
    return {
        "id": record["objectID"],
        "title": record.get("title"),
        "artist": record.get("artistDisplayName") or record.get("culture"),
        "date": record.get("objectDate"),
        "open": bool(record.get("isPublicDomain") and record.get("primaryImage")),
        "image": record.get("primaryImage"),
        "small": record.get("primaryImageSmall"),
        "url": record.get("objectURL"),
        "aspect": _aspect(record),
    }


class Met:
    id = "met"
    name = "The Metropolitan Museum of Art"
    short_name = "The Met"
    tagline = "400,000+ open-access works from one of the world's great museums"
    site_url = "https://www.metmuseum.org/art/collection/search"
    support_url = "https://www.metmuseum.org/support"
    support_label = "Support The Met"
    icon_url = "https://www.metmuseum.org/favicon.ico"
    license_note = "Public domain (CC0)"
    download_hosts = {"images.metmuseum.org"}
    default_query = "landscape"

    objects = DiskCache("met_object", 7 * 24 * 3600)
    searches = DiskCache("met_search", 3600)

    def _summary(self, object_id):
        def fetch():
            return summarise(http_get(f"{API}/v1/objects/{int(object_id)}").json())

        return self.objects.memo(str(int(object_id)), fetch)

    def _normalise(self, summary):
        if not summary["open"]:
            return None
        return artwork(
            self.id,
            summary["id"],
            summary["title"],
            summary["artist"],
            summary["date"],
            summary["small"] or summary["image"],
            summary["url"],
            self.license_note,
            aspect=summary["aspect"],
        )

    def search(self, query, page, paintings_only, shape):
        params = {"q": query or self.default_query, "limit": RAW_WINDOW, "offset": (page - 1) * RAW_WINDOW}
        if paintings_only:
            params["medium"] = "Paintings"
        cache_key = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        data = self.searches.memo(
            cache_key, lambda: http_get(f"{API}/v1.1/search", params=params).json()
        )
        ids = data.get("objectIDs") or []

        def load(object_id):
            try:
                return self._normalise(self._summary(object_id))
            except DiscoverError as exc:
                if exc.status == 429:
                    raise
                log.warning("Met object %s skipped: %s", object_id, exc)
                return None

        with ThreadPoolExecutor(max_workers=3) as pool:
            items = [item for item in pool.map(load, ids) if item]
        items, hidden = apply_shape(items, shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": params["offset"] + len(ids) < (data.get("total") or 0),
            "total": None,
        }

    def get(self, item_id):
        item = self._normalise(self._summary(item_id))
        if not item:
            raise DiscoverError("That work is not in the public domain or has no image", 404)
        return item

    def plan(self, item_id, fit):
        summary = self._summary(item_id)
        if not summary["open"]:
            raise DiscoverError("That work is not in the public domain or has no image", 404)
        return DownloadPlan(
            url=summary["image"],
            title=summary["title"],
            artist=summary["artist"],
            source=self.id,
            page_url=summary["url"],
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("www.metmuseum.org", "metmuseum.org"):
            return None
        match = _PAGE_URL.match(parts.path)
        return match.group(1) if match else None


met = Met()
