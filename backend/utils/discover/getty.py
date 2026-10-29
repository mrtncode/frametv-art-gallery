"""The J. Paul Getty Museum: CC0 paintings, drawings and photographs, no key.

The museum's open data has no text search, but it does have a SPARQL endpoint, so one query
finds the works whose title contains every word typed. Only objects the museum marks CC0
and that have an image come back. Pictures are served by the museum's IIIF image server,
which can scale them, so a download asks for no more than the TV needs. The size of each
picture is read from the image server (and remembered for a month), which is how the shape
and sharpness filters work for this source.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from .common import (
    PAGE_SIZE,
    TARGET_WIDTH,
    DiscoverError,
    DiskCache,
    DownloadPlan,
    apply_shape,
    artwork,
    http_get,
)

SPARQL = "https://data.getty.edu/museum/collection/sparql"
IIIF = "https://media.getty.edu/iiif/image"
CC0 = "http://creativecommons.org/publicdomain/zero/1.0/"
PAINTING = "http://vocab.getty.edu/aat/300033618"
OBJECT = "https://data.getty.edu/museum/collection/object/"
_ID = re.compile(r"^[0-9a-f-]{36}$")
_ACCESSION = re.compile(r"\s*\([0-9A-Z.]+\.[A-Z]{2}\.[0-9A-Za-z.-]+\)\s*$")
_IMAGE_ID = re.compile(r"/iiif/image/([0-9a-f-]{36})/")
DIMENSIONS_TTL = 30 * 24 * 3600
_dimensions = DiskCache("getty_dimensions", DIMENSIONS_TTL)

_PREFIXES = (
    "PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/> "
    "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> "
)


def _words(query):
    return re.sub(r"[^\w\s'-]", " ", query or "").split()[:6]


def _literal(word):
    return word.lower().replace("\\", " ").replace('"', " ")


class Getty:
    api_hosts = ("data.getty.edu", "media.getty.edu")
    id = "getty"
    name = "The Getty"
    short_name = "the Getty"
    tagline = "CC0 paintings, drawings and photographs from the J. Paul Getty Museum"
    site_url = "https://www.getty.edu/art/collection/"
    support_url = "https://www.getty.edu/museum/support/"
    support_label = "Support the Getty"
    icon_url = "https://www.getty.edu/favicon.ico"
    license_note = "Public domain (CC0)"
    download_hosts = {"media.getty.edu"}
    default_query = "landscape"
    default_shape = "any"

    # --- talking to the Getty -----------------------------------------------------

    def _select(self, where, tail=""):
        query = (
            _PREFIXES
            + "SELECT ?o (SAMPLE(?label) AS ?title) (SAMPLE(?img) AS ?image) (SAMPLE(?artist) AS ?maker) "
            + "WHERE { ?o a crm:E22_Human-Made_Object ; rdfs:label ?label ; "
            + f"crm:P138i_has_representation ?img ; crm:P67i_is_referred_to_by <{CC0}> . "
            + where
            + " OPTIONAL { ?o crm:P108i_was_produced_by ?made . ?made crm:P14_carried_out_by ?who . ?who rdfs:label ?artist } "
            + "} GROUP BY ?o "
            + tail
        )
        data = http_get(SPARQL, params={"query": query}, headers={"Accept": "application/sparql-results+json"}).json()
        return (data.get("results") or {}).get("bindings") or []

    @staticmethod
    def _value(row, key):
        return (row.get(key) or {}).get("value", "")

    def _size(self, image_id):
        """(width, height) of the full picture, or None if the image server will not say."""
        def read():
            info = http_get(f"{IIIF}/{image_id}/info.json").json()
            return [info["width"], info["height"]] if info.get("width") and info.get("height") else None
        try:
            return _dimensions.memo(image_id, read)
        except (DiscoverError, KeyError, ValueError):
            return None

    def _normalise(self, row, size):
        image_url = self._value(row, "image")
        match = _IMAGE_ID.search(image_url)
        object_uri = self._value(row, "o")
        if not match or not object_uri.startswith(OBJECT):
            return None
        width, height = size or (None, None)
        title = _ACCESSION.sub("", self._value(row, "title")).strip()
        return artwork(
            self.id,
            object_uri.removeprefix(OBJECT),
            title,
            self._value(row, "maker"),
            "",
            f"{IIIF}/{match.group(1)}/full/480,/0/default.jpg",
            f"{OBJECT}{object_uri.removeprefix(OBJECT)}",
            self.license_note,
            width=width,
            height=height,
        )

    def _rows_to_items(self, rows):
        images = [(_IMAGE_ID.search(self._value(row, "image")) or [None, None])[1] for row in rows]
        with ThreadPoolExecutor(max_workers=4) as pool:
            sizes = list(pool.map(lambda image_id: self._size(image_id) if image_id else None, images))
        return [item for item in (self._normalise(row, size) for row, size in zip(rows, sizes)) if item]

    # --- Source interface -------------------------------------------------------

    def search(self, query, page, paintings_only, shape):
        words = _words(query) or [self.default_query]
        conditions = " ".join(f'FILTER(CONTAINS(LCASE(STR(?label)), "{_literal(w)}"))' for w in words)
        if paintings_only:
            conditions += f" ?o crm:P2_has_type <{PAINTING}> ."
        offset = (page - 1) * PAGE_SIZE
        rows = self._select(conditions, f"ORDER BY ?o LIMIT {PAGE_SIZE + 1} OFFSET {offset}")
        has_more = len(rows) > PAGE_SIZE
        items, hidden = apply_shape(self._rows_to_items(rows[:PAGE_SIZE]), shape)
        return {"results": items, "page": page, "hidden": hidden, "has_more": has_more, "total": None}

    def _row(self, item_id):
        if not _ID.match(str(item_id)):
            raise DiscoverError("That artwork could not be found", 404)
        rows = self._select(f"FILTER(?o = <{OBJECT}{item_id}>)", "LIMIT 1")
        if not rows:
            raise DiscoverError("That work is not CC0 or has no image", 404)
        return rows[0]

    def get(self, item_id):
        row = self._row(item_id)
        image_id = _IMAGE_ID.search(self._value(row, "image"))
        item = self._normalise(row, self._size(image_id.group(1)) if image_id else None)
        if not item:
            raise DiscoverError("That work is not CC0 or has no image", 404)
        return item

    def plan(self, item_id, fit):
        row = self._row(item_id)
        image_id = _IMAGE_ID.search(self._value(row, "image"))
        size = self._size(image_id.group(1)) if image_id else None
        item = self._normalise(row, size)
        if not item or not size:
            raise DiscoverError("That work is not CC0 or has no image", 404)
        width, height = size
        if width > TARGET_WIDTH:
            url = f"{IIIF}/{image_id.group(1)}/full/{TARGET_WIDTH},/0/default.jpg"
            width, height = TARGET_WIDTH, round(height * TARGET_WIDTH / width)
        else:
            url = f"{IIIF}/{image_id.group(1)}/full/max/0/default.jpg"
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
        parts = urlsplit(url)
        if parts.hostname == "data.getty.edu" and parts.path.startswith("/museum/collection/object/"):
            item_id = parts.path.rsplit("/", 1)[-1]
            return item_id if _ID.match(item_id) else None
        return None


getty = Getty()
