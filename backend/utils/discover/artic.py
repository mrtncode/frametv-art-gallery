"""Art Institute of Chicago public API (no key). Images come from its IIIF server."""

import os
import re
from urllib.parse import urlsplit

from .common import (
    PAGE_SIZE,
    TARGET_HEIGHT,
    TARGET_WIDTH,
    DiscoverError,
    DownloadPlan,
    artwork,
    http_get,
    http_post_json,
    apply_shape,
)
from .crop import FIT_FILL, plan_fill

API = "https://api.artic.edu/api/v1"
IIIF = "https://www.artic.edu/iiif/2"
FIELDS = ["id", "title", "artist_title", "date_display", "image_id", "thumbnail", "is_public_domain"]
_PAGE_URL = re.compile(r"^/artworks/(\d+)")

# The museum asks API clients to name themselves in this header, and its image server
# challenges anonymous scripted requests without it. DISCOVER_CONTACT can carry an email
# or URL so the museum has a way to reach whoever runs this instance.
AIC_HEADERS = {
    "AIC-User-Agent": "frametv-art-gallery ({})".format(
        os.environ.get("DISCOVER_CONTACT", "https://github.com/mrtncode/frametv-art-gallery")
    )
}


def iiif_url(image_id, fit, width, height):
    """Image URL that makes the museum's server do the cropping and resizing.

    "full" size is refused by the server, so native size is spelled out as a width.
    """
    if fit == FIT_FILL:
        x, y, crop_w, crop_h = plan_fill(width, height)
        size = f"{TARGET_WIDTH},{TARGET_HEIGHT}" if crop_w >= TARGET_WIDTH else f"{crop_w},"
        return f"{IIIF}/{image_id}/{x},{y},{crop_w},{crop_h}/{size}/0/default.jpg"
    if width > TARGET_WIDTH or height > TARGET_HEIGHT:
        return f"{IIIF}/{image_id}/full/!{TARGET_WIDTH},{TARGET_HEIGHT}/0/default.jpg"
    return f"{IIIF}/{image_id}/full/{width},/0/default.jpg"


class ArtInstituteChicago:
    api_hosts = ("api.artic.edu",)
    id = "artic"
    name = "Art Institute of Chicago"
    short_name = "the Art Institute of Chicago"
    tagline = "Public-domain masterworks, cropped to 16:9 by the museum's own image server"
    site_url = "https://www.artic.edu/collection"
    support_url = "https://www.artic.edu/support-us"
    support_label = "Support the Art Institute"
    icon_url = "https://www.artic.edu/favicon.ico"
    license_note = "Public domain (CC0)"
    download_hosts = {"www.artic.edu"}
    default_query = "landscape"

    def _normalise(self, record):
        if not record.get("is_public_domain") or not record.get("image_id"):
            return None
        thumb = record.get("thumbnail") or {}
        image_id = record["image_id"]
        return artwork(
            self.id,
            record["id"],
            record.get("title"),
            record.get("artist_title"),
            record.get("date_display"),
            f"{IIIF}/{image_id}/full/400,/0/default.jpg",
            f"https://www.artic.edu/artworks/{record['id']}",
            self.license_note,
            width=thumb.get("width"),
            height=thumb.get("height"),
        ) | {"image_id": image_id}

    def search(self, query, page, paintings_only, shape):
        # `q` is ignored once a `query` is sent, so the text match goes inside it.
        must = [
            {
                "multi_match": {
                    "query": query or self.default_query,
                    "fields": ["title^3", "artist_title^3", "description", "subject_titles", "style_title"],
                }
            },
            {"term": {"is_public_domain": True}},
            {"exists": {"field": "image_id"}},
        ]
        if paintings_only:
            must.append({"term": {"artwork_type_title.keyword": "Painting"}})
        data = http_post_json(
            f"{API}/artworks/search",
            {
                "query": {"bool": {"must": must}},
                "fields": FIELDS,
                "limit": PAGE_SIZE,
                "page": page,
            },
            headers=AIC_HEADERS,
        )
        items = [item for item in map(self._normalise, data.get("data", [])) if item]
        items, hidden = apply_shape(items, shape)
        pagination = data.get("pagination", {})
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": page < (pagination.get("total_pages") or 0),
            "total": pagination.get("total", 0),
        }

    def _record(self, item_id):
        data = http_get(
            f"{API}/artworks/{int(item_id)}",
            params={"fields": ",".join(FIELDS)},
            headers=AIC_HEADERS,
        ).json()
        return data.get("data") or {}

    def get(self, item_id):
        item = self._normalise(self._record(item_id))
        if not item:
            raise DiscoverError("That work is not in the public domain or has no image", 404)
        return item

    def plan(self, item_id, fit):
        record = self._record(item_id)
        thumb = record.get("thumbnail") or {}
        width, height = thumb.get("width"), thumb.get("height")
        if not record.get("is_public_domain") or not record.get("image_id"):
            raise DiscoverError("That work is not in the public domain or has no image", 404)
        if not width or not height:
            raise DiscoverError("The museum does not list this image's size", 502)
        return DownloadPlan(
            url=iiif_url(record["image_id"], fit, width, height),
            title=record.get("title"),
            artist=record.get("artist_title"),
            source=self.id,
            page_url=f"https://www.artic.edu/artworks/{record['id']}",
            width=width,
            height=height,
            server_cropped=True,
            headers=AIC_HEADERS,
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("www.artic.edu", "artic.edu"):
            return None
        match = _PAGE_URL.match(parts.path)
        return match.group(1) if match else None


artic = ArtInstituteChicago()
