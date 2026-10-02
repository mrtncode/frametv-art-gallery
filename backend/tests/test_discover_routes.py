"""Covers the Discover endpoints: browsing, link resolving and the import job.

Run with: pytest tests/test_discover_routes.py
"""

import io
import os
import time

import pytest
from discover_fakes import FakeNet, FakeResponse
from PIL import Image as PILImage

import app as backend
import discover_routes
import utils.discover as discover
from utils.discover.common import DiscoverError, DownloadPlan

JPEG_URL = "https://cdn.fake.test/art.jpg"


def jpeg_bytes(size=(4000, 2826), colour="navy"):
    buf = io.BytesIO()
    PILImage.new("RGB", size, colour).save(buf, format="JPEG")
    return buf.getvalue()


class FakeSource:
    id = "fake"
    name = "Fake Museum"
    short_name = "the Fake Museum"
    tagline = "For tests"
    site_url = "https://fake.test"
    support_url = "https://fake.test/give"
    support_label = "Support the Fake Museum"
    icon_url = "https://fake.test/favicon.ico"
    license_note = "Public domain"
    default_query = ""
    download_hosts = {"cdn.fake.test"}

    def __init__(self):
        self.searches = []
        self.fail_plan = None

    results = []

    def search(self, query, page, paintings_only, shape):
        self.searches.append((query, page, paintings_only, shape))
        return {"results": list(self.results), "page": page, "hidden": 0, "has_more": False, "total": 0}

    def get(self, item_id):
        return {"source": "fake", "id": item_id, "title": "A fake artwork"}

    def plan(self, item_id, fit):
        if self.fail_plan:
            raise self.fail_plan
        return DownloadPlan(JPEG_URL, f"Work {item_id}", "Test Artist", "fake", "https://fake.test/art/1")

    def from_url(self, url):
        return url.rsplit("/", 1)[1] if url.startswith("https://fake.test/art/") else None


@pytest.fixture
def client():
    backend.app.config["TESTING"] = True
    with backend.app.app_context():
        backend.db.drop_all()
        backend.db.create_all()
    uploads = backend.app.config["UPLOAD_FOLDER"]
    for name in os.listdir(uploads):
        path = os.path.join(uploads, name)
        if os.path.isfile(path):
            os.remove(path)
    return backend.app.test_client()


@pytest.fixture
def fake(monkeypatch):
    source = FakeSource()
    monkeypatch.setitem(discover.SOURCES, "fake", source)
    return source


@pytest.fixture
def net(monkeypatch):
    network = FakeNet().install(monkeypatch)
    data = jpeg_bytes()
    network.add("cdn.fake.test", FakeResponse(content=data, headers={"Content-Length": str(len(data))}, url=JPEG_URL))
    return network


