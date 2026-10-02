"""Shared pieces for the Discover sources: HTTP, caching and artwork shape."""

import hashlib
import json
import os
import re
import threading
import time
from urllib.parse import urlsplit

import requests

from .errors import DiscoverError  # noqa: F401  (re-exported)
from .limits import Limiter

USER_AGENT = "frametv-art-gallery/discover (+https://github.com/mrtncode/frametv-art-gallery)"

TARGET_WIDTH = 3840
TARGET_HEIGHT = 2160
TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT

PAGE_SIZE = 24
# Shape filters, from loosest to strictest. Aspect is width / height.
SHAPES = ("any", "landscape", "wide", "fits")
DEFAULT_SHAPE = "wide"
LANDSCAPE_MIN_ASPECT = 1.2   # clearly wider than tall
WIDE_MIN_ASPECT = 1.6        # a 16:9 crop loses roughly a tenth or less
FITS_MAX_CROP_LOSS = 0.03    # 16:9 within a hair: no matte, nothing cropped

CONNECT_TIMEOUT = 10
READ_TIMEOUT = 30
MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024


def http_get(url, *, stream=False, params=None, headers=None, allowed_hosts=None):
    """GET with the project user agent and uniform error handling."""
    merged = {"User-Agent": USER_AGENT}
    if headers:
        merged.update(headers)
    host = urlsplit(url).hostname
    Limiter.acquire(host)
    try:
        response = requests.get(
            url,
            params=params,
            headers=merged,
            stream=stream,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
    except requests.RequestException as exc:
        raise DiscoverError(f"Could not reach {urlsplit(url).hostname}: {exc}", 502) from exc
    if allowed_hosts is not None and urlsplit(response.url).hostname not in allowed_hosts:
        response.close()
        raise DiscoverError("The download was redirected to an unexpected host", 502)
    if response.status_code == 404:
        response.close()
        raise DiscoverError("That artwork could not be found", 404)
    if response.status_code in (403, 429):
        response.close()
        Limiter.trip(host)
        raise DiscoverError(
            f"{host} is limiting requests right now, try again in a few minutes", 429, retry_after=300
        )
    if not response.ok:
        response.close()
        raise DiscoverError(f"The source answered with HTTP {response.status_code}", 502)
    Limiter.success(host)
    return response


def http_post_json(url, payload, headers=None):
    host = urlsplit(url).hostname
    Limiter.acquire(host)
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"User-Agent": USER_AGENT, **(headers or {})},
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
    except requests.RequestException as exc:
        raise DiscoverError(f"Could not reach {urlsplit(url).hostname}: {exc}", 502) from exc
    if response.status_code in (403, 429):
        Limiter.trip(host)
        raise DiscoverError(
            f"{host} is limiting requests right now, try again in a few minutes", 429, retry_after=300
        )
    if not response.ok:
        raise DiscoverError(f"The source answered with HTTP {response.status_code}", 502)
    Limiter.success(host)
    return response.json()


def crop_loss(aspect):
    """Share (0-1) of the picture thrown away by a centred 16:9 crop."""
    if not aspect:
        return None
    if aspect >= TARGET_RATIO:
        return round(1 - TARGET_RATIO / aspect, 3)
    return round(1 - aspect / TARGET_RATIO, 3)


def artwork(
    source,
    item_id,
    title,
    artist,
    date,
    thumb_url,
    page_url,
    license_note,
    width=None,
    height=None,
    aspect=None,
    tv_ready=False,
):
    """The one shape every source returns to the front end."""
    if width and height:
        aspect = round(width / height, 3)
    return {
        "source": source,
        "id": str(item_id),
        "title": (title or "Untitled").strip(),
        "artist": (artist or "Unknown artist").strip(),
        "date": (date or "").strip(),
        "thumb_url": thumb_url,
        "page_url": page_url,
        "license": license_note,
        "width": width,
        "height": height,
        "aspect": aspect,
        "crop_loss": crop_loss(aspect),
        "tv_ready": tv_ready,
    }


def matches_shape(item, shape):
    """Whether a work passes a shape filter.

    Landscape and wide give works of unknown shape the benefit of the doubt, as the Met
    does not measure its images. "fits" promises no matte, so it needs a known shape.
    """
    if shape == "any":
        return True
    if shape == "fits":
        loss = item.get("crop_loss")
        return loss is not None and loss <= FITS_MAX_CROP_LOSS
    aspect = item.get("aspect")
    if aspect is None:
        return True
    return aspect >= (LANDSCAPE_MIN_ASPECT if shape == "landscape" else WIDE_MIN_ASPECT)


def matches_sharp(item):
    """Whether the picture will be sharp on a 4K panel after being cropped to fill it.

    Needs a known size, so works the source does not measure (the Met's) never pass.
    """
    if item.get("tv_ready"):
        return True
    width, height = item.get("width"), item.get("height")
    if not width or not height:
        return False
    crop_width = height * TARGET_RATIO if width / height >= TARGET_RATIO else width
    return crop_width >= TARGET_WIDTH


def apply_shape(items, shape):
    """Drop works that do not match the shape filter; say how many were hidden."""
    kept = [item for item in items if matches_shape(item, shape)]
    return kept, len(items) - len(kept)


class DownloadPlan:
    """Everything the importer needs once a source has resolved an artwork."""

    def __init__(self, url, title, artist, source, page_url, width=None, height=None,
                 server_cropped=False, headers=None, license=None):
        self.url = url
        self.title = title
        self.artist = artist
        self.source = source
        self.page_url = page_url
        self.width = width
        self.height = height
        self.server_cropped = server_cropped
        self.headers = headers or {}
        self.license = license


def slugify_words(text):
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split()


class DiskCache:
    """JSON cache on disk, shared by every gunicorn worker.

    Without a directory (as in tests) it quietly does nothing, so callers always
    work and just fetch again.
    """

    directory = None

    def __init__(self, namespace, ttl):
        self.namespace = namespace
        self.ttl = ttl

    def _path(self, key):
        if not self.directory:
            return None
        digest = hashlib.sha256(key.encode()).hexdigest()[:24]
        return os.path.join(self.directory, f"{self.namespace}_{digest}.json")

    def get(self, key):
        path = self._path(key)
        if not path:
            return None
        try:
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, ValueError):
            return None
        if time.time() - payload.get("fetched_at", 0) > self.ttl:
            return None
        return payload.get("value")

    def put(self, key, value):
        path = self._path(key)
        if not path:
            return
        try:
            os.makedirs(self.directory, exist_ok=True)
            temp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
            with open(temp, "w", encoding="utf-8") as handle:
                json.dump({"fetched_at": time.time(), "value": value}, handle)
            os.replace(temp, path)
        except OSError:
            pass

    def memo(self, key, producer):
        hit = self.get(key)
        if hit is not None:
            return hit
        value = producer()
        self.put(key, value)
        return value


def prune_old_files(directory, max_age_seconds):
    """Delete cached files nobody has refreshed for a while; called once at startup."""
    cutoff = time.time() - max_age_seconds
    for root, _dirs, names in os.walk(directory):
        for name in names:
            path = os.path.join(root, name)
            try:
                if os.path.getmtime(path) < cutoff:
                    os.remove(path)
            except OSError:
                pass
