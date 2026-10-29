"""Flickr: modern photographers and digital artists who chose a free license.

Only photos licensed CC BY, CC BY-SA, CC0 or marked public domain are searched, never the
non-commercial or no-derivatives kinds (a TV crop is a derivative). A CC BY work must credit
its maker, so the owner's name and the license travel with every import. Search matches the
title, description and tags, which is how "cool things by tag" is found. Needs a free
Flickr API key, entered in Settings.
"""

import re
from urllib.parse import urlsplit

from . import credentials
from .common import (
    PAGE_SIZE,
    DiscoverError,
    DownloadPlan,
    HostSuffixes,
    apply_shape,
    artwork,
    http_get,
)

API = "https://api.flickr.com/services/rest/"
MIN_WIDTH = 2000
# Flickr's own license numbers, limited to the ones we can use.
LICENSES = {"4": "CC BY", "5": "CC BY-SA", "9": "CC0", "10": "Public Domain Mark"}
_SIZE_FIELDS = ("o", "k", "h", "l")   # original, 2048, 1600, 1024: largest first
_EXTRAS = "license,owner_name,tags,date_taken," + ",".join(f"url_{s}" for s in ("z", *_SIZE_FIELDS))
_PHOTO_PAGE = re.compile(r"^/photos/[^/]+/(\d+)")


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _license_note(code):
    name = LICENSES.get(str(code))
    return name if name in ("CC0", "Public Domain Mark") else f"{name} (credit the photographer)"


class Flickr:
    api_hosts = ("api.flickr.com",)
    id = "flickr"
    name = "Flickr (Creative Commons)"
    short_name = "Flickr"
    tagline = "Street art, illustration and photography from people who shared it freely"
    site_url = "https://www.flickr.com/creativecommons/"
    support_url = "https://www.flickr.com/creativecommons/"
    support_label = "Browse Creative Commons on Flickr"
    icon_url = "https://combo.staticflickr.com/pw/favicon.ico"
    license_note = "Creative Commons (credit the photographer)"
    download_hosts = HostSuffixes(".staticflickr.com")
    default_query = "street art"
    has_type_filter = False
    default_shape = "any"
    service = "flickr"

    def _call(self, method, **params):
        key = credentials.get(self.service)
        if not key:
            raise DiscoverError("Add your Flickr API key in Settings to use this source", 503)
        data = http_get(
            API,
            params={"method": method, "api_key": key, "format": "json", "nojsoncallback": 1, **params},
        ).json()
        if data.get("stat") != "ok":
            if data.get("code") == 1:
                raise DiscoverError("That photo could not be found on Flickr", 404)
            raise DiscoverError(f"Flickr said: {data.get('message', 'something went wrong')}", 502)
        return data

    @staticmethod
    def _best(photo):
        """The largest file the owner allows: (url, width, height)."""
        for size in _SIZE_FIELDS:
            url, width, height = photo.get(f"url_{size}"), _int(photo.get(f"width_{size}")), _int(photo.get(f"height_{size}"))
            if url and width and height:
                return url, width, height
        return None

    def _normalise(self, photo):
        best = self._best(photo)
        license_code = str(photo.get("license"))
        if not best or license_code not in LICENSES:
            return None
        _, width, height = best
        if width < MIN_WIDTH:
            return None
        owner = photo.get("ownername") or ""
        return artwork(
            self.id,
            photo["id"],
            photo.get("title"),
            owner,
            (photo.get("datetaken") or "")[:4],
            photo.get("url_z") or photo.get("url_l") or best[0],
            f"https://www.flickr.com/photos/{photo.get('owner')}/{photo['id']}",
            _license_note(license_code),
            width=width,
            height=height,
        )

    def search(self, query, page, paintings_only, shape):
        text = " ".join((query or "").split()) or self.default_query
        data = self._call(
            "flickr.photos.search",
            text=text,
            license=",".join(LICENSES),
            sort="relevance",
            media="photos",
            content_types=0,
            safe_search=1,
            extras=_EXTRAS + ",o_dims",
            per_page=PAGE_SIZE,
            page=page,
        )["photos"]
        items = [item for item in map(self._normalise, data.get("photo") or []) if item]
        items, hidden = apply_shape(items, shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": page < _int(data.get("pages")),
            "total": _int(data.get("total")),
        }

    def _info(self, item_id):
        """(info, sizes) for one photo, enough to build an item and a download."""
        info = self._call("flickr.photos.getInfo", photo_id=item_id)["photo"]
        sizes = self._call("flickr.photos.getSizes", photo_id=item_id)["sizes"]["size"]
        return info, sizes

    @staticmethod
    def _largest(sizes):
        usable = [s for s in sizes if s.get("label") != "Square" and _int(s.get("width")) and s.get("source")]
        return max(usable, key=lambda s: _int(s["width"]), default=None)

    def _from_info(self, info, sizes):
        largest = self._largest(sizes)
        code = str(info.get("license"))
        if not largest or code not in LICENSES:
            raise DiscoverError("That photo is not freely licensed, or has no downloadable file", 404)
        owner = info.get("owner") or {}
        urls = (info.get("urls") or {}).get("url") or [{}]
        medium = next((s for s in sizes if s.get("label") in ("Medium 640", "Medium 800", "Large")), largest)
        return largest, artwork(
            self.id,
            info["id"],
            (info.get("title") or {}).get("_content"),
            owner.get("realname") or owner.get("username"),
            ((info.get("dates") or {}).get("taken") or "")[:4],
            medium["source"],
            urls[0].get("_content"),
            _license_note(code),
            width=_int(largest["width"]),
            height=_int(largest["height"]),
        )

    def get(self, item_id):
        return self._from_info(*self._info(item_id))[1]

    def plan(self, item_id, fit):
        largest, item = self._from_info(*self._info(item_id))
        return DownloadPlan(
            url=largest["source"],
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=item["page_url"],
            width=_int(largest["width"]),
            height=_int(largest["height"]),
            license=item["license"],
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("www.flickr.com", "flickr.com"):
            return None
        match = _PHOTO_PAGE.match(parts.path)
        return match.group(1) if match else None


flickr = Flickr()