def wait_for(client, job_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/discover/jobs/{job_id}").get_json()
        if job["state"] in ("done", "error"):
            return job
        time.sleep(0.05)
    raise AssertionError("the import never finished")


def start_import(client, **body):
    body.setdefault("source", "fake")
    body.setdefault("id", "1")
    response = client.post("/api/discover/import", json=body)
    return response, (response.get_json() or {}).get("job_id")


# --- Browsing ----------------------------------------------------------------------


def test_sources_describe_where_to_send_thanks(client):
    sources = client.get("/api/discover/sources").get_json()["sources"]

    assert [s["id"] for s in sources[:4]] == ["reframed", "artic", "met", "cleveland"]
    reframed = sources[0]
    assert reframed["tv_ready"] is True and reframed["support_url"].startswith("https://")
    assert all(s["name"] and s["support_label"] and s["icon_url"] for s in sources)


def test_search_asks_the_source_for_the_raw_page_and_filters_afterwards(client, fake):
    client.get("/api/discover/search?source=fake&q=%20sunset%20&page=3&paintings=0&shape=any")
    client.get("/api/discover/search?source=fake&q=x&page=99999")
    client.get("/api/discover/search?source=fake")

    # The shape is applied to the cached page afterwards, so the source is always asked for "any".
    assert fake.searches == [("sunset", 3, False, "any"), ("x", 200, True, "any"), ("", 1, True, "any")]


def test_search_rejects_unknown_sources_pages_and_shapes(client, fake):
    unknown = client.get("/api/discover/search?source=nope")
    bad_page = client.get("/api/discover/search?source=fake&page=abc")
    bad_shape = client.get("/api/discover/search?source=fake&shape=square")

    assert unknown.status_code == 404 and unknown.get_json()["error"]
    assert bad_page.status_code == 400
    assert bad_shape.status_code == 400 and "shape must be one of" in bad_shape.get_json()["error"]


@pytest.mark.parametrize(
    "shape, kept",
    [("any", ["tall", "landscape", "wide", "fits"]), ("landscape", ["landscape", "wide", "fits"]),
     ("wide", ["wide", "fits"]), ("fits", ["fits"])],
)
def test_every_shape_filters_the_page_the_source_returned(client, fake, shape, kept):
    fake.results = [shaped_item("tall", 0.7), shaped_item("landscape", 1.3), shaped_item("wide", 1.65), shaped_item("fits", 1.78)]

    response = client.get(f"/api/discover/search?source=fake&shape={shape}")

    assert response.status_code == 200
    assert [r["id"] for r in response.get_json()["results"]] == kept


def test_a_source_failure_is_reported_as_json(client, fake, monkeypatch):
    def broken(*_):
        raise DiscoverError("The Fake Museum is limiting requests right now", 429)

    monkeypatch.setattr(fake, "search", broken)

    response = client.get("/api/discover/search?source=fake&q=x")

    assert response.status_code == 429
    assert "limiting requests" in response.get_json()["error"]


def test_resolve_identifies_the_artwork_behind_a_link(client, fake):
    found = client.post("/api/discover/resolve", json={"url": "https://fake.test/art/42"})
    unsupported = client.post("/api/discover/resolve", json={"url": "https://elsewhere.test/art/42"})
    missing = client.post("/api/discover/resolve", json={})

    assert found.get_json()["source"] == "fake" and found.get_json()["id"] == "42"
    assert unsupported.status_code == 400 and "not from a supported site" in unsupported.get_json()["error"]
    assert missing.status_code == 400


# --- Importing ---------------------------------------------------------------------


def test_importing_adds_a_frame_ready_image_to_the_chosen_album(client, fake, net):
    client.post("/api/albums", json={"name": "Impressionists"})
    with backend.app.app_context():
        album_id = backend.Album.query.filter_by(name="Impressionists").one().id

    response, job_id = start_import(client, album_id=album_id)
    job = wait_for(client, job_id)

    assert response.status_code == 202
    assert job["state"] == "done" and job["percent"] == 100
    assert job["title"] == "Work 1" and job["artist"] == "Test Artist"
    result = job["result"]
    assert (result["width"], result["height"], result["quality"]) == (3840, 2160, "tv_ready")
    assert job["received_bytes"] == job["total_bytes"] > 0

    saved = os.path.join(backend.app.config["UPLOAD_FOLDER"], result["filename"])
    with PILImage.open(saved) as image:
        assert image.size == (3840, 2160)
    with backend.app.app_context():
        row = backend.Image.query.filter_by(filename=result["filename"]).one()
        assert row.album_id == album_id and row.sha256
    assert result["filename"] in client.get("/api/images").get_json()["images"]


def test_the_whole_artwork_option_keeps_the_shape(client, fake, net):
    _, job_id = start_import(client, fit="whole")

    result = wait_for(client, job_id)["result"]

    assert result["height"] == 2160 and result["width"] == round(4000 * 2160 / 2826)


def test_importing_the_same_artwork_twice_is_reported_not_duplicated(client, fake, net):
    first = wait_for(client, start_import(client)[1])["result"]
    second = wait_for(client, start_import(client)[1])

    assert second["state"] == "done"
    assert second["result"]["duplicate_of"] == first["filename"]
    assert len(os.listdir(backend.app.config["UPLOAD_FOLDER"])) == 1
    with backend.app.app_context():
        assert backend.Image.query.count() == 1


def test_a_failed_lookup_ends_the_job_with_the_reason(client, fake, net):
    fake.fail_plan = DiscoverError("That work is not in the public domain", 404)

    job = wait_for(client, start_import(client)[1])

    assert job["state"] == "error" and job["error"] == "That work is not in the public domain"
    assert os.listdir(backend.app.config["UPLOAD_FOLDER"]) == []


def test_something_that_is_not_an_image_is_refused(client, fake, monkeypatch):
    network = FakeNet().install(monkeypatch)
    network.add("cdn.fake.test", FakeResponse(content=b"<html>blocked</html>", url=JPEG_URL))

    job = wait_for(client, start_import(client)[1])

    assert job["state"] == "error" and "not a usable image" in job["error"]
    assert os.listdir(backend.app.config["UPLOAD_FOLDER"]) == []


def test_an_oversized_file_is_refused_before_it_is_downloaded(client, fake, net, monkeypatch):
    monkeypatch.setattr(discover_routes, "MAX_DOWNLOAD_BYTES", 1000)

    job = wait_for(client, start_import(client)[1])

    assert job["state"] == "error" and "too large" in job["error"]


def test_a_download_redirected_to_another_host_is_refused(client, fake, monkeypatch):
    network = FakeNet().install(monkeypatch)
    network.add("cdn.fake.test", FakeResponse(content=jpeg_bytes(), url="https://elsewhere.test/art.jpg"))

    job = wait_for(client, start_import(client)[1])

    assert job["state"] == "error" and "unexpected host" in job["error"]


def test_the_temporary_download_is_cleaned_up(client, fake, net):
    wait_for(client, start_import(client)[1])
    wait_for(client, start_import(client, fit="whole")[1])

    leftovers = os.listdir(backend.app.config["DISCOVER_TMP"])
    assert leftovers == []


@pytest.mark.parametrize(
    "body, status",
    [
        ({"source": "nope", "id": "1"}, 404),
        ({"source": "fake"}, 400),
        ({"source": "fake", "id": "x" * 201}, 400),
        ({"source": "fake", "id": "1", "fit": "stretch"}, 400),
        ({"source": "fake", "id": "1", "album_id": "abc"}, 400),
        ({"source": "fake", "id": "1", "album_id": 999}, 404),
    ],
)
def test_import_requests_are_validated(client, fake, net, body, status):
    response = client.post("/api/discover/import", json=body)

    assert response.status_code == status
    assert response.get_json()["error"]


@pytest.mark.parametrize("job_id", ["0" * 32, "not-a-job", "0" * 31, "G" * 32, "%2e%2e", "0" * 32 + ".json"])
def test_unknown_or_malformed_job_ids_are_not_found(client, job_id):
    response = client.get(f"/api/discover/jobs/{job_id}")

    assert response.status_code == 404 and response.get_json()["error"]


# --- Image fallback ----------------------------------------------------------------


@pytest.fixture
def thumbs_dir():
    directory = os.path.join(backend.app.config["INSTANCE_FOLDER"], "discover", "thumbs")
    if os.path.isdir(directory):
        for name in os.listdir(directory):
            os.remove(os.path.join(directory, name))
    return directory


def test_previews_the_browser_cannot_load_are_fetched_and_cached(client, monkeypatch, thumbs_dir):
    network = FakeNet().install(monkeypatch)
    url = "https://www.artic.edu/iiif/2/abc/full/400,/0/default.jpg"
    network.add("artic.edu", FakeResponse(content=b"\xff\xd8\xff-jpeg", headers={"Content-Type": "image/jpeg"}, url=url))
    request_url = f"/api/discover/thumb?url={url}"

    first = client.get(request_url)
    second = client.get(request_url)

    assert first.status_code == 200 and first.mimetype == "image/jpeg" and first.data == b"\xff\xd8\xff-jpeg"
    assert second.data == first.data
    assert len(network.calls) == 1  # the second one came from the cache
    # The museum asks to be told who is calling; its image server challenges anonymous scripts.
    assert "AIC-User-Agent" in network.calls[0]["headers"]


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.test/a.jpg",
        "http://www.artic.edu/iiif/2/abc/full/400,/0/default.jpg",
        "https://www.artic.edu.evil.test/a.jpg",
        "file:///etc/passwd",
        "",
    ],
)
def test_only_the_known_sources_can_be_fetched_for_previews(client, monkeypatch, thumbs_dir, url):
    network = FakeNet().install(monkeypatch)

    response = client.get("/api/discover/thumb", query_string={"url": url})

    assert response.status_code == 400 and network.calls == []


