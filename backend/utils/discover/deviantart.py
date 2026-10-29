"""DeviantArt: the largest pool of independent artists. NOT license-verified.

Every deviation stays the artist's own work, and DeviantArt records no reusable license, so
this is a personal-use source: flagged in the app, off until switched on in Settings, never
in the daily highlights. Only mature-content-free deviations the artist has marked
downloadable are offered, and every import credits the artist and links back to the page.

Needs a DeviantArt app's client ID and secret, entered in Settings. The app signs in with
its own credentials, so no one has to log in to DeviantArt.
"""

import threading
import time
import requests

from . import credentials
from .common import (
    CONNECT_TIMEOUT,
    FLAGGED_MIN_WIDTH,
    PAGE_SIZE,
    READ_TIMEOUT,
    USER_AGENT,
    DiscoverError,
    DownloadPlan,
    HostSuffixes,
    apply_shape,
    artwork,
    http_get,
)
from .limits import Limiter

API = "https://www.deviantart.com/api/v1/oauth2"
TOKEN_URL = "https://www.deviantart.com/oauth2/token"

_token = {"value": None, "expires": 0.0, "for": ""}
_token_lock = threading.Lock()


def _access_token():
    """A token for public content, kept until shortly before it expires."""
    with _token_lock:
        client_id, secret = credentials.get("deviantart", "client_id"), credentials.get("deviantart", "client_secret")
        if not client_id or not secret:
            raise DiscoverError("Add your DeviantArt app credentials in Settings to use this source", 503)
        # A token made for other credentials is no good once they change.
        if _token["value"] and _token["for"] == client_id + secret and time.time() < _token["expires"]:
            return _token["value"]
        Limiter.acquire("www.deviantart.com")
        try:
            response = requests.post(
                TOKEN_URL,
                data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret},
                headers={"User-Agent": USER_AGENT},
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            )
        except requests.RequestException as exc:
            raise DiscoverError(f"Could not reach DeviantArt: {exc}", 502) from exc
        data = response.json() if response.ok else {}
        if not data.get("access_token"):
            raise DiscoverError("DeviantArt did not accept the app credentials", 502)
        _token["value"] = data["access_token"]
        _token["for"] = client_id + secret
        _token["expires"] = time.time() + max(60, int(data.get("expires_in", 3600)) - 120)
        return _token["value"]


class DeviantArt:
    api_hosts = ("www.deviantart.com",)
    id = "deviantart"
    name = "DeviantArt"
    short_name = "DeviantArt"
    tagline = "Independent artists, searched by tag or title. License not verified: personal use"
    site_url = "https://www.deviantart.com/"
    support_url = "https://www.deviantart.com/"
    support_label = "Visit DeviantArt"
    icon_url = "https://www.deviantart.com/favicon.ico"
    license_note = "License not verified (personal use)"
    download_hosts = HostSuffixes(".wixmp.com", ".deviantart.com", ".deviantart.net")
    default_query = "digital art"
    has_type_filter = False
    default_shape = "any"
    flagged = True
    service = "deviantart"

    def _get(self, path, **params):
        return http_get(f"{API}/{path}", params={"access_token": _access_token(), **params}).json()

    def _normalise(self, deviation):
        content = deviation.get("content") or {}
        preview = deviation.get("preview") or {}
        thumbs = deviation.get("thumbs") or []
        if (
            not deviation.get("deviationid")
            or not deviation.get("is_downloadable")
            or deviation.get("is_mature")
            or not content.get("src")
            or (content.get("width") or 0) < FLAGGED_MIN_WIDTH
        ):
            return None
        published = deviation.get("published_time")
        year = time.strftime("%Y", time.gmtime(int(published))) if str(published or "").isdigit() else ""
        return artwork(
            self.id,
            deviation["deviationid"],
            deviation.get("title"),
            (deviation.get("author") or {}).get("username"),
            year,
            (thumbs[-1].get("src") if thumbs else None) or preview.get("src") or content["src"],
            deviation.get("url"),
            self.license_note,
            width=content.get("width"),
            height=content.get("height"),
        )

    def search(self, query, page, paintings_only, shape):
        text = " ".join((query or "").split())[:100] or self.default_query
        offset = (page - 1) * PAGE_SIZE
        data = self._get(
            "browse/popular",
            q=text,
            timerange="alltime",
            limit=PAGE_SIZE,
            offset=offset,
            mature_content="false",
        )
        items = [item for item in map(self._normalise, data.get("results") or []) if item]
        items, hidden = apply_shape(items, shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": bool(data.get("has_more")),
            "total": None,
        }

    def _deviation(self, item_id):
        deviation = self._get(f"deviation/{item_id}")
        if not deviation.get("deviationid"):
            raise DiscoverError("That deviation could not be found", 404)
        return deviation

    def get(self, item_id):
        item = self._normalise(self._deviation(item_id))
        if not item:
            raise DiscoverError("The artist has not made that deviation downloadable", 404)
        return item

    def plan(self, item_id, fit):
        deviation = self._deviation(item_id)
        item = self._normalise(deviation)
        if not item:
            raise DiscoverError("The artist has not made that deviation downloadable", 404)
        original = self._get(f"deviation/download/{item_id}")
        if not original.get("src"):
            raise DiscoverError("DeviantArt did not provide the original file", 502)
        return DownloadPlan(
            url=original["src"],
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=item["page_url"],
            width=original.get("width") or item["width"],
            height=original.get("height") or item["height"],
            license=self.license_note,
        )

    def from_url(self, url):
        # Page addresses carry a number, but the API looks deviations up by a different id.
        return None


deviantart = DeviantArt()
