"""Public-domain paintings from Wikimedia Commons, for museums with no API of their own.

Commons holds high-resolution scans of paintings from the Louvre and hundreds of other
museums (the Google Art Project among them), and an API with no key. Two things need care:
anyone can upload, so only files whose own license says public domain or CC0 are offered;
and some originals are enormous (one was 1.3 GB), so downloads ask Commons for a copy
scaled to the panel's width instead of the original.
"""

import html
import re
from urllib.parse import quote, urlsplit, unquote

from .seasons import seasonal_word
from .common import (
    PAGE_SIZE,
    TARGET_WIDTH,
    DiscoverError,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

API = "https://commons.wikimedia.org/w/api.php"
MIN_WIDTH = 2500
MAX_PIXELS = 100_000_000   # beyond this Commons will not make a scaled copy
OPEN_LICENSE = re.compile(r"^(public domain|cc0|pd\b|pdm|no restrictions)", re.IGNORECASE)
_METADATA = "LicenseShortName|Artist|ObjectName|DateTimeOriginal"


def _text(value):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value or "")).split())


def _clean_date(value):
    """Keep the date and drop wiki markup that follows it, such as "1872 date QS:P571,..."."""
    return re.split(r"\s*(?:date\s+)?QS:", _text(value))[0].strip()[:40]


def _usable_title(value):
    """Some uploads leave wiki markup (for example "QS:P1476,...") in the title field."""
    text = _text(value)
    return text if text and len(text) <= 150 and "QS:" not in text and "{{" not in text else ""


_LANGUAGE_LABEL = re.compile(r"^[A-Z][a-zé]+:\s+")
_NEXT_LANGUAGE = re.compile(r"\s+[A-Z][a-zé]+:\s+.*$")


def _tidy_title(title, artist):
    """Drop a leading "French:" style label, other-language repeats, and an "Artist - " prefix."""
    title = _NEXT_LANGUAGE.sub("", _LANGUAGE_LABEL.sub("", title)).strip()
    if artist and title.lower().startswith(artist.lower() + " - "):
        title = title[len(artist) + 3:].strip()
    return title or title


def _tidy_artist(text):
    """Drop placeholders ("Unknown author") and a name the uploader's template printed twice."""
    words = text.split()
    half = len(words) // 2
    if half and len(words) % 2 == 0 and words[:half] == words[half:]:
        text = " ".join(words[:half])
    return "" if re.match(r"^(unknown|anonymous|not specified|n/a)\b", text, re.IGNORECASE) else text


def _looks_like_artist(text):
    return (
        2 <= len(text) <= 60
        and not re.search(r"[0-9()\[\]]", text)
        and not re.search(r"\b(louvre|musée|museum|museo|rf)\b", text, re.IGNORECASE)
    )


def _title_from_file(file_title):
    stem = re.sub(r"\.[A-Za-z0-9]{2,4}$", "", file_title.removeprefix("File:"))
    stem = re.sub(r"\s*-\s*Google Art Project( \(\d+\))?$", "", stem)
    return stem.replace("_", " ").strip()


