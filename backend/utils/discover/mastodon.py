"""Mastodon art hashtags: what artists are posting right now. NOT license-verified.

Artists on Mastodon post their work under tags such as #mastoart, #digitalart and
#pixelart. This reads the public tag timeline of one big server, with no key or account.
Every post stays the artist's own work and carries no reusable license, so this is a
personal-use source: flagged in the app, off until switched on in Settings, and never in the
daily highlights. Posts marked sensitive, and anything without a picture, are skipped.
Each import credits the artist and links to the post.

What is typed is the tag (spaces and # are dropped), because Mastodon cannot search free
text without an account. Leave it empty for #mastoart.
"""

import re
from urllib.parse import urlsplit

from .common import FLAGGED_MIN_WIDTH, PAGE_SIZE, DiscoverError, DiskCache, DownloadPlan, apply_shape, artwork, http_get

INSTANCE = "https://mastodon.social"
MIN_WIDTH = FLAGGED_MIN_WIDTH
_TAG = re.compile(r"[^\w]", re.UNICODE)
_HTML = re.compile(r"<[^>]+>")
_STATUS_URL = re.compile(r"^/@[^/]+/(\d+)$")
# Pagination is by the id of the last post seen, kept longer than the search cache so "load more" can continue.
_cursors = DiskCache("mastodon_cursors", 48 * 3600)


def _tag(query):
    return _TAG.sub("", (query or "").split()[0] if (query or "").split() else "")[:60]


def _text(html_text):
    return " ".join(_HTML.sub(" ", html_text or "").split())


class Mastodon:
    api_hosts = ("mastodon.social",)
    id = "mastodon"
    name = "Mastodon art tags"
    short_name = "Mastodon"
    tagline = "Fresh work from artists, by hashtag (try mastoart, pixelart). License not verified: personal use"
    site_url = "https://mastodon.social/tags/mastoart"
    support_url = "https://joinmastodon.org/"
    support_label = "Visit Mastodon"
    icon_url = "https://mastodon.social/favicon.ico"
    license_note = "License not verified (personal use)"
    download_hosts = {"files.mastodon.social"}
    default_query = "mastoart"
    has_type_filter = False
    default_shape = "any"
    flagged = True

    def _timeline(self, tag, max_id=None):
        params = {"limit": 40, "only_media": "true"}
        if max_id:
            params["max_id"] = max_id
        return http_get(f"{INSTANCE}/api/v1/timelines/tag/{tag}", params=params).json()

    def _normalise(self, status):
        """One item per post: the first picture of a post that is not marked sensitive."""
        if status.get("sensitive") or status.get("reblog") or not status.get("id"):
            return None
        account = status.get("account") or {}
        for media in status.get("media_attachments") or []:
            original = (media.get("meta") or {}).get("original") or {}
            width, height = original.get("width") or 0, original.get("height") or 0
            if media.get("type") != "image" or width < MIN_WIDTH or not height or not media.get("url"):
                continue
            host = urlsplit(media["url"]).hostname
            if host not in self.download_hosts:
                continue
            tags = [t.get("name") for t in status.get("tags") or [] if t.get("name")]
            description = _text(media.get("description")) or _text(status.get("content"))
            title = (description[:80].rsplit(" ", 1)[0] if len(description) > 80 else description) or (
                "#" + tags[0] if tags else "Untitled"
            )
            return artwork(
                self.id,
                f"{status['id']}:{media['id']}",
                title,
                account.get("display_name") or account.get("acct"),
                (status.get("created_at") or "")[:4],
                media.get("preview_url") or media["url"],
                status.get("url"),
                self.license_note,
                width=width,
                height=height,
            )
        return None

    def search(self, query, page, paintings_only, shape):
        tag = _tag(query) or self.default_query
        # Mastodon pages by post id, so page N continues from where page N-1 stopped.
        max_id = None if page == 1 else _cursors.get(f"{tag}|{page}")
        if page > 1 and not max_id:
            return {"results": [], "page": page, "hidden": 0, "has_more": False, "total": None}
        posts = self._timeline(tag, max_id)
        if posts:
            _cursors.put(f"{tag}|{page + 1}", posts[-1]["id"])
        items = [item for item in map(self._normalise, posts) if item][:PAGE_SIZE]
        items, hidden = apply_shape(items, shape)
        return {"results": items, "page": page, "hidden": hidden, "has_more": len(posts) >= 40, "total": None}

    def _split(self, item_id):
        status_id, _, media_id = str(item_id).partition(":")
        if not status_id.isdigit():
            raise DiscoverError("That post could not be found", 404)
        return status_id, media_id

    def _status(self, item_id):
        status_id, media_id = self._split(item_id)
        status = http_get(f"{INSTANCE}/api/v1/statuses/{status_id}").json()
        if media_id:
            status["media_attachments"] = [m for m in status.get("media_attachments") or [] if str(m.get("id")) == media_id]
        return status

    def get(self, item_id):
        item = self._normalise(self._status(item_id))
        if not item:
            raise DiscoverError("That post has no usable picture", 404)
        return item

    def plan(self, item_id, fit):
        status = self._status(item_id)
        item = self._normalise(status)
        if not item:
            raise DiscoverError("That post has no usable picture", 404)
        media = status["media_attachments"][0]
        original = (media.get("meta") or {}).get("original") or {}
        return DownloadPlan(
            url=media["url"],
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=item["page_url"],
            width=original.get("width"),
            height=original.get("height"),
            license=self.license_note,
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname != "mastodon.social":
            return None
        match = _STATUS_URL.match(parts.path)
        return match.group(1) if match else None


mastodon = Mastodon()
