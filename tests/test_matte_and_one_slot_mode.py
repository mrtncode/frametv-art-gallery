"""Covers the matte style/color sent with artwork, and its per-TV default.

Run with: pytest tests/test_matte.py
"""

import io
import os

import pytest
from PIL import Image as PILImage
from samsungtvws.exceptions import ResponseError

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


def add_tv(ip, default_matte=None, one_slot_mode=False):
    with backend.app.app_context():
        tv = backend.TV(
            ip=ip,
            name="TV",
            token="1",
            default_matte=default_matte,
            one_slot_mode=one_slot_mode,
        )
        backend.db.session.add(tv)
        backend.db.session.commit()
        return tv.id


def fake_upload_artwork(calls):
    def fake(ip, art_path, **kwargs):
        calls.append(kwargs)
        return "CONTENT_1"
    return fake


# --- settings: reading and writing the per-TV default ---

def test_a_new_tv_has_no_default_matte(client):
    add_tv("192.0.2.90")
    tv = next(t for t in client.get("/api/tvs").get_json()["tvs"] if t["ip"] == "192.0.2.90")
    assert tv["default_matte"] is None


def test_the_default_matte_can_be_set_and_cleared(client):
    add_tv("192.0.2.91")

    res = client.patch("/api/tvs/192.0.2.91", json={"default_matte": "modernthin_polar"})
    assert res.status_code == 200
    tv = next(t for t in client.get("/api/tvs").get_json()["tvs"] if t["ip"] == "192.0.2.91")
    assert tv["default_matte"] == "modernthin_polar"

    client.patch("/api/tvs/192.0.2.91", json={"default_matte": ""})
    tv = next(t for t in client.get("/api/tvs").get_json()["tvs"] if t["ip"] == "192.0.2.91")
    assert tv["default_matte"] is None


# --- sending art to a TV ---

def test_a_matte_named_on_the_request_overrides_the_tvs_default(client, monkeypatch):
    upload(client, "a.png")
    add_tv("192.0.2.92", default_matte="shadowbox_navy")

    calls = []
    monkeypatch.setattr(backend, "upload_artwork", fake_upload_artwork(calls))
    res = client.post("/api/tv/send", json={"ip": "192.0.2.92", "filename": "a.png", "matte": "modern_black"})

    assert res.status_code == 200
    assert calls[0]["matte"] == "modern_black"


def test_the_tvs_default_matte_is_used_when_the_request_names_none(client, monkeypatch):
    upload(client, "a.png")
    add_tv("192.0.2.93", default_matte="shadowbox_navy")

    calls = []
    monkeypatch.setattr(backend, "upload_artwork", fake_upload_artwork(calls))
    res = client.post("/api/tv/send", json={"ip": "192.0.2.93", "filename": "a.png"})

    assert res.status_code == 200
    assert calls[0]["matte"] == "shadowbox_navy"


def test_no_matte_kwarg_is_sent_when_nothing_is_configured(client, monkeypatch):
    """Preserves upload_artwork's own default rather than forcing one from here."""
    upload(client, "a.png")
    add_tv("192.0.2.94")

    calls = []
    monkeypatch.setattr(backend, "upload_artwork", fake_upload_artwork(calls))
    res = client.post("/api/tv/send", json={"ip": "192.0.2.94", "filename": "a.png"})

    assert res.status_code == 200
    assert "matte" not in calls[0]


def test_one_slot_mode_prunes_old_managed_images(client, monkeypatch):
    upload(client, "a.png")
    upload(client, "b.png")
    tv_id = add_tv("192.0.2.95", one_slot_mode=True)

    with backend.app.app_context():
        tv = backend.TV.query.get(tv_id)
        image_a = backend.Image.query.filter_by(filename="a.png").first()
        image_b = backend.Image.query.filter_by(filename="b.png").first()
        backend.db.session.add_all([
            backend.UploadedImage(image_id=image_a.id, tv_id=tv.id, content_id="OLD_A"),
            backend.UploadedImage(image_id=image_b.id, tv_id=tv.id, content_id="OLD_B"),
        ])
        backend.db.session.commit()

    monkeypatch.setattr(backend, "upload_artwork", lambda *a, **k: "NEW_SLOT")
    deleted = []

    def fake_delete(ip, content_id, token=None):
        deleted.append((ip, content_id, token))
        return True

    monkeypatch.setattr(backend, "delete_tv_image", fake_delete)

    res = client.post("/api/tv/send", json={"ip": "192.0.2.95", "filename": "a.png"})
    assert res.status_code == 200

    assert len(deleted) == 2
    assert {item[1] for item in deleted} == {"OLD_A", "OLD_B"}
    assert all(item[0] == "192.0.2.95" for item in deleted)
    assert all(item[2] == "1" for item in deleted)

    with backend.app.app_context():
        content_ids = {
            row.content_id
            for row in backend.UploadedImage.query.filter_by(tv_id=tv_id).all()
        }
    assert content_ids == {"NEW_SLOT"}


def test_one_slot_mode_forgets_stale_rows_when_tv_reports_missing_content_id(client, monkeypatch):
    upload(client, "a.png")
    upload(client, "b.png")
    tv_id = add_tv("192.0.2.96", one_slot_mode=True)

    with backend.app.app_context():
        tv = backend.TV.query.get(tv_id)
        image_a = backend.Image.query.filter_by(filename="a.png").first()
        image_b = backend.Image.query.filter_by(filename="b.png").first()
        backend.db.session.add_all([
            backend.UploadedImage(image_id=image_a.id, tv_id=tv.id, content_id="OLD_A"),
            backend.UploadedImage(image_id=image_b.id, tv_id=tv.id, content_id="OLD_B"),
        ])
        backend.db.session.commit()

    monkeypatch.setattr(backend, "upload_artwork", lambda *a, **k: "NEW_SLOT")

    def flaky_delete(ip, content_id, token=None):
        if content_id == "OLD_A":
            raise ResponseError("`delete_image` request failed with error number -10")
        return True

    monkeypatch.setattr(backend, "delete_tv_image", flaky_delete)

    res = client.post("/api/tv/send", json={"ip": "192.0.2.96", "filename": "a.png"})
    assert res.status_code == 200

    with backend.app.app_context():
        content_ids = {
            row.content_id
            for row in backend.UploadedImage.query.filter_by(tv_id=tv_id).all()
        }
    assert content_ids == {"NEW_SLOT"}