class CommonsCollection:
    api_hosts = ("commons.wikimedia.org",)
    support_url = "https://donate.wikimedia.org/"
    support_label = "Support Wikimedia"
    support_name = "Wikimedia Commons"
    support_icon_url = "https://commons.wikimedia.org/static/favicon/commons.ico"
    license_note = "Public domain"
    download_hosts = {"upload.wikimedia.org", "thumb.wikimedia.org"}
    has_type_filter = False
    # Only one collection claims pasted Commons links, so a link has one obvious home.
    accepts_links = False

    def __init__(
        self,
        id,
        name,
        short_name,
        tagline,
        icon_url,
        category=None,
        keywords="",
        default_query=None,
        min_width=MIN_WIDTH,
        default_shape=None,
        accepts_links=False,
        trust_artist_field=True,
    ):
        """A slice of Commons: everything under a category, or files matching some keywords.

        ``keywords`` are always added to the search (a "postcard" collection searches for
        "<what you typed> postcard"). ``default_query`` may be a function, so a collection can
        suggest something fitting for the time of year.
        """
        self.id = id
        self.name = name
        self.short_name = short_name
        self.tagline = tagline
        self.category = category
        self.keywords = keywords
        self.icon_url = icon_url
        self.min_width = min_width
        self.default_shape = default_shape
        if default_query is not None:
            self._default_query = default_query
        if category:
            self.site_url = f"https://commons.wikimedia.org/wiki/Category:{category.replace(' ', '_')}"
        else:
            self.site_url = f"https://commons.wikimedia.org/w/index.php?ns6=1&search={quote(keywords)}"
        self.accepts_links = accepts_links
        self.trust_artist_field = trust_artist_field

    _default_query = "landscape"

    @property
    def default_query(self):
        return self._default_query() if callable(self._default_query) else self._default_query

    # --- talking to Commons -----------------------------------------------------

    def _request(self, extra, thumb_width):
        params = {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": thumb_width,
            "iiextmetadatafilter": _METADATA,
            **extra,
        }
        return http_get(API, params=params).json()

    def _normalise(self, page):
        info = (page.get("imageinfo") or [None])[0]
        if not info:
            return None
        meta = {key: value.get("value", "") for key, value in (info.get("extmetadata") or {}).items()}
        license_name = _text(meta.get("LicenseShortName"))
        width, height = info.get("width") or 0, info.get("height") or 0
        if (
            not OPEN_LICENSE.match(license_name)
            or info.get("mime") not in ("image/jpeg", "image/png")
            or not width
            or width * height > MAX_PIXELS
        ):
            return None
        file_title = page.get("title", "")
        from_file = _title_from_file(file_title)
        parts = [part.strip() for part in from_file.split(" - ")]
        if len(parts) >= 2 and _looks_like_artist(parts[0]):
            # Paintings are conventionally named "Artist - Title", which is more reliable
            # than the metadata: on many files the "artist" is whoever photographed it.
            artist = parts[0]
            title = _tidy_title(_usable_title(meta.get("ObjectName")), artist) or " - ".join(parts[1:])
        else:
            artist = _tidy_artist(_text(meta.get("Artist"))) if self.trust_artist_field else ""
            title = _tidy_title(_usable_title(meta.get("ObjectName")) or from_file, "") or from_file
        return artwork(
            self.id,
            page["pageid"],
            title,
            artist,
            _clean_date(meta.get("DateTimeOriginal")),
            info.get("thumburl") or info.get("url"),
            info.get("descriptionurl"),
            license_name,
            width=width,
            height=height,
        )

    @staticmethod
    def _words(query):
        return " ".join(re.sub(r'["\\():]', " ", query or "").split())[:100]

    # --- Source interface -------------------------------------------------------

    def search(self, query, page, paintings_only, shape):
        words = self._words(query) or self.default_query
        scope = f'deepcategory:"{self.category}" ' if self.category else ""
        search = f"{scope}{words} {self.keywords} filew:>{self.min_width} filetype:bitmap"
        data = self._request(
            {
                "generator": "search",
                "gsrnamespace": 6,
                "gsrlimit": PAGE_SIZE,
                "gsroffset": (page - 1) * PAGE_SIZE,
                "gsrsearch": search,
            },
            480,
        )
        pages = sorted(((data.get("query") or {}).get("pages") or {}).values(), key=lambda p: p.get("index", 0))
        items = [item for item in map(self._normalise, pages) if item]
        items, hidden = apply_shape(items, shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": "continue" in data,
            "total": None,
        }

    def _page(self, item_id, thumb_width):
        key = {"pageids": item_id} if str(item_id).isdigit() else {"titles": item_id}
        pages = ((self._request(key, thumb_width).get("query") or {}).get("pages") or {}).values()
        page = next((p for p in pages if "missing" not in p and p.get("imageinfo")), None)
        if page is None:
            raise DiscoverError("That file could not be found on Wikimedia Commons", 404)
        return page

    def get(self, item_id):
        item = self._normalise(self._page(item_id, 480))
        if not item:
            raise DiscoverError("That file is not a public-domain image we can use", 404)
        return item

    def plan(self, item_id, fit):
        page = self._page(item_id, TARGET_WIDTH)
        item = self._normalise(page)
        if not item:
            raise DiscoverError("That file is not a public-domain image we can use", 404)
        info = page["imageinfo"][0]
        scaled = info["width"] > TARGET_WIDTH and info.get("thumburl")
        width = TARGET_WIDTH if scaled else info["width"]
        return DownloadPlan(
            url=info["thumburl"] if scaled else info["url"],
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=info.get("descriptionurl"),
            width=width,
            height=round(info["height"] * width / info["width"]),
            license=item["license"],
        )

    def from_url(self, url):
        parts = urlsplit(url)
        if not self.accepts_links or parts.hostname != "commons.wikimedia.org":
            return None
        path = unquote(parts.path)
        return path.removeprefix("/wiki/") if path.startswith("/wiki/File:") else None


louvre = CommonsCollection(
    id="louvre",
    name="The Louvre",
    short_name="the Louvre",
    tagline="Louvre paintings in the public domain, high-resolution scans via Wikimedia Commons",
    icon_url="https://www.louvre.fr/favicon.ico",
    category="Paintings in the Louvre",
    # In this category the "artist" field is often the photographer of the file.
    trust_artist_field=False,
)

world_museums = CommonsCollection(
    id="worldmuseums",
    name="Museums of the world",
    short_name="Wikimedia Commons",
    tagline="High-resolution scans from hundreds of museums (Google Art Project), via Wikimedia Commons",
    icon_url="https://commons.wikimedia.org/static/favicon/commons.ico",
    category="Google Art Project works by artist",
    accepts_links=True,
)

COMMONS_ICON = "https://commons.wikimedia.org/static/favicon/commons.ico"

# Fun collections: no category covers them, so they search by keyword. Only files whose
# own license says public domain or CC0 get through, which in practice means old prints.
holidays = CommonsCollection(
    id="holidays",
    name="Holiday postcards",
    short_name="Wikimedia Commons",
    tagline="Vintage Halloween, Christmas, Easter and other holiday postcards, via Wikimedia Commons",
    icon_url=COMMONS_ICON,
    keywords="postcard",
    default_query=seasonal_word,
    min_width=1500,
    default_shape="any",   # cards and posters are mostly upright: do not hide them by default
)

posters = CommonsCollection(
    id="posters",
    name="Vintage posters",
    short_name="Wikimedia Commons",
    tagline="Travel posters, advertising and Art Nouveau prints in the public domain, via Wikimedia Commons",
    icon_url=COMMONS_ICON,
    keywords="poster",
    default_query="travel",
    min_width=2000,
    default_shape="any",
)
