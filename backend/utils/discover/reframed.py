"""Reframed Gallery: free art already cropped to 3840x2160 for TVs.

Reframed has no API, so this reads the public pages the way a browser does: the
sitemap for the list of artworks, and the artist / "recent" pages for thumbnails and
file locations. Everything is cached for a day to keep the load on the site small.
"""

import html
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urlsplit

from ..reframed_gallery import extract_cdn_url
from .common import (
    PAGE_SIZE,
    TARGET_RATIO,
    DiscoverError,
    DiskCache,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
    slugify_words,
)

SITE = "https://www.reframed.gallery"
CDN = "https://cdn.reframed.gallery"
CACHE_TTL = 24 * 3600
# Pages that look like artworks (two path segments, or one for artists) but are not.
RESERVED = {
    "collections", "recent", "artists", "verticals", "colors",
    "what-is-reframed", "chrome-extension", "faq", "contact",
}
_RECORD = re.compile(
    r'\{"id":"[0-9a-f-]{36}","r2Key":"([^"]+)","cfImageId":"[^"]*","alt":"([^"]*)",'
    r'"href":"(/[^"]+)","orientation":"(\w+)"'
)
_UNICODE_ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})")
_MAX_ARTIST_PAGES = 8


def _decode(value):
    return _UNICODE_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), value)


def _original_url(r2_key):
    return f"{CDN}/{quote(r2_key, safe='/')}"


def _thumb_url(r2_key):
    return f"{CDN}/cdn-cgi/image/width=480,quality=75,format=auto/{quote(r2_key, safe='/')}"


def _artist_from_key(r2_key):
    name = r2_key.rsplit("/", 1)[-1]
    return name.split(" - ", 1)[0].strip() if " - " in name else None


def _is_artwork_path(path):
    parts = [p for p in path.split("/") if p]
    return len(parts) == 2 and parts[0] not in RESERVED


class Reframed:
    id = "reframed"
    name = "Reframed Gallery"
    short_name = "Reframed Gallery"
    tagline = "Curated fine art, already cropped to 3840x2160 for your TV"
    site_url = SITE
    support_url = "https://ko-fi.com/O5O51FWPUL"
    support_label = "Tip Reframed on Ko-fi"
    icon_url = f"{SITE}/favicon.ico"
    license_note = "Free for TV use, see reframed.gallery"
    download_hosts = {"cdn.reframed.gallery"}
    default_query = ""

    cache = DiskCache("reframed", CACHE_TTL)

    def _memo(self, key, producer):
        return self.cache.memo(key, producer)

    # --- reading the site --------------------------------------------------------

    def _index(self):
        """Every artwork listed in the sitemap, as href plus searchable words."""

        def build():
            text = http_get(f"{SITE}/sitemap.xml").text
            entries = []
            for loc in re.findall(r"<loc>([^<]+)</loc>", text):
                path = urlsplit(loc).path
                if _is_artwork_path(path):
                    entries.append({"href": path, "words": path.replace("/", " ").replace("-", " ")})
            return entries

        return self._memo("index", build)

    def _listing(self, path):
        """Artworks shown on a listing page (artist, collection or recent)."""

        def build():
            text = http_get(SITE + path).text
            text = html.unescape(text).replace("\\/", "/").replace('\\"', '"')
            records, seen = [], set()
            for r2_key, alt, href, orientation in _RECORD.findall(text):
                if href in seen:
                    continue
                seen.add(href)
                r2_key = _decode(r2_key)
                records.append({
                    "href": href,
                    "title": _decode(alt),
                    "artist": _artist_from_key(r2_key),
                    "r2_key": r2_key,
                    "orientation": orientation,
                })
            if not records:
                raise DiscoverError("Reframed's page layout has changed, nothing could be read", 502)
            return records

        return self._memo(f"listing:{path}", build)

    def _page_record(self, href):
        """Fallback for one artwork: read its own page (about 280 KB)."""

        def build():
            text = http_get(SITE + href).text
            cdn_url = extract_cdn_url(text)
            if not cdn_url:
                raise DiscoverError("Could not find the artwork on that Reframed page", 404)
            r2_key = _decode(cdn_url.split(CDN + "/", 1)[1])
            title = re.search(r"<title>([^<]+?)(?: by (.+?))? \| Reframed", html.unescape(text))
            return {
                "href": href,
                "title": title.group(1) if title else href.rsplit("/", 1)[-1].replace("-", " ").title(),
                "artist": (title.group(2) if title and title.group(2) else _artist_from_key(r2_key)),
                "r2_key": r2_key,
                "orientation": "landscape",
            }

        return self._memo(f"page:{href}", build)

    def _find(self, href):
        artist = href.strip("/").split("/")[0]
        try:
            for record in self._listing(f"/{artist}"):
                if record["href"] == href:
                    return record
        except DiscoverError:
            pass
        return self._page_record(href)

    def _normalise(self, record):
        portrait = record["orientation"] != "landscape"
        return artwork(
            self.id,
            record["href"].strip("/"),
            record["title"],
            record["artist"],
            "",
            _thumb_url(record["r2_key"]),
            SITE + record["href"],
            self.license_note,
            aspect=round(9 / 16, 3) if portrait else round(TARGET_RATIO, 3),
            tv_ready=not portrait,
        ) | {"orientation": record["orientation"]}

    # --- Source interface --------------------------------------------------------

    def search(self, query, page, paintings_only, shape):
        words = slugify_words(query)
        if not words:
            records = self._listing("/recent")
            total = len(records)
            window = records[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
        else:
            matches = [e for e in self._index() if all(w in e["words"] for w in words)]
            matches.sort(key=lambda e: 0 if all(w in e["href"].split("/")[1].replace("-", " ") for w in words) else 1)
            total = len(matches)
            chosen = matches[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
            artists = list(dict.fromkeys(e["href"].split("/")[1] for e in chosen))[:_MAX_ARTIST_PAGES]

            def load(artist):
                try:
                    return self._listing(f"/{artist}")
                except DiscoverError:
                    return []

            with ThreadPoolExecutor(max_workers=4) as pool:
                by_href = {r["href"]: r for records in pool.map(load, artists) for r in records}
            window = [by_href[e["href"]] for e in chosen if e["href"] in by_href]

        items, hidden = apply_shape([self._normalise(r) for r in window], shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": page * PAGE_SIZE < total,
            "total": total,
        }

    def get(self, item_id):
        return self._normalise(self._find("/" + item_id.strip("/")))

    def plan(self, item_id, fit):
        record = self._find("/" + item_id.strip("/"))
        return DownloadPlan(
            url=_original_url(record["r2_key"]),
            title=record["title"],
            artist=record["artist"],
            source=self.id,
            page_url=SITE + record["href"],
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if parts.hostname not in ("www.reframed.gallery", "reframed.gallery"):
            return None
        return parts.path.strip("/") if _is_artwork_path(parts.path) else None


reframed = Reframed()
