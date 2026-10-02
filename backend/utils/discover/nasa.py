"""NASA Image and Video Library (no key): space, Earth and the people who go there.

NASA's own imagery is not copyrighted, though a few pictures credit another agency, so the
license note says "free to use" rather than promising public domain. Every search hit
lists its original file with the exact size, so works too small for a TV are left out and
a file too large to download is never offered.
"""

import re
from urllib.parse import urlsplit

from .common import (
    MAX_DOWNLOAD_BYTES,
    PAGE_SIZE,
    DiscoverError,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

API = "https://images-api.nasa.gov/search"
MIN_WIDTH = 1600
_DETAILS = re.compile(r"^/details/([^/]+)$")


def _https(url):
    return "https:" + url[5:] if url and url.startswith("http:") else url


class Nasa:
    api_hosts = ("images-api.nasa.gov",)
    id = "nasa"
    name = "NASA Image Library"
    short_name = "NASA"
    tagline = "Nebulae, planets, Earth from orbit and moonscapes, straight from NASA"
    site_url = "https://images.nasa.gov"
    support_url = "https://images.nasa.gov"
    support_label = "Visit the NASA Image Library"
    icon_url = "https://images.nasa.gov/favicon.ico"
    license_note = "NASA, free to use"
    download_hosts = {"images-assets.nasa.gov"}
    default_query = "nebula"
    has_type_filter = False
    default_shape = "any"   # space photography is every shape; let people choose to narrow it

    @staticmethod
    def _links(record):
        """The thumbnail and the original, by their own labels rather than by position."""
        thumb, original = None, None
        for link in record.get("links") or []:
            if link.get("rel") == "canonical":
                original = link
            elif link.get("rel") == "preview":
                thumb = link
        return thumb, original

    def _normalise(self, record):
        data = (record.get("data") or [{}])[0]
        thumb, original = self._links(record)
        if not data.get("nasa_id") or not thumb or not original:
            return None
        width, height = original.get("width") or 0, original.get("height") or 0
        if width < MIN_WIDTH or not height or (original.get("size") or 0) > MAX_DOWNLOAD_BYTES:
            return None
        return artwork(
            self.id,
            data["nasa_id"],
            data.get("title"),
            data.get("secondary_creator") or data.get("photographer") or data.get("center") or "NASA",
            (data.get("date_created") or "")[:4],
            _https(thumb["href"]),
            f"https://images.nasa.gov/details/{data['nasa_id']}",
            self.license_note,
            width=width,
            height=height,
        )

    def search(self, query, page, paintings_only, shape):
        params = {
            "q": query or self.default_query,
            "media_type": "image",
            "page": page,
            "page_size": PAGE_SIZE,
        }
        collection = http_get(API, params=params).json().get("collection") or {}
        items = [item for item in map(self._normalise, collection.get("items") or []) if item]
        items, hidden = apply_shape(items, shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": any(link.get("rel") == "next" for link in collection.get("links") or []),
            "total": (collection.get("metadata") or {}).get("total_hits"),
        }

    def _record(self, item_id):
        params = {"nasa_id": item_id, "media_type": "image"}
        items = (http_get(API, params=params).json().get("collection") or {}).get("items") or []
        if not items:
            raise DiscoverError("That image could not be found in the NASA Image Library", 404)
        return items[0]

    def get(self, item_id):
        item = self._normalise(self._record(item_id))
        if not item:
            raise DiscoverError("That image is too small or too large to use", 404)
        return item

    def plan(self, item_id, fit):
        record = self._record(item_id)
        item = self._normalise(record)
        if not item:
            raise DiscoverError("That image is too small or too large to use", 404)
        original = self._links(record)[1]
        return DownloadPlan(
            url=_https(original["href"]),
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=item["page_url"],
            width=item["width"],
            height=item["height"],
            license=self.license_note,
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname != "images.nasa.gov":
            return None
        match = _DETAILS.match(parts.path)
        return match.group(1) if match else None


nasa = Nasa()
