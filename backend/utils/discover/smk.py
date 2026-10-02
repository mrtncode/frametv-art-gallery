"""SMK, the National Gallery of Denmark (CC0 metadata, public-domain images, no key)."""

import re
from urllib.parse import urlsplit

from .common import PAGE_SIZE, DiscoverError, DownloadPlan, apply_shape, artwork, http_get

API = "https://api.smk.dk/api/v1/art"
_PAGE_URL = re.compile(r"^/artwork/image/([A-Za-z0-9._-]+)$")


class SMK:
    id = "smk"
    name = "SMK, National Gallery of Denmark"
    short_name = "SMK"
    tagline = "Danish and European masters, public domain, many in full-resolution scans"
    site_url = "https://open.smk.dk"
    support_url = "https://donorbox.org/american-friends-of-statens-museum-for-kunst"
    support_label = "Support SMK (American Friends)"
    icon_url = "https://open.smk.dk/favicon.ico"
    license_note = "Public domain"
    download_hosts = {"api.smk.dk", "iip.smk.dk"}
    default_query = "landscape"
    has_type_filter = True

    @staticmethod
    def _title(record):
        titles = record.get("titles") or []
        english = [t for t in titles if t.get("language") == "engelsk" and t.get("title")]
        chosen = (english or [t for t in titles if t.get("title")] or [{}])[0]
        return chosen.get("title")

    @staticmethod
    def _tile(record):
        """A tile-sized preview: the IIIF thumbnail is 1024 px wide, far more than a tile needs."""
        thumb = record.get("image_thumbnail") or record["image_native"]
        return thumb.replace("/!1024,/", "/!480,/") if "iip-thumb.smk.dk" in thumb else thumb

    def _normalise(self, record):
        if not (record.get("public_domain") and record.get("has_image") and record.get("image_native")):
            return None
        dates = record.get("production_date") or []
        return artwork(
            self.id,
            record["object_number"],
            self._title(record),
            ", ".join(record.get("artist") or []),
            dates[0].get("period") if dates else "",
            self._tile(record),
            record.get("frontend_url") or f"https://open.smk.dk/artwork/image/{record['object_number']}",
            self.license_note,
            width=record.get("image_width"),
            height=record.get("image_height"),
        )

    def search(self, query, page, paintings_only, shape):
        filters = ["[has_image:true]", "[public_domain:true]"]
        if paintings_only:
            filters.append("[object_names:painting]")
        params = {
            "keys": query or self.default_query,
            "offset": (page - 1) * PAGE_SIZE,
            "rows": PAGE_SIZE,
            "lang": "en",
            "filters": ",".join(filters),
        }
        data = http_get(f"{API}/search/", params=params).json()
        items = [item for item in map(self._normalise, data.get("items", [])) if item]
        items, hidden = apply_shape(items, shape)
        found = data.get("found") or 0
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": params["offset"] + PAGE_SIZE < found,
            "total": found,
        }

    def _record(self, item_id):
        data = http_get(f"{API}/", params={"object_number": item_id, "lang": "en"}).json()
        items = data.get("items") or []
        if not items:
            raise DiscoverError("That artwork could not be found", 404)
        return items[0]

    def get(self, item_id):
        item = self._normalise(self._record(item_id))
        if not item:
            raise DiscoverError("That work is not in the public domain or has no image", 404)
        return item

    def plan(self, item_id, fit):
        record = self._record(item_id)
        if not (record.get("public_domain") and record.get("image_native")):
            raise DiscoverError("That work is not in the public domain or has no image", 404)
        return DownloadPlan(
            url=record["image_native"],
            title=self._title(record),
            artist=", ".join(record.get("artist") or []),
            source=self.id,
            page_url=record.get("frontend_url"),
            width=record.get("image_width"),
            height=record.get("image_height"),
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname != "open.smk.dk":
            return None
        match = _PAGE_URL.match(parts.path)
        return match.group(1) if match else None


smk = SMK()
