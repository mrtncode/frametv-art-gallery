"""Covers how responses are served: compression, the image size lookup, and the
database settings that let the workers share SQLite.

Run with: pytest tests/test_serving.py
"""

import gzip
import io
import os

import pytest
from PIL import Image as PILImage

import app as backend


@pytest.fixture
def client():
    backend.app.config["TESTING"] = True
    with backend.app.app_context():
        backend.db.drop_all()
        backend.db.create_all()
    for name in os.listdir(backend.app.config["UPLOAD_FOLDER"]):
        path = os.path.join(backend.app.config["UPLOAD_FOLDER"], name)
        if os.path.isfile(path):
            os.remove(path)
    backend._gzipped_assets.clear()
    return backend.app.test_client()


@pytest.fixture
def built_asset():
    """A file in the built frontend's assets folder, as Vite would name one."""
    if not backend.STATIC_ROOT or not backend.STATIC_ROOT.is_dir():
        pytest.skip("frontend build not present")
    assets = backend.STATIC_ROOT / "assets"
    assets.mkdir(exist_ok=True)
    path = assets / "serving-test-0a1b2c3d.js"
    path.write_text("export const message = 'hello';\n" * 200)
    yield "/assets/" + path.name, path.read_bytes()
    path.unlink()


def upload(client, name, size=(1200, 800), exif_orientation=None):
    buf = io.BytesIO()
    image = PILImage.new("RGB", size, "red")
    if exif_orientation:
        exif = image.getexif()
        exif[0x0112] = exif_orientation
        image.save(buf, format="JPEG", exif=exif)
    else:
        image.save(buf, format="JPEG")
    buf.seek(0)
    return client.post("/api/upload", data={"file": (buf, name)}, content_type="multipart/form-data")


def test_a_built_asset_is_gzipped_for_a_browser_that_accepts_it(client, built_asset):
    url, original = built_asset

    res = client.get(url, headers={"Accept-Encoding": "gzip, br"})

    assert res.status_code == 200
    assert res.headers["Content-Encoding"] == "gzip"
    assert "Accept-Encoding" in res.headers["Vary"]
    assert gzip.decompress(res.data) == original
    assert len(res.data) < len(original)
    assert "immutable" in res.headers["Cache-Control"], "still cached for a year"


def test_the_asset_still_revalidates_against_its_now_weak_etag(client, built_asset):
    url, _ = built_asset
    first = client.get(url, headers={"Accept-Encoding": "gzip"})
    etag = first.headers["ETag"]
    assert etag.startswith('W/"')

    again = client.get(url, headers={"Accept-Encoding": "gzip", "If-None-Match": etag})

    assert again.status_code == 304


def test_the_asset_is_compressed_once_and_reused(client, built_asset):
    url, original = built_asset
    client.get(url, headers={"Accept-Encoding": "gzip"})

    second = client.get(url, headers={"Accept-Encoding": "gzip"})

    assert url in backend._gzipped_assets
    assert gzip.decompress(second.data) == original


def test_a_client_that_does_not_ask_for_gzip_gets_the_plain_file(client, built_asset):
    url, original = built_asset

    res = client.get(url)

    assert "Content-Encoding" not in res.headers
    assert res.data == original


def test_images_are_not_gzipped(client):
    upload(client, "photo.jpg")

    res = client.get("/uploads/photo.jpg", headers={"Accept-Encoding": "gzip"})

    assert res.status_code == 200
    assert "Content-Encoding" not in res.headers


def test_the_image_size_comes_from_the_file_without_sending_it(client):
    upload(client, "wide.jpg", size=(1600, 900))

    res = client.get("/api/images/wide.jpg/size")

    assert res.status_code == 200
    assert res.get_json() == {"width": 1600, "height": 900}


def test_the_image_size_is_the_upright_one_for_a_turned_phone_photo(client):
    upload(client, "phone.jpg", size=(1600, 900), exif_orientation=6)

    res = client.get("/api/images/phone.jpg/size")

    assert res.get_json() == {"width": 900, "height": 1600}


def test_the_size_of_a_missing_image_is_a_404(client):
    assert client.get("/api/images/nope.jpg/size").status_code == 404


def test_the_database_runs_in_wal_mode_with_a_lock_timeout(client):
    with backend.app.app_context():
        connection = backend.db.engine.raw_connection()
        try:
            cursor = connection.cursor()
            journal = cursor.execute("PRAGMA journal_mode").fetchone()[0]
            timeout = cursor.execute("PRAGMA busy_timeout").fetchone()[0]
        finally:
            connection.close()

    assert journal.lower() == "wal"
    assert timeout == 5000