def test_a_preview_that_is_not_an_image_is_refused(client, monkeypatch, thumbs_dir):
    network = FakeNet().install(monkeypatch)
    url = "https://www.metmuseum.org/not-an-image"
    network.add("metmuseum.org", FakeResponse(content=b"<html>", headers={"Content-Type": "text/html"}, url=url))

    response = client.get("/api/discover/thumb", query_string={"url": url})

    assert response.status_code == 502 and "not return an image" in response.get_json()["error"]


# --- Provenance --------------------------------------------------------------------


def test_an_imported_image_remembers_where_it_came_from(client, fake, net):
    result = wait_for(client, start_import(client, id="42")[1])["result"]

    with backend.app.app_context():
        row = backend.Image.query.filter_by(filename=result["filename"]).one()
        assert (row.source, row.source_id) == ("fake", "42")
        assert row.source_url == "https://fake.test/art/1"
        assert (row.title, row.artist, row.license) == ("Work 42", "Test Artist", "Public domain")


def test_a_manual_upload_is_marked_as_one(client):
    buf = io.BytesIO()
    PILImage.new("RGB", (60, 40), "red").save(buf, format="PNG")
    buf.seek(0)
    client.post("/api/upload", data={"file": (buf, "mine.png")}, content_type="multipart/form-data")

    details = client.get("/api/images/details").get_json()["details"]

    assert details["mine.png"]["source"] == "upload" and details["mine.png"]["source_label"] == "Uploaded"
    assert details["mine.png"]["source_url"] is None


