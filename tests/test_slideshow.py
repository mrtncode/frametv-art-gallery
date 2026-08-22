"""Covers the slideshow scheduling, its art-mode guard and the settings endpoint.

Run with: pytest tests/test_slideshow.py
"""

import os
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("FRAME_TV_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "_data"))
# The loop is a background thread; the pieces below are exercised directly.
os.environ.setdefault("FRAME_TV_SLIDESHOW", "0")

import app as backend
from utils import slideshow


class FakeTV:
    def __init__(self, **kwargs):
        self.ip = "192.0.2.10"
        self.token = "1"
        self.slideshow_enabled = True
        self.slideshow_album_id = 1
        self.slideshow_interval_minutes = 30
        self.slideshow_last_run = None
        self.__dict__.update(kwargs)


@pytest.fixture
def client():
    backend.app.config["TESTING"] = True
    with backend.app.app_context():
        backend.db.drop_all()
        backend.db.create_all()
    return backend.app.test_client()


# --- when a TV is due ---

def test_a_tv_is_due_only_once_its_interval_has_passed():
    now = datetime(2026, 1, 1, 12, 0)
    assert slideshow._due(FakeTV(), now), "never run yet"
    assert not slideshow._due(FakeTV(slideshow_last_run=now - timedelta(minutes=5)), now)
    assert slideshow._due(FakeTV(slideshow_last_run=now - timedelta(minutes=31)), now)


@pytest.mark.parametrize("tv", [
    FakeTV(slideshow_enabled=False),
    FakeTV(slideshow_album_id=None),
    FakeTV(slideshow_interval_minutes=None),
    FakeTV(slideshow_interval_minutes=0),
])
def test_an_incomplete_slideshow_never_runs(tv):
    assert not slideshow._due(tv, datetime(2026, 1, 1, 12, 0))


# --- never interrupt someone ---

def test_a_tv_in_use_is_left_alone():
    """Showing an image switches a Frame TV to art mode, cutting across whoever is watching."""
    asked = []

    def art_mode(ip, token=None):
        asked.append(ip)
        return False

    assert slideshow._is_showing_art(FakeTV(), art_mode, (OSError,)) is False
    assert asked == ["192.0.2.10"], "the TV should have been asked, not assumed"


def test_a_tv_already_showing_art_is_rotated():
    assert slideshow._is_showing_art(FakeTV(), lambda ip, token=None: True, (OSError,)) is True


def test_a_tv_that_cannot_be_read_is_treated_as_in_use():
    """Skipping a rotation is harmless; interrupting one is not."""

    def unreachable(ip, token=None):
        raise OSError("no route to host")

    assert slideshow._is_showing_art(FakeTV(), unreachable, (OSError,)) is False


# --- which image comes next ---

def test_the_rotation_wraps_around():
    uploaded = [type("U", (), {"content_id": c})() for c in ("A", "B", "C")]
    assert slideshow._next_content_id(uploaded, None) == "A"
    assert slideshow._next_content_id(uploaded, "A") == "B"
    assert slideshow._next_content_id(uploaded, "C") == "A", "wraps to the start"
    assert slideshow._next_content_id(uploaded, "gone") == "A", "forgets an image that left"
    assert slideshow._next_content_id([], "A") is None


# --- an image the TV no longer holds ---

def test_a_refused_content_id_is_dropped_rather_than_retried(client):
    """A TV that refuses an image no longer holds it, whatever the database says.

    Left in place it is requested again on every tick, which fills the log with
    `select_image request failed with error number -10`.
    """
    with backend.app.app_context():
        tv = backend.TV(ip="192.0.2.63", name="TV", token="1")
        album = backend.Album(name="Album")
        backend.db.session.add_all([tv, album])
        backend.db.session.commit()
        for filename, content_id in (("a.png", "GONE"), ("b.png", "STILL_THERE")):
            image = backend.Image(filename=filename, album_id=album.id)
            backend.db.session.add(image)
            backend.db.session.commit()
            backend.db.session.add(
                backend.UploadedImage(image_id=image.id, tv_id=tv.id, content_id=content_id)
            )
        backend.db.session.commit()
        tv_id = tv.id

        removed = slideshow._forget_content(backend.db, backend.UploadedImage, tv_id, "GONE")
        remaining = {
            u.content_id for u in backend.UploadedImage.query.filter_by(tv_id=tv_id).all()
        }

    assert removed == 1
    assert remaining == {"STILL_THERE"}, "only the refused one should go"


def test_forgetting_an_unknown_content_id_is_harmless(client):
    with backend.app.app_context():
        tv = backend.TV(ip="192.0.2.64", name="TV", token="1")
        backend.db.session.add(tv)
        backend.db.session.commit()
        assert slideshow._forget_content(backend.db, backend.UploadedImage, tv.id, "NEVER") == 0


# --- settings ---

def test_the_slideshow_cannot_be_enabled_half_configured(client):
    with backend.app.app_context():
        backend.db.session.add(backend.TV(ip="192.0.2.21", name="TV", token="1"))
        backend.db.session.commit()

    assert client.patch("/api/tvs/192.0.2.21", json={"slideshow_enabled": True}).status_code == 400

    client.post("/api/albums", json={"name": "Rotation"})
    album_id = client.get("/api/albums").get_json()["albums"][0]["id"]
    res = client.patch("/api/tvs/192.0.2.21", json={
        "slideshow_enabled": True,
        "slideshow_album_id": album_id,
        "slideshow_interval_minutes": 15,
    })
    assert res.status_code == 200

    tv = client.get("/api/tvs").get_json()["tvs"][0]
    assert tv["slideshow_enabled"] is True
    assert tv["slideshow_interval_minutes"] == 15


@pytest.mark.parametrize("payload", [
    {"slideshow_interval_minutes": 0},
    {"slideshow_interval_minutes": "soon"},
    {"slideshow_album_id": 999},
])
def test_invalid_slideshow_settings_are_refused(client, payload):
    with backend.app.app_context():
        backend.db.session.add(backend.TV(ip="192.0.2.22", name="TV", token="1"))
        backend.db.session.commit()
    assert client.patch("/api/tvs/192.0.2.22", json=payload).status_code in (400, 404)


def test_existing_tv_settings_are_untouched(client):
    """The slideshow fields are additive; the old toggle keeps working."""
    with backend.app.app_context():
        backend.db.session.add(backend.TV(ip="192.0.2.23", name="TV", token="1"))
        backend.db.session.commit()

    assert client.patch("/api/tvs/192.0.2.23", json={"delete_other_images_on_upload": True}).status_code == 200
    tv = client.get("/api/tvs").get_json()["tvs"][0]
    assert tv["delete_other_images_on_upload"] is True
    assert tv["slideshow_enabled"] is False
    assert tv["one_slot_mode"] is False


def test_the_one_slot_mode_can_be_toggled(client):
    with backend.app.app_context():
        backend.db.session.add(backend.TV(ip="192.0.2.24", name="TV", token="1"))
        backend.db.session.commit()

    assert client.patch("/api/tvs/192.0.2.24", json={"one_slot_mode": True}).status_code == 200
    tv = client.get("/api/tvs").get_json()["tvs"][0]
    assert tv["one_slot_mode"] is True
