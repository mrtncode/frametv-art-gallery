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

    def search(self, query, page, paintings_only, shape):
        self.searches.append((query, page, paintings_only, shape))
        return {"results": [], "page": page, "hidden": 0, "has_more": False, "total": 0}

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


def test_search_passes_the_filters_to_the_source(client, fake):
    client.get("/api/discover/search?source=fake&q=%20sunset%20&page=3&paintings=0&shape=any")
    client.get("/api/discover/search?source=fake&q=x&page=99999")
    client.get("/api/discover/search?source=fake")

    assert fake.searches == [("sunset", 3, False, "any"), ("x", 200, True, "wide"), ("", 1, True, "wide")]


def test_search_rejects_unknown_sources_pages_and_shapes(client, fake):
    unknown = client.get("/api/discover/search?source=nope")
    bad_page = client.get("/api/discover/search?source=fake&page=abc")
    bad_shape = client.get("/api/discover/search?source=fake&shape=square")

    assert unknown.status_code == 404 and unknown.get_json()["error"]
    assert bad_page.status_code == 400
    assert bad_shape.status_code == 400 and "shape must be one of" in bad_shape.get_json()["error"]


@pytest.mark.parametrize("shape", ["any", "landscape", "wide", "fits"])
def test_every_shape_is_accepted(client, fake, shape):
    client.get(f"/api/discover/search?source=fake&shape={shape}")

    assert fake.searches[-1][3] == shape


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