def test_uploading_over_a_discovered_image_makes_it_a_manual_upload(client, fake, net):
    result = wait_for(client, start_import(client)[1])["result"]
    buf = io.BytesIO()
    PILImage.new("RGB", (60, 40), "red").save(buf, format="JPEG")
    buf.seek(0)

    client.post("/api/upload", data={"file": (buf, result["filename"])}, content_type="multipart/form-data")

    row = client.get("/api/images/details").get_json()["details"][result["filename"]]
    assert row["source"] == "upload" and row["source_url"] is None and row["title"] is None


def test_details_name_the_source_and_link_back_to_it(client, fake, net):
    result = wait_for(client, start_import(client)[1])["result"]

    details = client.get("/api/images/details").get_json()["details"][result["filename"]]

    assert details == {
        "source": "fake", "source_label": "Fake Museum", "source_id": "1",
        "source_url": "https://fake.test/art/1", "title": "Work 1", "artist": "Test Artist",
        "license": "Public domain",
    }


def test_an_image_from_before_source_tracking_reads_as_uploaded(client):
    with backend.app.app_context():
        backend.db.session.add(backend.Image(filename="old.jpg"))
        backend.db.session.commit()

    details = client.get("/api/images/details").get_json()["details"]["old.jpg"]

    assert details["source"] is None and details["source_label"] == "Uploaded"


def shaped_item(item_id, aspect):
    from utils.discover.common import crop_loss

    return {"source": "fake", "id": item_id, "aspect": aspect, "crop_loss": crop_loss(aspect)}


def sized(item_id, width, height, tv_ready=False):
    return {"source": "fake", "id": item_id, "width": width, "height": height, "tv_ready": tv_ready}


def test_the_sharp_filter_keeps_only_works_that_will_be_crisp_on_4k(client, fake):
    fake.results = [
        sized("big", 8000, 4500),                 # plenty of pixels
        sized("tall", 5000, 7000),                # portrait: the crop is only 5000 wide, still enough
        sized("small", 3000, 2000),               # a crop would be 3000 wide: soft
        sized("wide", 6000, 2000),                # wide: the crop is 3555 wide, just short
        sized("unknown", None, None),             # no size listed (the Met): cannot promise
        sized("ready", None, None, tv_ready=True),  # made for the panel
    ]

    everything = client.get("/api/discover/search?source=fake").get_json()
    sharp = client.get("/api/discover/search?source=fake&sharp=1").get_json()

    assert len(everything["results"]) == 6
    assert [r["id"] for r in sharp["results"]] == ["big", "tall", "ready"]
    assert sharp["hidden"] == 3


# --- Cached searches, per-source flags and highlights -------------------------------


def search(client, **params):
    params.setdefault("source", "fake")
    return client.get("/api/discover/search", query_string=params)


