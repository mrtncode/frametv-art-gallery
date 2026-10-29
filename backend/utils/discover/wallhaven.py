"""Wallhaven: tag-searchable digital art and illustration wallpapers. NOT license-verified.

Wallhaven has a huge, well-tagged library but records no license: its terms say every image
stays the property of its owner. That makes this a personal-use source, so it is flagged
in the app and off until someone switches it on in Settings, and it is never used for the
daily highlights. Only safe-for-work results are ever requested. No key is needed.
"""

import re
from urllib.parse import urlsplit

from .common import (
    FLAGGED_MIN_WIDTH,
    PAGE_SIZE,
    DiscoverError,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

API = "https://wallhaven.cc/api/v1"
_PAGE_ID = re.compile(r"^/w/([0-9a-z]{6})$")
PER_PAGE = 24   # fixed by Wallhaven


class Wallhaven:
    api_hosts = ("wallhaven.cc",)
    id = "wallhaven"
    name = "Wallhaven"
    short_name = "Wallhaven"
    tagline = "Digital art and illustration wallpapers searched by tag. License not verified: personal use"
    site_url = "https://wallhaven.cc/"
    support_url = "https://wallhaven.cc/about"
    support_label = "Visit Wallhaven"
    icon_url = "https://wallhaven.cc/favicon.ico"
    license_note = "License not verified (personal use)"
    download_hosts = {"w.wallhaven.cc"}
    default_query = "illustration"
    has_type_filter = False
    flagged = True

    @staticmethod
    def _ratio(record):
        return record.get("dimension_x") or None, record.get("dimension_y") or None

    def _normalise(self, record, title=None, artist=None):
        width, height = self._ratio(record)
        thumbs = record.get("thumbs") or {}
        if not record.get("id") or not width or not height or not record.get("path"):
            return None
        return artwork(
            self.id,
            record["id"],
            title or f"Wallpaper {record['id']}",
            artist,
            "",
            thumbs.get("large") or thumbs.get("small") or record["path"],
            record.get("url"),
            self.license_note,
            width=width,
            height=height,
        )

    def search(self, query, page, paintings_only, shape):
        text = " ".join((query or "").split())[:100] or self.default_query
        data = http_get(
            f"{API}/search",
            params={
                "q": text,
                "categories": "110",   # general and anime; "people" is left out
                "purity": "100",       # safe for work only
                "sorting": "relevance",
                "atleast": f"{FLAGGED_MIN_WIDTH}x{FLAGGED_MIN_WIDTH * 9 // 16}",
                "page": page,
            },
        ).json()
        items = [item for item in map(self._normalise, data.get("data") or []) if item]
        items, hidden = apply_shape(items, shape)
        meta = data.get("meta") or {}
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": page < (meta.get("last_page") or 0),
            "total": meta.get("total"),
        }

    def _record(self, item_id):
        data = http_get(f"{API}/w/{item_id}").json().get("data") or {}
        if not data.get("id"):
            raise DiscoverError("That wallpaper could not be found", 404)
        if data.get("purity") != "sfw":
            raise DiscoverError("That wallpaper is not safe for work", 404)
        return data

    @staticmethod
    def _title(record):
        tags = [t.get("name") for t in record.get("tags") or [] if t.get("name")]
        return tags[0].title() if tags else None

    def get(self, item_id):
        record = self._record(item_id)
        item = self._normalise(record, self._title(record), (record.get("uploader") or {}).get("username"))
        if not item:
            raise DiscoverError("That wallpaper has no downloadable file", 404)
        return item

    def plan(self, item_id, fit):
        record = self._record(item_id)
        width, height = self._ratio(record)
        if not record.get("path"):
            raise DiscoverError("That wallpaper has no downloadable file", 404)
        return DownloadPlan(
            url=record["path"],
            title=self._title(record) or f"Wallpaper {record['id']}",
            artist=(record.get("uploader") or {}).get("username"),
            source=self.id,
            page_url=record.get("url"),
            width=width,
            height=height,
            license=self.license_note,
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("wallhaven.cc", "www.wallhaven.cc"):
            return None
        match = _PAGE_ID.match(parts.path)
        return match.group(1) if match else None


wallhaven = Wallhaven()
