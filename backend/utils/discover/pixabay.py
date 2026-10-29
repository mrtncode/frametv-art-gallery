"""Pixabay illustrations: bright, cute and graphic art under the Pixabay Content License.

The free API hands out files up to 1280 px wide; the full-size and Full HD files are only
included for accounts Pixabay has approved for full API access. Whichever file the API
returns is what is offered, with its real size, so the "sharp" filter hides the small ones
and a fully approved key unlocks the large ones with no change here. Pixabay asks that
results are cached for 24 hours (the search cache does that) and that images are not
hotlinked for good: previews are shown only while browsing, and an import saves its own
copy. Needs a free key, entered in Settings.
"""

import re
from urllib.parse import urlsplit

from . import credentials
from .common import (
    PAGE_SIZE,
    DiscoverError,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

API = "https://pixabay.com/api/"
_PAGE_ID = re.compile(r"-(\d+)/?$")
_LARGE_SIDE = 1280   # the longest side of largeImageURL


def _title(tags):
    words = [t.strip() for t in (tags or "").split(",") if t.strip()][:3]
    return ", ".join(words).title() or "Untitled"


def _best(hit):
    """(url, width, height) of the biggest file this key may use."""
    width, height = hit.get("imageWidth") or 0, hit.get("imageHeight") or 0
    if hit.get("imageURL") and width and height:
        return hit["imageURL"], width, height
    if hit.get("fullHDURL") and width and height:
        scale = min(1, 1920 / max(width, height))
        return hit["fullHDURL"], round(width * scale), round(height * scale)
    scale = min(1, _LARGE_SIDE / max(width, height, 1))
    return hit.get("largeImageURL"), round(width * scale), round(height * scale)


class Pixabay:
    api_hosts = ("pixabay.com",)
    id = "pixabay"
    name = "Pixabay illustrations"
    short_name = "Pixabay"
    tagline = "Cute, colorful and graphic illustration (full-size files need an approved Pixabay key)"
    site_url = "https://pixabay.com/illustrations/"
    support_url = "https://pixabay.com/service/about/"
    support_label = "Visit Pixabay"
    icon_url = "https://pixabay.com/favicon.ico"
    license_note = "Pixabay Content License"
    download_hosts = {"cdn.pixabay.com"}
    default_query = "cute"
    has_type_filter = False
    default_shape = "any"
    service = "pixabay"

    def _call(self, **params):
        key = credentials.get(self.service)
        if not key:
            raise DiscoverError("Add your Pixabay API key in Settings to use this source", 503)
        return http_get(API, params={"key": key, "safesearch": "true", **params}).json()

    def _normalise(self, hit):
        url, width, height = _best(hit)
        if not url or not width or not height:
            return None
        return artwork(
            self.id,
            hit["id"],
            _title(hit.get("tags")),
            hit.get("user"),
            "",
            hit.get("webformatURL") or hit.get("previewURL") or url,
            hit.get("pageURL"),
            self.license_note,
            width=width,
            height=height,
        )

    def search(self, query, page, paintings_only, shape):
        data = self._call(
            q=" ".join((query or "").split())[:100] or self.default_query,
            image_type="illustration",
            order="popular",
            per_page=PAGE_SIZE,
            page=page,
        )
        items = [item for item in map(self._normalise, data.get("hits") or []) if item]
        items, hidden = apply_shape(items, shape)
        total = data.get("totalHits") or 0
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": page * PAGE_SIZE < total,
            "total": total,
        }

    def _hit(self, item_id):
        hits = self._call(id=item_id).get("hits") or []
        if not hits:
            raise DiscoverError("That image could not be found on Pixabay", 404)
        return hits[0]

    def get(self, item_id):
        item = self._normalise(self._hit(item_id))
        if not item:
            raise DiscoverError("That image has no downloadable file", 404)
        return item

    def plan(self, item_id, fit):
        hit = self._hit(item_id)
        url, width, height = _best(hit)
        if not url:
            raise DiscoverError("That image has no downloadable file", 404)
        return DownloadPlan(
            url=url,
            title=_title(hit.get("tags")),
            artist=hit.get("user"),
            source=self.id,
            page_url=hit.get("pageURL"),
            width=width,
            height=height,
            license=self.license_note,
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("pixabay.com", "www.pixabay.com"):
            return None
        match = _PAGE_ID.search(parts.path)
        return match.group(1) if match else None


pixabay = Pixabay()
