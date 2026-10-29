"""Danbooru: tag-searchable illustration, mostly anime and game art. NOT license-verified.

A huge, very well tagged library of current illustration (4K files are common), with the
artist named in the tags. Each picture stays its artist's own work and the site records no
reusable license, so this is a personal-use source: flagged in the app, off until switched on
in Settings, and never in the daily highlights. Only the "general" rating is requested, and
checked again on every result. No key is needed, but without an account Danbooru allows two
tags per search, one of which is the rating, so a search is one tag (the first word typed).
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

SITE = "https://danbooru.donmai.us"
FETCH = PAGE_SIZE * 2   # many posts are too small, so ask for more than a page
_TAG = re.compile(r"[^\w()'.-]", re.UNICODE)
_QUALIFIER = re.compile(r"_\(.*$")
EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def _tag(query):
    words = (query or "").split()
    return _TAG.sub("", words[0].lower())[:60] if words else ""


def _name(tags):
    """The first name in a space separated tag list, as readable words."""
    first = (tags or "").split(" ")[0]
    return _QUALIFIER.sub("", first).replace("_", " ").strip().title()


class Danbooru:
    api_hosts = ("danbooru.donmai.us",)
    id = "danbooru"
    name = "Danbooru"
    short_name = "Danbooru"
    tagline = "Anime and game illustration searched by tag (try scenery, cat). License not verified: personal use"
    site_url = "https://danbooru.donmai.us/"
    support_url = "https://danbooru.donmai.us/wiki_pages/about"
    support_label = "Visit Danbooru"
    icon_url = "https://danbooru.donmai.us/favicon.ico"
    license_note = "License not verified (personal use)"
    download_hosts = {"cdn.donmai.us"}
    default_query = "scenery"
    has_type_filter = False
    default_shape = "any"
    flagged = True

    def _normalise(self, post):
        width, height = post.get("image_width") or 0, post.get("image_height") or 0
        if (
            post.get("rating") != "g"
            or post.get("is_banned")
            or not post.get("file_url")
            or post.get("file_ext") not in EXTENSIONS
            or width < FLAGGED_MIN_WIDTH
            or not height
            or (post.get("file_size") or 0) > MAX_DOWNLOAD_BYTES
        ):
            return None
        title = _name(post.get("tag_string_character")) or _name(post.get("tag_string_copyright")) or "Artwork"
        return artwork(
            self.id,
            post["id"],
            title,
            _name(post.get("tag_string_artist")),
            (post.get("created_at") or "")[:4],
            post.get("large_file_url") or post.get("file_url"),
            f"{SITE}/posts/{post['id']}",
            self.license_note,
            width=width,
            height=height,
        )

    def search(self, query, page, paintings_only, shape):
        tag = _tag(query) or self.default_query
        posts = http_get(
            f"{SITE}/posts.json", params={"tags": f"rating:g {tag}", "limit": FETCH, "page": page}
        ).json()
        if isinstance(posts, dict):   # an error body, such as a tag limit
            raise DiscoverError(posts.get("message") or "Danbooru could not run that search", 502)
        items = [item for item in map(self._normalise, posts) if item][:PAGE_SIZE]
        items, hidden = apply_shape(items, shape)
        return {"results": items, "page": page, "hidden": hidden, "has_more": len(posts) >= FETCH, "total": None}

    def _post(self, item_id):
        if not str(item_id).isdigit():
            raise DiscoverError("That post could not be found", 404)
        return http_get(f"{SITE}/posts/{item_id}.json").json()

    def get(self, item_id):
        item = self._normalise(self._post(item_id))
        if not item:
            raise DiscoverError("That post is not a large, general-rated picture", 404)
        return item

    def plan(self, item_id, fit):
        post = self._post(item_id)
        item = self._normalise(post)
        if not item:
            raise DiscoverError("That post is not a large, general-rated picture", 404)
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
        match = re.match(r"^/posts/(\d+)$", parts.path)
        return match.group(1) if parts.hostname == "danbooru.donmai.us" and match else None


danbooru = Danbooru()
