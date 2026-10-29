"""Bing's daily wallpapers: some of the world's best landscape photos, in 4K. NOT license-verified.

Bing's home page shows a new photograph each day, a different one for each country, and
serves each as a 3840 x 2160 file. The photographers keep their copyright and Microsoft
grants no reuse license, so this is a personal-use source: flagged in the app, off until
switched on in Settings, and never in the daily highlights. Bing only lists the last couple
of weeks per country, so the source gathers several countries' lists (kept for six hours) and
searches the title and credit text of those. Leave the search empty to see them all.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

from .common import PAGE_SIZE, DiscoverError, DiskCache, DownloadPlan, apply_shape, artwork, http_get

HOST = "https://www.bing.com"
MARKETS = ("en-US", "en-GB", "de-DE", "fr-FR", "ja-JP", "en-AU", "en-CA", "en-IN", "it-IT", "es-ES", "pt-BR", "zh-CN")
_cache = DiskCache("bing_wallpapers", 6 * 3600)
_CREDIT = re.compile(r"^(.*?)\s*\(©\s*(.*?)\)\s*$")
_ID = re.compile(r"^OHR\.[\w-]+$")


def _fetch_market(market):
    try:
        data = http_get(
            f"{HOST}/HPImageArchive.aspx", params={"format": "js", "idx": 0, "n": 8, "mkt": market}
        ).json()
    except DiscoverError:
        return []
    return data.get("images") or []


def _all_wallpapers():
    """Every wallpaper Bing lists across the markets, once each (a photo repeats between countries)."""

    def gather():
        with ThreadPoolExecutor(max_workers=4) as pool:
            batches = list(pool.map(_fetch_market, MARKETS))
        seen, found = set(), []
        for image in (image for batch in batches for image in batch):
            base = (image.get("urlbase") or "").removeprefix("/th?id=")
            name = base.split("_", 1)[0]
            if _ID.match(base) and name not in seen:
                seen.add(name)
                found.append(
                    {
                        "id": base,
                        "title": image.get("title") or "",
                        "copyright": image.get("copyright") or "",
                        "link": image.get("copyrightlink") or "",
                        "date": (image.get("startdate") or "")[:4],
                    }
                )
        if not found:
            raise DiscoverError("Bing did not list any wallpapers", 502)
        return found

    return _cache.memo("all", gather)


class Bing:
    api_hosts = ("www.bing.com",)
    id = "bing"
    name = "Bing daily wallpapers"
    short_name = "Bing"
    tagline = "Each day's world photograph from Bing, in 4K. License not verified: personal use"
    site_url = "https://www.bing.com/"
    support_url = "https://www.bing.com/"
    support_label = "Visit Bing"
    icon_url = "https://www.bing.com/favicon.ico"
    license_note = "License not verified (personal use)"
    download_hosts = {"www.bing.com"}
    default_query = ""
    has_type_filter = False
    default_shape = "any"
    flagged = True

    def _artwork(self, entry):
        match = _CREDIT.match(entry["copyright"])
        description, photographer = (match.group(1), match.group(2)) if match else (entry["copyright"], "")
        return artwork(
            self.id,
            entry["id"],
            entry["title"] or description,
            photographer,
            entry["date"],
            f"{HOST}/th?id={quote(entry['id'])}_800x480.jpg",
            entry["link"] or HOST,
            self.license_note,
            width=3840,
            height=2160,
        )

    def search(self, query, page, paintings_only, shape):
        words = [w.lower() for w in (query or "").split()[:6]]
        matching = [
            entry
            for entry in _all_wallpapers()
            if all(w in f"{entry['title']} {entry['copyright']}".lower() for w in words)
        ]
        start = (page - 1) * PAGE_SIZE
        items, hidden = apply_shape([self._artwork(e) for e in matching[start : start + PAGE_SIZE]], shape)
        return {
            "results": items,
            "page": page,
            "hidden": hidden,
            "has_more": start + PAGE_SIZE < len(matching),
            "total": len(matching),
        }

    def _entry(self, item_id):
        entry = next((e for e in _all_wallpapers() if e["id"] == item_id), None)
        if not entry:
            raise DiscoverError("That wallpaper is no longer listed by Bing", 404)
        return entry

    def get(self, item_id):
        return self._artwork(self._entry(item_id))

    def plan(self, item_id, fit):
        item = self._artwork(self._entry(item_id))
        return DownloadPlan(
            url=f"{HOST}/th?id={quote(item_id)}_UHD.jpg",
            title=item["title"],
            artist=item["artist"],
            source=self.id,
            page_url=item["page_url"],
            width=3840,
            height=2160,
            license=self.license_note,
        )

    def from_url(self, url):
        return None


bing = Bing()
