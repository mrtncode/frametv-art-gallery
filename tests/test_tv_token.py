"""Covers keeping the token a Frame TV hands back on connect.

The set issues a fresh token each time a client connects and stops honouring the
previous one. Dropping it means the next connection arrives unrecognised and the TV
asks the user to allow the app again, every single time.

Run with: pytest tests/test_tv_token.py
"""

import shutil

import pytest

import app as backend
from utils import tv_connection as frame_tv


@pytest.fixture(autouse=True)
def clear_cooldowns():
    shutil.rmtree(frame_tv.TV_DOWN_DIR, ignore_errors=True)
    yield
    shutil.rmtree(frame_tv.TV_DOWN_DIR, ignore_errors=True)


@pytest.fixture
def client():
    backend.app.config["TESTING"] = True
    with backend.app.app_context():
        backend.db.drop_all()
        backend.db.create_all()
    return backend.app.test_client()


class FakeChannel:
    """Stands in for a samsungtvws channel, which keeps the token it was issued."""

    def __init__(self, token=None):
        self.token = token

    def close(self):
        pass


# The real class, captured up front: the tests below replace the module attribute.
REAL_SESSION = frame_tv._TVSession


def real_session(ip, *, remote_token=None, art_token=None):
    """A real _TVSession with its channels stubbed, to exercise current_token()."""
    session = REAL_SESSION.__new__(REAL_SESSION)
    session.ip = ip
    session._tv = FakeChannel(remote_token)
    session._art = FakeChannel(art_token) if art_token else None
    return session


def stub_session_factory(**tokens):
    """Stands in for the constructor, so _tv_call gets a session that rotated a token."""
    return lambda ip, token, timeout: real_session(ip, **tokens)


# --- reading the freshest token off a session ---

def test_the_art_channel_token_wins_because_it_is_opened_last():
    session = real_session("192.0.2.80", remote_token="middle", art_token="newest")
    assert session.current_token() == "newest"


def test_the_remote_token_is_used_when_no_art_channel_was_opened():
    session = real_session("192.0.2.81", remote_token="rotated")
    assert session.current_token() == "rotated"


# --- handing it on ---

def test_a_rotated_token_is_reported_once(monkeypatch):
    seen = []
    monkeypatch.setattr(
        frame_tv, "_TVSession",
        stub_session_factory(remote_token="fresh"),
    )
    frame_tv.set_token_observer(lambda ip, token: seen.append((ip, token)))
    try:
        frame_tv._tv_call("192.0.2.82", "testing", lambda s: "ok", token="stale", open_remote=False)
    finally:
        frame_tv.set_token_observer(None)

    assert seen == [("192.0.2.82", "fresh")]


def test_an_unchanged_token_is_not_reported(monkeypatch):
    seen = []
    monkeypatch.setattr(
        frame_tv, "_TVSession",
        stub_session_factory(remote_token="same"),
    )
    frame_tv.set_token_observer(lambda ip, token: seen.append((ip, token)))
    try:
        frame_tv._tv_call("192.0.2.83", "testing", lambda s: "ok", token="same", open_remote=False)
    finally:
        frame_tv.set_token_observer(None)

    assert seen == [], "nothing changed, so there is nothing to write"


def test_a_token_issued_before_a_failure_is_still_kept(monkeypatch):
    """It arrives during the handshake, so a call that dies later still learned it."""
    seen = []
    monkeypatch.setattr(
        frame_tv, "_TVSession",
        stub_session_factory(remote_token="fresh"),
    )
    frame_tv.set_token_observer(lambda ip, token: seen.append((ip, token)))

    def blow_up(_session):
        raise OSError("the TV hung up after issuing the token")

    try:
        with pytest.raises(frame_tv.FrameTVConnectionError):
            frame_tv._tv_call("192.0.2.84", "testing", blow_up, token="stale", open_remote=False)
    finally:
        frame_tv.set_token_observer(None)

    assert seen == [("192.0.2.84", "fresh")]


# --- and it reaches the database ---

def test_the_new_token_is_written_to_the_tv_row(client):
    with backend.app.app_context():
        backend.db.session.add(backend.TV(ip="192.0.2.85", name="TV", token="stale"))
        backend.db.session.commit()

    backend._remember_tv_token("192.0.2.85", "fresh")

    with backend.app.app_context():
        assert backend.TV.query.filter_by(ip="192.0.2.85").first().token == "fresh"


def test_a_token_for_an_unknown_tv_is_ignored(client):
    backend._remember_tv_token("192.0.2.86", "fresh")  # must not raise
