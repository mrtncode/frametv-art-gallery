"""Covers what the TV reports about the images it holds, and how it is presented.

Run with: pytest tests/test_tv_content.py
"""

import io

import pytest
from PIL import Image as PILImage

import app as backend


@pytest.fixture
def client():
    backend.app.config["TESTING"] = True
    with backend.app.app_context():
        backend.db.drop_all()
        backend.db.create_all()
    return backend.app.test_client()


def upload(client, name):
    buf = io.BytesIO()
    PILImage.new("RGB", (60, 40), "red").save(buf, format="PNG")
    buf.seek(0)
    return client.post(
        "/api/upload",
        data={"file": (buf, name)},
        content_type="multipart/form-data",
    )


def test_the_content_date_is_turned_into_something_a_browser_can_parse():
    """Firmware reports it EXIF-style, which no browser date parser accepts."""
    from utils.frame_tv import _content_date

    assert _content_date({"image_date": "2026:08:10 14:24:23"}) == "2026-08-10T14:24:23"
    # Other firmware may already use ISO, or one of the older key names.
    assert _content_date({"date_added": "2026-08-10T14:24:23"}) == "2026-08-10T14:24:23"
    assert _content_date({"created_at": "whenever"}) == "whenever"
    assert _content_date({}) == ""


def test_thumbnail_collection_falls_back_to_single_results(monkeypatch, tmp_path):
    from utils import frame_tv

    monkeypatch.setattr(frame_tv, "TV_THUMB_DIR", tmp_path)

    class FakeArt:
        def get_thumbnail_list(self, content_ids):
            return {"tv-file.jpg": bytearray(b"batch")}

        def get_thumbnail(self, content_id):
            return bytearray(content_id.encode())

    thumbnails = frame_tv._collect_thumbnails(FakeArt(), "192.0.2.52", ["C1", "C2"])

    assert thumbnails == {"C1": b"C1", "C2": b"C2"}


def test_a_tv_image_falls_back_to_its_content_id_when_unknown(client, monkeypatch):
    """The TV reports no filename, so entries used to read "Unknown" for everything."""
    with backend.app.app_context():
        backend.db.session.add(backend.TV(ip="192.0.2.50", name="TV", token="1"))
        backend.db.session.commit()

    monkeypatch.setattr(backend, "get_tv_gallery_images", lambda ip, token=None: [
        {"content_id": "MY_F0328", "filename": "", "date_added": "2026-08-10T14:24:23"},
    ])
    images = client.get("/api/tv/192.0.2.50/gallery").get_json()["images"]
    assert images[0]["filename"] == "MY_F0328"


def test_a_tv_image_sent_from_here_shows_its_real_name(client, monkeypatch):
    upload(client, "sunset.png")
    with backend.app.app_context():
        tv = backend.TV(ip="192.0.2.51", name="TV", token="1")
        backend.db.session.add(tv)
        backend.db.session.commit()
        image = backend.Image.query.filter_by(filename="sunset.png").first()
        backend.db.session.add(
            backend.UploadedImage(image_id=image.id, tv_id=tv.id, content_id="MY_F0400")
        )
        backend.db.session.commit()

    monkeypatch.setattr(backend, "get_tv_gallery_images", lambda ip, token=None: [
        {"content_id": "MY_F0400", "filename": "", "date_added": ""},
    ])
    images = client.get("/api/tv/192.0.2.51/gallery").get_json()["images"]
    assert images[0]["filename"] == "sunset.png"