def test_a_repeated_search_is_served_from_the_cache(client, fake):
    first = search(client, q="monet").get_json()
    second = search(client, q="monet").get_json()

    assert fake.searches == [("monet", 1, True, "any")]  # the source was asked once
    assert first["cached"] is False and second["cached"] is True


def test_changing_a_filter_reuses_the_cached_page(client, fake):
    fake.results = [shaped_item("wide", 1.7), shaped_item("tall", 0.7)]

    shown = {shape: [r["id"] for r in search(client, q="x", shape=shape).get_json()["results"]]
             for shape in ("any", "wide", "fits")}

    assert shown == {"any": ["wide", "tall"], "wide": ["wide"], "fits": []}
    assert len(fake.searches) == 1


def test_the_cache_is_per_query_page_and_type_not_shared(client, fake):
    search(client, q="monet")
    search(client, q="  MONET ")            # same search, whatever the case or spacing
    search(client, q="monet", page=2)
    search(client, q="monet", paintings=0)
    search(client, q="degas")

    assert [s[:3] for s in fake.searches] == [
        ("monet", 1, True), ("monet", 2, True), ("monet", 1, False), ("degas", 1, True)
    ]


def test_a_failed_search_is_not_remembered(client, fake, monkeypatch):
    calls = []

    def flaky(query, page, paintings_only, shape):
        calls.append(query)
        if len(calls) == 1:
            raise DiscoverError("The source is having a moment", 502)
        return {"results": [], "page": 1, "hidden": 0, "has_more": False, "total": 0}

    monkeypatch.setattr(fake, "search", flaky)

    assert search(client, q="x").status_code == 502
    assert search(client, q="x").status_code == 200
    assert len(calls) == 2


def test_cached_searches_are_released_after_a_day(client, fake, monkeypatch):
    import time

    start = time.time()
    search(client, q="monet")
    monkeypatch.setattr("utils.discover.common.time.time", lambda: start + 23 * 3600)
    search(client, q="monet")
    assert len(fake.searches) == 1                     # still fresh at 23 hours

    monkeypatch.setattr("utils.discover.common.time.time", lambda: start + 25 * 3600)
    assert search(client, q="monet").get_json()["cached"] is False
    assert len(fake.searches) == 2                     # released after a day


def test_limit_trims_a_page_and_says_there_is_more(client, fake):
    fake.results = [shaped_item(str(n), 1.78) for n in range(10)]

    page = search(client, q="x", limit=4).get_json()

    assert len(page["results"]) == 4 and page["has_more"] is True
    assert len(search(client, q="x", limit=24).get_json()["results"]) == 10
    assert search(client, q="x", limit=24).get_json()["has_more"] is False


def test_a_resting_source_says_when_to_try_again(client, fake, monkeypatch):
    def resting(*_):
        raise DiscoverError("The source is resting", 429, retry_after=240)

    monkeypatch.setattr(fake, "search", resting)

    response = search(client, q="x")

    assert response.status_code == 429
    assert response.get_json() == {"error": "The source is resting", "retry_after": 240}


def test_sources_say_how_eagerly_each_may_be_searched(client):
    sources = {s["id"]: s for s in client.get("/api/discover/sources").get_json()["sources"]}

    assert (sources["met"]["weight"], sources["met"]["search_delay_ms"]) == ("heavy", 1500)
    assert (sources["artic"]["weight"], sources["artic"]["search_delay_ms"]) == ("light", 350)
    assert sources["met"]["status"]["state"] == "ok"


def test_sources_report_when_one_is_resting(client):
    from utils.discover.limits import Limiter

    Limiter.trip("collectionapi.metmuseum.org")

    sources = {s["id"]: s for s in client.get("/api/discover/sources").get_json()["sources"]}

    assert sources["met"]["status"]["state"] == "resting" and sources["met"]["status"]["retry_after"] > 0
    assert sources["artic"]["status"]["state"] == "ok"


class StubSource:
    def __init__(self, source_id, results=None, error=None):
        self.id, self._results, self._error, self.searches = source_id, results or [], error, []

    def search(self, query, page, paintings_only, shape):
        self.searches.append(query)
        if self._error:
            raise self._error
        return {"results": self._results, "page": page, "hidden": 0, "has_more": False, "total": len(self._results)}


