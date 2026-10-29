"""Covers the order of the gallery listing and its name filter.

Run with: pytest tests/test_gallery_listing.py
"""

import io
import os
from datetime import datetime, timedelta

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


def test_images_are_listed_newest_first(client):
    for name in ("first.png", "second.png", "third.png"):
        upload(client, name)
    with backend.app.app_context():
        rows = {img.filename: img for img in backend.Image.query.all()}
        base = datetime(2026, 1, 1)
        rows["first.png"].created_at = base
        rows["second.png"].created_at = base + timedelta(days=1)
        rows["third.png"].created_at = base + timedelta(days=2)
        backend.db.session.commit()

    assert client.get("/api/images").get_json()["images"] == ["third.png", "second.png", "first.png"]
    assert client.get("/api/images?sort=oldest").get_json()["images"] == ["first.png", "second.png", "third.png"]
    assert client.get("/api/images?sort=name").get_json()["images"] == ["first.png", "second.png", "third.png"]


def test_a_file_without_a_row_is_ordered_by_its_own_timestamp(client):
    """Images that predate the database still have to land somewhere sensible."""
    upload(client, "known.png")
    orphan = os.path.join(backend.app.config["UPLOAD_FOLDER"], "orphan.png")
    PILImage.new("RGB", (60, 40), "blue").save(orphan)
    os.utime(orphan, (0, 0))  # as old as it gets

    listing = client.get("/api/images").get_json()["images"]
    assert set(listing) == {"known.png", "orphan.png"}
    assert listing[-1] == "orphan.png", "the oldest file should come last"


def test_the_listing_can_be_filtered_by_name(client):
    upload(client, "sunset.png")
    upload(client, "portrait.png")
    assert client.get("/api/images?q=SUN").get_json()["images"] == ["sunset.png"]
    assert client.get("/api/images?q=nothing").get_json()["images"] == []
