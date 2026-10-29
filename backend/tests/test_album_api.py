"""Covers picking an album at upload time and assigning several images at once.

Run with: pytest tests/test_album_api.py
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


def png_bytes():
    buf = io.BytesIO()
    PILImage.new("RGB", (4, 4), "red").save(buf, format="PNG")
    buf.seek(0)
    return buf


def upload(client, name, album_id=None):
    data = {"file": (png_bytes(), name)}
    if album_id is not None:
        data["album_id"] = str(album_id)
    return client.post("/api/upload", data=data, content_type="multipart/form-data")


def album_named(payload, name):
    return next(album for album in payload["albums"] if album["name"] == name)


def test_upload_lands_in_the_chosen_album(client):
    created = client.post("/api/albums", json={"name": "Holidays"}).get_json()
    album_id = album_named(created, "Holidays")["id"]

    res = upload(client, "beach.png", album_id=album_id)
    assert res.status_code == 200
    assert res.get_json()["album_id"] == album_id

    albums = client.get("/api/albums").get_json()
    assert album_named(albums, "Holidays")["images"] == ["beach.png"]


def test_upload_without_an_album_still_works(client):
    res = upload(client, "orphan.png")
    assert res.status_code == 200
    assert res.get_json()["album_id"] is None


@pytest.mark.parametrize("album_id,expected", [(999, 404), ("not-a-number", 400)])
def test_upload_rejects_unusable_album_ids(client, album_id, expected):
    assert upload(client, "ghost.png", album_id=album_id).status_code == expected


def test_reupload_reuses_the_existing_image_row(client):
    upload(client, "beach.png")
    upload(client, "beach.png")
    with backend.app.app_context():
        assert backend.Image.query.filter_by(filename="beach.png").count() == 1


def test_bulk_assign_moves_every_selected_image(client):
    client.post("/api/albums", json={"name": "Holidays"})
    for name in ("a.png", "b.png", "c.png"):
        upload(client, name)

    res = client.post("/api/albums/Holidays/add", json={"images": ["a.png", "b.png", "c.png"]})
    assert res.status_code == 200
    assert set(album_named(res.get_json(), "Holidays")["images"]) == {"a.png", "b.png", "c.png"}


def test_single_image_assign_still_moves_between_albums(client):
    client.post("/api/albums", json={"name": "Holidays"})
    client.post("/api/albums", json={"name": "Winter"})
    upload(client, "a.png", album_id=album_named(client.get("/api/albums").get_json(), "Holidays")["id"])

    res = client.post("/api/albums/Winter/add", json={"image": "a.png"})
    assert res.status_code == 200
    assert album_named(res.get_json(), "Winter")["images"] == ["a.png"]
    assert album_named(res.get_json(), "Holidays")["images"] == []


@pytest.mark.parametrize("payload", [{}, {"images": []}, {"images": ["ok.png", 2]}])
def test_invalid_bulk_payloads_are_rejected(client, payload):
    client.post("/api/albums", json={"name": "Winter"})
    assert client.post("/api/albums/Winter/add", json=payload).status_code == 400


def test_assigning_to_a_missing_album_is_a_404(client):
    upload(client, "a.png")
    assert client.post("/api/albums/Nope/add", json={"images": ["a.png"]}).status_code == 404