def art(source, item_id, width, height, thumb="https://t/x.jpg", tv_ready=False):
    from utils.discover.common import artwork

    return artwork(source, item_id, f"Work {item_id}", "Artist", "", thumb, "https://t/p", "CC0",
                   width=width, height=height, tv_ready=tv_ready)


def test_highlights_pick_wide_sharp_works_and_alternate_between_sources():
    import datetime

    from utils.discover.aggregate import highlights

    sources = {
        "reframed": StubSource("reframed", [art("reframed", "r1", None, None, tv_ready=True), art("reframed", "r2", None, None, tv_ready=True)]),
        "artic": StubSource("artic", [art("artic", "square", 4000, 4000), art("artic", "a1", 6000, 3400), art("artic", "a2", 6000, 3400)]),
        "cleveland": StubSource("cleveland", [art("cleveland", "small", 2000, 1100)]),   # not sharp: skipped
        "smk": StubSource("smk", error=DiscoverError("resting", 429, retry_after=60)),    # failing: skipped
    }

    result = highlights(sources, today=datetime.date(2026, 10, 2))

    assert [(i["source"], i["id"]) for i in result["items"]] == [
        ("reframed", "r1"), ("artic", "a1"), ("reframed", "r2"), ("artic", "a2")
    ]
    assert result["mood"] in __import__("utils.discover.aggregate", fromlist=["MOODS"]).MOODS


def test_highlights_leave_out_the_met_and_are_remembered_for_the_day():
    import datetime

    from utils.discover.aggregate import highlights

    met_like = StubSource("met", [art("met", "m1", 6000, 3400)])
    reframed = StubSource("reframed", [art("reframed", "r1", None, None, tv_ready=True)])
    sources = {"met": met_like, "reframed": reframed}
    day = datetime.date(2026, 10, 3)

    first = highlights(sources, today=day)
    second = highlights(sources, today=day)

    assert [i["source"] for i in first["items"]] == ["reframed"] and met_like.searches == []
    assert second == first and len(reframed.searches) == 1
    assert highlights(sources, today=datetime.date(2026, 10, 4))["mood"] != first["mood"]  # a new day, a new theme


def test_a_day_with_no_highlights_is_not_remembered():
    import datetime

    from utils.discover.aggregate import highlights

    broken = StubSource("reframed", error=DiscoverError("down", 502))
    day = datetime.date(2026, 10, 5)
    assert highlights({"reframed": broken}, today=day)["items"] == []

    working = StubSource("reframed", [art("reframed", "r1", None, None, tv_ready=True)])
    assert len(highlights({"reframed": working}, today=day)["items"]) == 1


@pytest.mark.parametrize(
    "source, thumb, expected",
    [
        ("reframed", "https://cdn.reframed.gallery/cdn-cgi/image/width=480,quality=75,format=auto/originals/A.jpg",
         "https://cdn.reframed.gallery/cdn-cgi/image/width=1600,quality=75,format=auto/originals/A.jpg"),
        ("artic", "https://www.artic.edu/iiif/2/abc/full/400,/0/default.jpg",
         "https://www.artic.edu/iiif/2/abc/full/1400,/0/default.jpg"),
        ("smk", "https://iip-thumb.smk.dk/iiif/jp2/x.jp2/full/!480,/0/default.jpg",
         "https://iip-thumb.smk.dk/iiif/jp2/x.jp2/full/!1400,/0/default.jpg"),
        ("louvre", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Name.jpg/480px-Name.jpg",
         "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Name.jpg/1280px-Name.jpg"),
        ("cleveland", "https://openaccess-cdn.clevelandart.org/1/1_web.jpg", "https://openaccess-cdn.clevelandart.org/1/1_web.jpg"),
    ],
)
def test_the_hero_asks_each_source_for_a_larger_picture(source, thumb, expected):
    from utils.discover.aggregate import hero_url

    assert hero_url({"source": source, "thumb_url": thumb}) == expected


def test_the_highlights_endpoint_returns_the_days_picks(client, monkeypatch):
    monkeypatch.setattr(discover_routes, "highlights", lambda sources: {"mood": "winter", "items": [{"id": "1"}]})

    assert client.get("/api/discover/highlights").get_json() == {"mood": "winter", "items": [{"id": "1"}]}
