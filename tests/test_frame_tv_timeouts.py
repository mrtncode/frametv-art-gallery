"""Checks that a TV which stops answering cannot block a request forever.

samsungtvws waits on recv() without an overall timeout, so utils.frame_tv wraps every
TV call in a deadline. These tests exercise that wrapper without touching the network:
`open_remote=False` skips the handshake and the action stands in for a stuck read.

Run with: pytest tests/test_frame_tv_timeouts.py
"""

import shutil
import threading
import time

import pytest

from utils import frame_tv
from utils.frame_tv import FrameTVConnectionError, FrameTVTimeoutError

# Long enough to outlive the deadlines below, short enough that the worker threads are
# gone before the interpreter shuts down.
STUCK = 3


@pytest.fixture(autouse=True)
def clear_cooldowns():
    shutil.rmtree(frame_tv.TV_DOWN_DIR, ignore_errors=True)
    yield
    shutil.rmtree(frame_tv.TV_DOWN_DIR, ignore_errors=True)


def test_stuck_call_gives_up_at_the_deadline():
    started = time.monotonic()
    with pytest.raises(FrameTVTimeoutError):
        frame_tv._tv_call(
            "192.0.2.1",
            "testing",
            lambda session: time.sleep(STUCK),
            deadline=1,
            open_remote=False,
        )
    assert time.monotonic() - started < STUCK, "the call outlived its deadline"


def test_expired_call_closes_the_session(monkeypatch):
    """Closing the sockets is what releases the read blocking the worker thread."""
    closed = threading.Event()
    original_close = frame_tv._TVSession.close

    def spy(self):
        closed.set()
        original_close(self)

    monkeypatch.setattr(frame_tv._TVSession, "close", spy)

    with pytest.raises(FrameTVTimeoutError):
        frame_tv._tv_call(
            "192.0.2.2", "testing", lambda session: time.sleep(STUCK), deadline=1, open_remote=False
        )
    assert closed.is_set(), "the sockets were left open, so the stuck read is never released"


def test_unresponsive_tv_is_skipped_during_the_cooldown():
    """The second call must fail immediately instead of hanging like the first."""
    with pytest.raises(FrameTVTimeoutError):
        frame_tv._tv_call(
            "192.0.2.3", "testing", lambda session: time.sleep(STUCK), deadline=1, open_remote=False
        )

    calls = []
    started = time.monotonic()
    with pytest.raises(FrameTVConnectionError):
        frame_tv._tv_call("192.0.2.3", "testing", lambda session: calls.append(1), open_remote=False)
    assert calls == [], "the TV should not have been contacted during the cooldown"
    assert time.monotonic() - started < 1

    # ...and another TV is unaffected by its neighbour being down.
    assert frame_tv._tv_call("192.0.2.4", "testing", lambda session: "fine", open_remote=False) == "fine"


def test_a_successful_call_clears_the_cooldown():
    frame_tv._mark_tv_down("192.0.2.5")
    assert frame_tv._tv_cooldown_remaining("192.0.2.5") > 0
    frame_tv._mark_tv_up("192.0.2.5")
    assert frame_tv._tv_cooldown_remaining("192.0.2.5") == 0
    assert frame_tv._tv_call("192.0.2.5", "testing", lambda session: "ok", open_remote=False) == "ok"


def test_the_cooldown_is_shared_between_processes():
    """gunicorn runs several workers; an in-memory cooldown would only teach one of them."""
    frame_tv._mark_tv_down("192.0.2.8")
    marker = frame_tv._tv_down_marker("192.0.2.8")
    assert marker.is_file(), "the cooldown must survive outside this process"
    assert frame_tv.TV_DOWN_DIR in marker.parents

    # A separate reader of the same directory sees the TV as down.
    assert frame_tv._tv_cooldown_remaining("192.0.2.8") > 0
    marker.unlink()
    assert frame_tv._tv_cooldown_remaining("192.0.2.8") == 0


def test_tv_errors_are_not_swallowed_as_connection_errors():
    """A TV that answers "no" must stay distinguishable from a TV that does not answer."""

    class TVSaidNo(Exception):
        pass

    def refuse(session):
        raise TVSaidNo("bad content id")

    with pytest.raises(TVSaidNo):
        frame_tv._tv_call("192.0.2.6", "testing", refuse, open_remote=False)
    assert frame_tv._tv_cooldown_remaining("192.0.2.6") == 0, "the TV is alive, do not skip it"

    def unreachable(session):
        raise OSError("connection refused")

    with pytest.raises(FrameTVConnectionError):
        frame_tv._tv_call("192.0.2.7", "testing", unreachable, open_remote=False)
    assert frame_tv._tv_cooldown_remaining("192.0.2.7") > 0
