"""Konachan: anime and illustration wallpapers, large and tagged. NOT license-verified.

A wallpaper site: most files are 1080p to 4K. Every picture stays its artist's own work and
the site records no reusable license (the source link on each post points back to the
artist), so this is a personal-use source: flagged in the app, off until switched on in
Settings, and never in the daily highlights. Only the safe rating on the site's safe domain
is used, and checked again on every result. No key is needed.
"""

import re
from urllib.parse import urlsplit

from .common import (
    FLAGGED_MIN_WIDTH,
    MAX_DOWNLOAD_BYTES,
    PAGE_SIZE,
    DiscoverError,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

SITE = "https://konachan.net"
FETCH = PAGE_SIZE * 2
_TAG = re.compile(r"[^\w()'.-]", re.UNICODE)
EXTENSIONS = {"jpg", "jpeg", "png"}


def _tags(query):
    return [_TAG.sub("", word.lower()) for word in (query or "").split()[:4] if _TAG.sub("", word)]


class Konachan:
    api_hosts = ("konachan.net",)
    id = "konachan"
    name = "Konachan"
    short_name = "Konachan"
    tagline = "Anime and illustration wallpapers searched by tag (try scenic, sunset). License not verified: personal use"
    site_url = "https://konachan.net/"
    support_url = "https://konachan.net/"
    support_label = "Visit Konachan"
    icon_url = "https://konachan.net/favicon.ico"
    license_note = "License not verified (personal use)"
    download_hosts = {"konachan.net"}
    default_query = "scenic"
    has_type_filter = False
    default_shape = "wide"
    flagged = True

    def _normalise(self, post):
        width, height = post.get("width") or 0, post.get("height") or 0
        extension = (post.get("file_url") or "").rsplit(".", 1)[-1].lower()
        if (
            post.get("rating") != "s"
            or not post.get("file_url")
            or extension not in EXTENSIONS
            or width < FLAGGED_MIN_WIDTH
            or not height
            or (post.get("file_size") or 0) > MAX_DOWNLOAD_BYTES
        ):
            return None
        words = [t for t in (post.get("tags") or "").split(" ") if t][:3]
        return artwork(
            self.id,
            post["id"],
            " ".join(words).replace("_", " ").title() or "Wallpaper",
            "",
            "",
            post.get("sample_url") or post.get("preview_url") or post["file_url"],
            f"{SITE}/post/show/{post['id']}",
            self.license_note,
            width=width,
            height=height,
        )

    def search(self, query, page, paintings_only, shape):
        words = _tags(query) or [self.default_query]
        tags = " ".join(["rating:safe", f"width:{FLAGGED_MIN_WIDTH}..", "order:score", *words])
        posts = http_get(f"{SITE}/post.json", params={"tags": tags, "limit": FETCH, "page": page}).json()
        items = [item for item in map(self._normalise, posts) if item][:PAGE_SIZE]
        items, hidden = apply_shape(items, shape)
        return {"results": items, "page": page, "hidden": hidden, "has_more": len(posts) >= FETCH, "total": None}

    def _post(self, item_id):
        if not str(item_id).isdigit():
            raise DiscoverError("That wallpaper could not be found", 404)
        posts = http_get(f"{SITE}/post.json", params={"tags": f"id:{item_id}", "limit": 1}).json()
        if not posts:
            raise DiscoverError("That wallpaper could not be found", 404)
        return posts[0]

    def get(self, item_id):
        item = self._normalise(self._post(item_id))
        if not item:
            raise DiscoverError("That wallpaper is not a large, safe-rated picture", 404)
        return item

    def plan(self, item_id, fit):
        post = self._post(item_id)
        item = self._normalise(post)
        if not item:
            raise DiscoverError("That wallpaper is not a large, safe-rated picture", 404)
        return DownloadPlan(
            url=post["file_url"],
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
        match = re.match(r"^/post/show/(\d+)", parts.path)
        return match.group(1) if parts.hostname in ("konachan.net", "www.konachan.net") and match else None


konachan = Konachan()
