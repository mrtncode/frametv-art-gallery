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

from utils import tv_connection as frame_tv
from utils.tv_connection import (
    FrameTVConnectionError,
    FrameTVTimeoutError,
    FrameTVUnavailableError,
)

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
    with pytest.raises(FrameTVUnavailableError):
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


def test_a_deliberate_action_still_reaches_a_tv_in_cooldown():
    """A failed thumbnail must not stop someone from pressing play on that TV."""
    frame_tv._mark_tv_down("192.0.2.9")

    with pytest.raises(FrameTVUnavailableError):
        frame_tv._tv_call("192.0.2.9", "fetching a thumbnail from", lambda s: "never", open_remote=False)

    assert frame_tv._tv_call(
        "192.0.2.9", "playing an image on", lambda s: "played",
        open_remote=False, skip_when_down=False,
    ) == "played"


def test_one_tv_serves_one_call_at_a_time():
    """Concurrent art channels make a Frame TV reject them, so calls must serialise."""
    overlapping = []
    active = 0
    guard = threading.Lock()

    def slow(_session):
        nonlocal active
        with guard:
            active += 1
            overlapping.append(active)
        time.sleep(0.3)
        with guard:
            active -= 1
        return "done"

    def call():
        frame_tv._tv_call("192.0.2.10", "testing", slow, open_remote=False)

    threads = [threading.Thread(target=call) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert len(overlapping) == 4, "every call should have run"
    assert max(overlapping) == 1, f"calls overlapped on one TV: {overlapping}"


def test_a_second_tv_is_not_held_up_by_the_first():
    started = time.monotonic()
    holder = threading.Thread(
        target=lambda: frame_tv._tv_call(
            "192.0.2.11", "testing", lambda s: time.sleep(1), open_remote=False
        )
    )
    holder.start()
    time.sleep(0.1)
    assert frame_tv._tv_call(
        "192.0.2.12", "testing", lambda s: "free", open_remote=False
    ) == "free"
    assert time.monotonic() - started < 1, "a different TV should not wait"
    holder.join(timeout=10)


def test_a_deliberate_action_queues_behind_a_long_read(monkeypatch):
    """A page of thumbnails holds the TV far longer than one call's deadline.

    The background read gives up as soon as its own budget is gone, so it cannot tie up
    a worker; the deliberate action waits for its turn instead of failing.
    """
    monkeypatch.setattr(frame_tv, "TV_BUSY_WAIT", 5)

    holding = threading.Event()
    holder = threading.Thread(
        target=lambda: frame_tv._tv_call(
            "192.0.2.20",
            "holding",
            lambda s: (holding.set(), time.sleep(0.8)),
            open_remote=False,
            skip_when_down=False,
        )
    )
    holder.start()
    assert holding.wait(timeout=5), "the holder never started"

    with pytest.raises(FrameTVUnavailableError):
        frame_tv._tv_call(
            "192.0.2.20", "reading", lambda s: "never", open_remote=False, deadline=0.2
        )

    assert frame_tv._tv_call(
        "192.0.2.20", "deleting", lambda s: "done", open_remote=False,
        deadline=0.2, skip_when_down=False,
    ) == "done"
    holder.join(timeout=10)


def test_the_unavailable_error_stays_a_connection_error():
    """Existing handlers catch FrameTVConnectionError; the new type must not escape them."""
    assert issubclass(FrameTVUnavailableError, FrameTVConnectionError)


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


# --- reaching a connection that is still being established ---
#
# samsungtvws records the websocket on the channel object only once the handshake has
# succeeded, so close() cannot reach an open() still in progress. utils.frame_tv keeps
# its own handle on every connection the library opens; these tests pin that down.

class _FakeSocket:
    """Stands in for a websocket: reads come from `incoming`, one frame at a time."""

    def __init__(self):
        self.incoming = []

    def recv(self, *args, **kwargs):
        return self.incoming.pop(0) if self.incoming else b""


def test_the_tracker_notes_each_connection_samsungtvws_opens():
    """samsungtvws hands the socket to nobody until its handshake is over."""
    opened = _FakeSocket()
    tracker = frame_tv._ConnectionTracker(
        type("RealModule", (), {"create_connection": staticmethod(lambda *a, **k: opened)})()
    )

    frame_tv._forget_inflight(threading.get_ident())
    try:
        assert tracker.create_connection("wss://example") is opened
        assert frame_tv._INFLIGHT_SOCKETS[threading.get_ident()] is opened
    finally:
        frame_tv._forget_inflight(threading.get_ident())


def test_the_tracker_passes_everything_else_through():
    real = type("RealModule", (), {"WebSocketTimeoutException": ValueError})()
    assert frame_tv._ConnectionTracker(real).WebSocketTimeoutException is ValueError


def test_samsungtvws_is_wired_to_the_tracker():
    from samsungtvws import connection as samsung_connection

    assert isinstance(samsung_connection.websocket, frame_tv._ConnectionTracker), (
        "the library still opens connections this app cannot reach"
    )


def test_a_connection_left_half_open_is_closed_when_the_call_is_abandoned():
    """A worker stuck inside open() holds the one art channel a Frame TV has.

    close() cannot reach it through samsungtvws, which records a websocket only once
    the handshake has finished, so the app keeps its own handle on it.
    """
    closed = threading.Event()

    class FakeConnection:
        def close(self):
            closed.set()

    def stuck_in_open(_session):
        with frame_tv._INFLIGHT_GUARD:
            frame_tv._INFLIGHT_SOCKETS[threading.get_ident()] = FakeConnection()
        time.sleep(STUCK)

    with pytest.raises(FrameTVTimeoutError):
        frame_tv._tv_call("192.0.2.70", "testing", stuck_in_open, deadline=1, open_remote=False)

    assert closed.wait(timeout=2), "the half-open connection was left for the OS to reap"


def test_a_call_that_finishes_leaves_nothing_behind():
    def opens_then_finishes(_session):
        with frame_tv._INFLIGHT_GUARD:
            frame_tv._INFLIGHT_SOCKETS[threading.get_ident()] = object()
        return "done"

    assert frame_tv._tv_call(
        "192.0.2.71", "testing", opens_then_finishes, open_remote=False
    ) == "done"

    assert frame_tv._INFLIGHT_SOCKETS == {}, "a completed call left a connection recorded"


def test_a_connection_left_behind_is_closed_before_the_next_call_starts():
    """Taking the lock means nothing else may talk to that TV, so ghosts can go.

    An abandoned call keeps the set's one art channel busy. Opening a second one while
    it lingers is what a Frame TV answers by refusing both, so the next request clears
    the field before it tries.
    """
    closed = threading.Event()

    class GhostConnection:
        def close(self):
            closed.set()

    def abandoned(_session):
        with frame_tv._INFLIGHT_GUARD:
            frame_tv._INFLIGHT_SOCKETS[threading.get_ident()] = GhostConnection()
            frame_tv._INFLIGHT_TV[threading.get_ident()] = "192.0.2.72"
        time.sleep(STUCK)

    def hold_until_abandoned():
        with pytest.raises(FrameTVTimeoutError):
            frame_tv._tv_call(
                "192.0.2.72", "holding", abandoned, deadline=1, open_remote=False,
            )

    holder = threading.Thread(target=hold_until_abandoned)
    holder.start()
    holder.join(timeout=10)

    # The abandoned worker is still asleep; its connection must not survive into the
    # next call for that TV.
    closed.clear()
    with frame_tv._INFLIGHT_GUARD:
        frame_tv._INFLIGHT_SOCKETS[9_999_999] = GhostConnection()
        frame_tv._INFLIGHT_TV[9_999_999] = "192.0.2.72"

    frame_tv._tv_call(
        "192.0.2.72", "testing", lambda s: "ok", open_remote=False, skip_when_down=False,
    )

    assert closed.is_set(), "a stale connection survived into the next call"


def test_clearing_one_tv_leaves_another_alone():
    class Connection:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    mine, neighbour = Connection(), Connection()
    with frame_tv._INFLIGHT_GUARD:
        frame_tv._INFLIGHT_SOCKETS[1_000_001] = mine
        frame_tv._INFLIGHT_TV[1_000_001] = "192.0.2.73"
        frame_tv._INFLIGHT_SOCKETS[1_000_002] = neighbour
        frame_tv._INFLIGHT_TV[1_000_002] = "192.0.2.74"

    try:
        assert frame_tv.reset_connections("192.0.2.73") == 1
        assert mine.closed and not neighbour.closed
    finally:
        frame_tv._forget_inflight(1_000_001)
        frame_tv._forget_inflight(1_000_002)


# --- the stall watchdog: a call that never comes back ---

def test_the_tracker_observes_reads_and_counts_them_as_progress():
    """A frame arriving mid-call is proof of life the stall watchdog can see."""
    opened = _FakeSocket()
    opened.incoming.append(b"frame-bytes")
    tracker = frame_tv._ConnectionTracker(
        type("RealModule", (), {"create_connection": staticmethod(lambda *a, **k: opened)})()
    )

    thread_id = threading.get_ident()
    pings = []
    frame_tv._forget_inflight(thread_id)
    frame_tv._claim_inflight(thread_id, "192.0.2.70", on_progress=lambda: pings.append(1))
    try:
        connection = tracker.create_connection("wss://example")
        assert connection.recv() == b"frame-bytes"
        assert pings, "a frame from the TV did not count as progress"
        assert frame_tv._TRAFFIC[thread_id] == [1, len(b"frame-bytes")]
        assert "1 frame(s)" in frame_tv._traffic_snapshot(thread_id)
    finally:
        frame_tv._forget_inflight(thread_id)


def test_a_call_that_never_comes_back_is_cut_without_waiting_for_the_deadline():
    """The failure that defeated every guard placed between calls.

    samsungtvws reads frames until it sees the one it asked for, so a single request
    can outlast any budget while nothing around it gets a chance to run. Observed on a
    real set as `open: 0.1s, action: 119.9s` — the connection was fine, one call simply
    never returned.
    """
    closed = threading.Event()

    class StalledConnection:
        def close(self):
            closed.set()

    def never_comes_back(session):
        with frame_tv._INFLIGHT_GUARD:
            frame_tv._INFLIGHT_SOCKETS[threading.get_ident()] = StalledConnection()
            frame_tv._INFLIGHT_TV[threading.get_ident()] = "192.0.2.75"
        # No progress is ever reported: this stands in for one library call that blocks.
        time.sleep(STUCK)
        return "should not matter"

    # Closing the socket is what makes the blocked read raise on a real TV; a stub
    # cannot be interrupted, so what is asserted here is that it was closed at all —
    # and closed on the stall, long before the deadline would have come round.
    started = time.monotonic()
    watcher = threading.Thread(
        target=lambda: frame_tv._tv_call(
            "192.0.2.75", "testing", never_comes_back,
            deadline=STUCK * 10, open_remote=False, stall_timeout=1,
        ),
        daemon=True,
    )
    watcher.start()

    assert closed.wait(timeout=STUCK), "the stalled connection was never closed"
    assert time.monotonic() - started < STUCK, "waited for the deadline instead of the stall"


def test_a_call_that_keeps_reporting_progress_is_left_alone():
    """A slow but working TV must not be cut off by the stall watchdog."""
    def slow_but_alive(session):
        for _ in range(6):
            time.sleep(0.2)
            session.note_progress()
        return "done"

    assert frame_tv._tv_call(
        "192.0.2.76", "testing", slow_but_alive,
        deadline=10, open_remote=False, stall_timeout=1,
    ) == "done"
