"""Cleveland Museum of Art Open Access API (CC0, no key)."""

import re
from urllib.parse import unquote, urlsplit

from .common import PAGE_SIZE, DiscoverError, DownloadPlan, artwork, http_get, apply_wide

API = "https://openaccess-api.clevelandart.org/api/artworks"
FIELDS = "id,accession_number,title,creators,creation_date,type,share_license_status,url,images"
_PAGE_URL = re.compile(r"^/art/([0-9A-Za-z._-]+)$")


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class Cleveland:
    id = "cleveland"
    name = "Cleveland Museum of Art"
    short_name = "the Cleveland Museum of Art"
    tagline = "CC0 works with print-quality images up to 3400 px"
    site_url = "https://www.clevelandart.org/art/collection/search"
    support_url = "https://www.clevelandart.org/waystogive"
    support_label = "Support the Cleveland Museum of Art"
    icon_url = "https://www.clevelandart.org/favicon.ico"
    license_note = "Public domain (CC0)"
    download_hosts = {"openaccess-cdn.clevelandart.org"}
    default_query = "landscape"

    @staticmethod
    def _artist(record):
        creators = record.get("creators") or []
        if not creators:
            return None
        description = creators[0].get("description") or ""
        return re.sub(r"\s*\(.*$", "", description).strip() or None

    def _normalise(self, record):
        images = record.get("images") or {}
        print_image = images.get("print") or {}
        web_image = images.get("web") or {}
        if record.get("share_license_status") != "CC0" or not print_image.get("url"):
            return None
        return artwork(
            self.id,
            record["id"],
            record.get("title"),
            self._artist(record),
            record.get("creation_date"),
            web_image.get("url") or print_image["url"],
            record.get("url"),
            self.license_note,
            width=_to_int(print_image.get("width")),
            height=_to_int(print_image.get("height")),
        )

    def search(self, query, page, paintings_only, wide_only):
        params = {
            "q": query or self.default_query,
            "has_image": 1,
            "cc0": 1,
            "limit": PAGE_SIZE,
            "skip": (page - 1) * PAGE_SIZE,
            "fields": FIELDS,
        }
        if paintings_only:
            params["type"] = "Painting"
        data = http_get(API + "/", params=params).json()
        items = [item for item in map(self._normalise, data.get("data", [])) if item]
        items, hidden = apply_wide(items, wide_only)
        total = (data.get("info") or {}).get("total", 0)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": params["skip"] + PAGE_SIZE < total,
            "total": total,
        }

    def _record(self, item_id):
        item_id = str(item_id)
        if item_id.isdigit():
            data = http_get(f"{API}/{item_id}", params={"fields": FIELDS}).json()
            return data.get("data") or {}
        data = http_get(
            API + "/", params={"accession_number": item_id, "fields": FIELDS, "limit": 1}
        ).json()
        found = data.get("data") or []
        if not found:
            raise DiscoverError("That artwork could not be found", 404)
        return found[0]

    def get(self, item_id):
        item = self._normalise(self._record(item_id))
        if not item:
            raise DiscoverError("That work is not CC0 or has no downloadable image", 404)
        return item

    def plan(self, item_id, fit):
        record = self._record(item_id)
        print_image = (record.get("images") or {}).get("print") or {}
        if record.get("share_license_status") != "CC0" or not print_image.get("url"):
            raise DiscoverError("That work is not CC0 or has no downloadable image", 404)
        return DownloadPlan(
            url=print_image["url"],
            title=record.get("title"),
            artist=self._artist(record),
            source=self.id,
            page_url=record.get("url"),
            width=_to_int(print_image.get("width")),
            height=_to_int(print_image.get("height")),
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("www.clevelandart.org", "clevelandart.org"):
            return None
        match = _PAGE_URL.match(unquote(parts.path))
        return match.group(1) if match else None


cleveland = Cleveland()
