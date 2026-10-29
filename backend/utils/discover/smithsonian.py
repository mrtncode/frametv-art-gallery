"""Smithsonian Open Access: modern American art and design, CC0 and full resolution.

One API covers all the Smithsonian museums. Two are used as collections: the American Art
Museum (20th-century and contemporary American painting, prints and photographs) and
Cooper Hewitt (posters, graphic design and illustration, which is where the pop and
mid-century material is). A free api.data.gov key is needed entered in Settings: the
shared DEMO_KEY allows only ten requests an hour, so a real key is needed.
"""

import re
from urllib.parse import quote

from . import credentials
from .common import (
    PAGE_SIZE,
    DiscoverError,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

API = "https://api.si.edu/openaccess/api/v1.0"
IDS = "https://ids.si.edu/ids/deliveryService"
MAX_SIDE = 6000   # larger scans are scaled down by the image server
_NAME_NOTE = re.compile(r"\s*\(.*$")


def _words(query):
    return " ".join(re.sub(r'["\\():\[\]]', " ", query or "").split())[:100]


def _artist(content):
    """The maker, from the free-text credit ("Name, American, 1868-1962") cut at its first comma."""
    wanted = ("artist", "designer", "illustrator", "maker", "printmaker", "photographer", "author")
    for entry in (content.get("freetext") or {}).get("name") or []:
        if (entry.get("label") or "").lower().split(" ")[0] in wanted:
            return _NAME_NOTE.sub("", entry.get("content", "").split(",")[0]).strip()
    return ""


def _date(content):
    for entry in (content.get("freetext") or {}).get("date") or []:
        if entry.get("content"):
            return entry["content"]
    return ((content.get("indexedStructured") or {}).get("date") or [""])[0]


def _media(record):
    """The first CC0 picture of the record as (ids id, width, height), or None."""
    content = record.get("content") or {}
    descriptive = content.get("descriptiveNonRepeating") or {}
    if (descriptive.get("metadata_usage") or {}).get("access") != "CC0":
        return None
    for media in (descriptive.get("online_media") or {}).get("media") or []:
        if media.get("type") != "Images" or (media.get("usage") or {}).get("access") != "CC0":
            continue
        ids_id = media.get("idsId")
        if not ids_id:
            continue
        for resource in media.get("resources") or []:
            if resource.get("width") and resource.get("height"):
                return ids_id, resource["width"], resource["height"]
        return ids_id, None, None
    return None


class SmithsonianCollection:
    api_hosts = ("api.si.edu", "ids.si.edu")
    download_hosts = {"ids.si.edu"}
    has_type_filter = False
    support_label = "Visit the Smithsonian"
    support_url = "https://www.si.edu/openaccess"
    license_note = "Public domain (CC0)"
    service = "smithsonian"

    def __init__(self, id, name, short_name, tagline, unit, icon_url, site_url, default_query, default_shape=None):
        self.id = id
        self.name = name
        self.short_name = short_name
        self.tagline = tagline
        self.unit = unit
        self.icon_url = icon_url
        self.site_url = site_url
        self.default_query = default_query
        self.default_shape = default_shape

    # --- talking to the API -----------------------------------------------------

    def _get(self, path, params):
        key = credentials.get(self.service)
        if not key:
            raise DiscoverError("Add your Smithsonian API key in Settings to use this source", 503)
        return http_get(f"{API}/{path}", params={**params, "api_key": key}).json()

    def _thumb(self, ids_id):
        return f"{IDS}?id={quote(ids_id)}&max=480"

    def _normalise(self, record):
        found = _media(record)
        if not found:
            return None
        ids_id, width, height = found
        content = record["content"]
        descriptive = content["descriptiveNonRepeating"]
        return artwork(
            self.id,
            record["id"],
            (descriptive.get("title") or {}).get("content"),
            _artist(content),
            _date(content),
            self._thumb(ids_id),
            descriptive.get("record_link") or descriptive.get("guid"),
            self.license_note,
            width=width,
            height=height,
        )

    # --- Source interface -------------------------------------------------------

    def search(self, query, page, paintings_only, shape):
        words = _words(query) or self.default_query
        scope = f'({words}) AND online_media_type:"Images" AND unit_code:"{self.unit}"'
        data = self._get(
            "search", {"q": scope, "start": (page - 1) * PAGE_SIZE, "rows": PAGE_SIZE}
        ).get("response") or {}
        items = [item for item in map(self._normalise, data.get("rows") or []) if item]
        items, hidden = apply_shape(items, shape)
        total = data.get("rowCount") or 0
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": page * PAGE_SIZE < total,
            "total": total,
        }

    def _record(self, item_id):
        record = self._get(f"content/{quote(str(item_id), safe='')}", {}).get("response")
        if not record or not record.get("content"):
            raise DiscoverError("That artwork could not be found", 404)
        return record

    def get(self, item_id):
        item = self._normalise(self._record(item_id))
        if not item:
            raise DiscoverError("That work is not CC0 or has no downloadable image", 404)
        return item

    def plan(self, item_id, fit):
        record = self._record(item_id)
        item = self._normalise(record)
        found = _media(record)
        if not item or not found:
            raise DiscoverError("That work is not CC0 or has no downloadable image", 404)
        ids_id, width, height = found
        url = f"{IDS}?id={quote(ids_id)}"
        if width and height and max(width, height) > MAX_SIDE:
            scale = MAX_SIDE / max(width, height)
            url += f"&max={MAX_SIDE}"
            width, height = round(width * scale), round(height * scale)
        return DownloadPlan(
            url=url,
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=item["page_url"],
            width=width,
            height=height,
            license=self.license_note,
        )

    def from_url(self, url):
        return None


saam = SmithsonianCollection(
    id="saam",
    name="Modern American art",
    short_name="the Smithsonian American Art Museum",
    tagline="20th-century and contemporary American art in the public domain, from the Smithsonian",
    unit="SAAM",
    icon_url="https://americanart.si.edu/favicon.ico",
    site_url="https://americanart.si.edu/art",
    default_query="abstract",
    default_shape="any",
)

cooper_hewitt = SmithsonianCollection(
    id="cooperhewitt",
    name="Design & posters",
    short_name="Cooper Hewitt",
    tagline="Posters, graphic design and illustration from Cooper Hewitt, the Smithsonian design museum",
    unit="CHNDM",
    icon_url="https://www.cooperhewitt.org/favicon.ico",
    site_url="https://collection.cooperhewitt.org/",
    default_query="poster",
    default_shape="any",
)
