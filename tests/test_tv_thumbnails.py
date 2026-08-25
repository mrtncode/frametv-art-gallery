"""Covers how a page of TV thumbnails is fetched.

The TV streams every thumbnail of one request down a single D2D socket before the
call returns, so asking for a whole gallery at once is one long transfer that is lost
in full if it does not finish. These tests pin the batching that replaced it.

Run with: pytest tests/test_tv_thumbnails.py
"""

import shutil
import time

import pytest

from utils import frame_tv


@pytest.fixture(autouse=True)
def clean_caches():
    frame_tv._CACHE.clear()
    frame_tv._NO_THUMBNAIL.clear()
    shutil.rmtree(frame_tv.TV_THUMB_DIR, ignore_errors=True)
    frame_tv.TV_THUMB_DIR.mkdir(parents=True, exist_ok=True)
    yield
    frame_tv._CACHE.clear()
    shutil.rmtree(frame_tv.TV_THUMB_DIR, ignore_errors=True)
    frame_tv.TV_THUMB_DIR.mkdir(parents=True, exist_ok=True)


class FakeArt:
    """Answers like samsungtvws does: keyed `fileID.fileType`, not by content id.

    `unservable` are ids the set will not preview. Asking for one takes its whole batch
    down, which is what a real Frame TV does — it closes the socket rather than leaving
    the entry out. `dies_after` stands in for a set that stops talking mid-gallery.
    """

    def __init__(self, unservable=(), dies_after=None, suffix=".jpg"):
        self.unservable = set(unservable)
        self.dies_after = dies_after
        self.suffix = suffix
        self.requests = []
        self.singles = []
        self.served = 0

    def __repr__(self):
        return f"FakeArt(requests={self.requests}, singles={self.singles})"

    def _check_alive(self):
        if self.dies_after is not None and self.served >= self.dies_after:
            raise OSError("the TV stopped answering")

    def get_thumbnail_list(self, content_ids):
        self.requests.append(list(content_ids))
        self._check_alive()
        if self.unservable.intersection(content_ids):
            raise ConnectionError({"reason": "socket closed"})
        self.served += len(content_ids)
        return {
            f"{cid}{self.suffix}": bytearray(b"jpeg-" + cid.encode()) for cid in content_ids
        }

    def get_thumbnail(self, content_id):
        self.singles.append(content_id)
        self._check_alive()
        if content_id in self.unservable:
            raise ConnectionError({"reason": "socket closed"})
        self.served += 1
        return bytearray(b"single-" + content_id.encode())


def test_a_thumbnail_is_filed_under_its_content_id():
    """The TV labels each file `fileID.fileType`; the gallery looks up the bare id."""
    art = FakeArt()

    found = frame_tv._collect_thumbnails(art, "192.0.2.33", ["MY_F0440", "MY_F0469"])

    assert set(found) == {"MY_F0440", "MY_F0469"}, "keys must be content ids, not filenames"
    assert frame_tv._cached_thumbnail("192.0.2.33", "MY_F0440") == b"jpeg-MY_F0440"


def test_an_answer_that_matches_nothing_asked_for_is_dropped():
    art = FakeArt(suffix="")
    art.get_thumbnail_list = lambda ids: {"SOMETHING_ELSE.jpg": bytearray(b"x")}
    art.get_thumbnail = lambda cid: None

    assert frame_tv._collect_thumbnails(art, "192.0.2.34", ["MY_F0440"]) == {}


def test_one_unservable_image_does_not_cost_the_rest_of_its_batch():
    """The TV closes the socket on the whole request, so the batch is retried singly.

    Observed on a real set: `stopped answering after 0 of 2`, both entries blank, while
    the same images answered one at a time.
    """
    art = FakeArt(unservable={"MY_F0471"})
    wanted = ["MY_F0473", "MY_F0472", "MY_F0471"]

    found = frame_tv._collect_thumbnails(art, "192.0.2.35", wanted)

    assert set(found) == {"MY_F0473", "MY_F0472"}, "the batch must not take its neighbours down"
    assert sorted(art.singles) == sorted(wanted), "every id of the refused batch is retried"


def test_an_image_the_tv_will_not_preview_is_not_asked_for_again():
    """It answered for the others, so the refusal is about that image. Remember it."""
    art = FakeArt(unservable={"MY_F0471"})
    wanted = ["MY_F0471", "MY_F0473"]

    frame_tv._collect_thumbnails(art, "192.0.2.37", wanted)
    assert frame_tv._known_to_have_no_thumbnail("192.0.2.37", "MY_F0471")

    before = len(art.singles)
    frame_tv._collect_thumbnails(art, "192.0.2.37", wanted)
    assert art.singles[before:] == [], "asked the TV again for a preview it does not have"


def test_a_tv_that_stops_talking_is_not_mistaken_for_missing_previews():
    """Otherwise one power-off blanks the gallery for an hour."""
    art = FakeArt(dies_after=frame_tv.TV_THUMBNAIL_BATCH)
    wanted = [f"C{n}" for n in range(20)]

    frame_tv._collect_thumbnails(art, "192.0.2.39", wanted)

    unanswered = [cid for cid in wanted if frame_tv._cached_thumbnail("192.0.2.39", cid) is None]
    assert unanswered, "the set died halfway, so some are still missing"
    for cid in unanswered:
        assert not frame_tv._known_to_have_no_thumbnail("192.0.2.39", cid), (
            f"{cid} was written off because the TV went away, not because it has no preview"
        )


def test_a_batch_the_tv_stalls_on_mid_transfer_is_written_off(monkeypatch):
    """The set answered during this very call, then went silent: the batch is poison.

    Observed on a real set (MY_F0510): 4 frames of a D2D transfer arrive, then nothing
    ever again, and the socket stays open — so only the stall watchdog ends the call,
    25s in. Asking again on the next page load would pay the same stall for the same
    nothing.
    """
    art = FakeArt()
    frames = [0]
    clock = [1000.0]
    monkeypatch.setattr(frame_tv.time, "monotonic", lambda: clock[0])

    def stalling_batch(content_ids):
        art.requests.append(list(content_ids))
        frames[0] += 4  # the TV spoke, then stopped; the watchdog cut the call
        clock[0] += frame_tv.TV_STALL_TIMEOUT + 5
        raise ConnectionError({"reason": "socket closed"})

    art.get_thumbnail_list = stalling_batch

    found = frame_tv._collect_thumbnails(
        art, "192.0.2.42", ["MY_F0510"], frames_received=lambda: frames[0]
    )

    assert found == {}
    assert frame_tv._known_to_have_no_thumbnail("192.0.2.42", "MY_F0510")
    assert art.singles == [], "a poisoned entry must not be retried one image at a time"

    frame_tv._collect_thumbnails(art, "192.0.2.42", ["MY_F0510"], frames_received=lambda: frames[0])
    assert art.requests == [["MY_F0510"]], "a quarantined entry must not be asked for again"


def test_a_fast_refusal_with_frames_is_still_retried_singly():
    """An error frame then a quick close is a refusal, not a stall: one bad image
    must not write off its whole batch without the one-at-a-time pass."""
    art = FakeArt()
    frames = [0]

    def refusing_batch(content_ids):
        art.requests.append(list(content_ids))
        frames[0] += 1  # the TV answered at once — with an error
        raise ConnectionError({"reason": "socket closed"})

    art.get_thumbnail_list = refusing_batch
    art.get_thumbnail = lambda cid: bytearray(b"single-" + cid.encode())

    found = frame_tv._collect_thumbnails(
        art, "192.0.2.44", ["MY_F0510", "MY_F0511"], frames_received=lambda: frames[0]
    )

    assert set(found) == {"MY_F0510", "MY_F0511"}, "the singles pass must still run"
    assert not frame_tv._known_to_have_no_thumbnail("192.0.2.44", "MY_F0510")


def test_a_batch_refused_in_total_silence_is_not_written_off():
    """No frame at all during the call means the TV itself went away, not the image."""
    art = FakeArt(unservable={"MY_F0510"})

    frame_tv._collect_thumbnails(
        art, "192.0.2.43", ["MY_F0510"], frames_received=lambda: 0
    )

    assert not frame_tv._known_to_have_no_thumbnail("192.0.2.43", "MY_F0510")


def test_the_tv_is_asked_again_once_the_answer_has_aged():
    """A firmware that starts answering should be picked up without a restart."""
    art = FakeArt(unservable={"MY_F0471"})
    frame_tv._collect_thumbnails(art, "192.0.2.38", ["MY_F0471", "MY_F0473"])
    assert frame_tv._known_to_have_no_thumbnail("192.0.2.38", "MY_F0471")

    frame_tv._NO_THUMBNAIL[("192.0.2.38", "MY_F0471")] -= frame_tv._NO_THUMBNAIL_TTL + 1
    assert not frame_tv._known_to_have_no_thumbnail("192.0.2.38", "MY_F0471")


def test_thumbnails_are_asked_for_in_batches():
    art = FakeArt()
    wanted = [f"C{n}" for n in range(20)]

    found = frame_tv._collect_thumbnails(art, "192.0.2.30", wanted)

    assert set(found) == set(wanted)
    assert len(art.requests) > 1, "a whole gallery should not go in one request"
    assert max(len(batch) for batch in art.requests) <= frame_tv.TV_THUMBNAIL_BATCH


def test_what_arrived_before_the_tv_gave_up_is_kept():
    """The point of batching: a set that stops halfway still fills part of the page."""
    art = FakeArt(dies_after=frame_tv.TV_THUMBNAIL_BATCH)
    wanted = [f"C{n}" for n in range(20)]

    found = frame_tv._collect_thumbnails(art, "192.0.2.31", wanted)

    assert 0 < len(found) < len(wanted), "some thumbnails, not all and not none"

    # ...and they are cached, so the next visit resumes rather than starting over.
    for content_id in found:
        assert frame_tv._cached_thumbnail("192.0.2.31", content_id) is not None


def test_the_listing_serves_the_cache_without_calling_the_tv():
    """The gallery listing must come back quickly; the page fetches the rest itself."""
    art = FakeArt()
    frame_tv._thumb_disk_set("192.0.2.32", "CACHED", b"jpeg-cached")

    found = frame_tv._collect_thumbnails(
        art, "192.0.2.32", ["CACHED", "MISSING"], fetch_missing=False
    )

    assert set(found) == {"CACHED"}
    assert art.requests == [], "the listing should not wait on the TV for thumbnails"


def test_a_wall_of_dead_images_stops_the_walk():
    """Each dead image costs a socket timeout, and the TV is locked for the whole walk.

    A page load was holding the set for two minutes working through a gallery that had
    stopped answering, which blocked every other request behind it.
    """
    wanted = [f"C{n}" for n in range(40)]
    art = FakeArt(unservable=set(wanted))

    frame_tv._collect_thumbnails(art, "192.0.2.40", wanted)

    assert len(art.singles) <= frame_tv.TV_THUMBNAIL_GIVE_UP + 1, (
        f"asked {len(art.singles)} dead images one by one instead of giving up"
    )


def test_scattered_unservable_images_do_not_stop_it():
    """Store art sits among ordinary art; a few refusals must not abandon the rest."""
    wanted = [f"C{n}" for n in range(12)]
    art = FakeArt(unservable={"C1", "C5", "C9"})

    found = frame_tv._collect_thumbnails(art, "192.0.2.41", wanted)

    assert set(found) == set(wanted) - {"C1", "C5", "C9"}
    assert len(found) == 9, "everything the TV would serve should still be here"


# --- the listing must not queue behind a slow walk of thumbnails ---

def test_the_listing_is_reused_briefly_so_a_reload_does_not_wait_on_the_tv():
    """Reloading while a thumbnail walk holds the TV used to queue, then fail."""
    calls = []

    def fake_call(ip, description, action, **kwargs):
        calls.append(description)
        return [{"content_id": "C1", "filename": "", "date_added": "", "thumbnail": None}]

    original = frame_tv._tv_call
    frame_tv._tv_call = fake_call
    frame_tv.forget_gallery("192.0.2.50")
    try:
        first = frame_tv.get_tv_gallery_images("192.0.2.50")
        second = frame_tv.get_tv_gallery_images("192.0.2.50")
    finally:
        frame_tv._tv_call = original
        frame_tv.forget_gallery("192.0.2.50")

    assert first == second
    assert len(calls) == 1, "the reload should not have gone to the TV again"


def test_changing_what_is_on_the_tv_drops_the_cached_listing():
    """A delete or an upload has to be visible at once, not up to a TTL later."""
    frame_tv._remember_gallery("192.0.2.51", [{"content_id": "C1"}])
    assert frame_tv._cached_gallery("192.0.2.51") is not None

    frame_tv.forget_gallery("192.0.2.51")
    assert frame_tv._cached_gallery("192.0.2.51") is None


def test_the_cached_listing_expires():
    frame_tv._remember_gallery("192.0.2.52", [{"content_id": "C1"}])
    frame_tv._GALLERY_CACHE["192.0.2.52"] = (
        frame_tv._GALLERY_CACHE["192.0.2.52"][0] - frame_tv.TV_GALLERY_TTL - 1,
        frame_tv._GALLERY_CACHE["192.0.2.52"][1],
    )
    assert frame_tv._cached_gallery("192.0.2.52") is None


def test_a_slow_tv_that_gives_nothing_is_abandoned_mid_batch(monkeypatch):
    """Giving up after a whole batch is not soon enough when each call is slow.

    One art request can run far longer than the socket timeout — samsungtvws reads
    frames until it sees the one it asked for, and each read restarts its own clock.
    A batch is nine such calls, which is how a page load spent its entire two-minute
    budget to return nothing, with the TV's art channel busy throughout. The walk has
    to be cut on the clock, part way through a batch, not only at the end of one.
    """
    monkeypatch.setattr(frame_tv, "TV_THUMBNAIL_FIRST_ANSWER", 0.15)
    class SlowRefusingArt:
        """Dawdles, then declines cleanly — never closing a socket.

        This is the shape that defeats a failure count: nothing looks like a dead
        connection, so the walk would keep going image by image, each one costing real
        time, holding the TV's art channel throughout.
        """

        def __init__(self):
            self.calls = 0

        def get_thumbnail_list(self, content_ids):
            self.calls += 1
            time.sleep(0.05)
            return {}

        def get_thumbnail(self, content_id):
            self.calls += 1
            time.sleep(0.05)
            return None

    art = SlowRefusingArt()
    # One batch: the list call plus one single per image in it.
    calls_in_a_full_batch = 1 + frame_tv.TV_THUMBNAIL_BATCH
    wanted = [f"C{n}" for n in range(frame_tv.TV_THUMBNAIL_BATCH * 4)]

    frame_tv._collect_thumbnails(art, "192.0.2.60", wanted)

    assert art.calls < calls_in_a_full_batch, (
        f"made {art.calls} calls — it saw the batch out instead of stopping on the clock"
    )


def test_a_tv_that_answers_is_given_its_full_run(monkeypatch):
    """The clock only ends the walk while nothing at all has come back.

    The threshold is tight here on purpose: a set that keeps answering has to finish
    its gallery even when the budget for the first answer has long since passed.
    """
    monkeypatch.setattr(frame_tv, "TV_THUMBNAIL_FIRST_ANSWER", 0.2)
    art = FakeArt()
    wanted = [f"C{n}" for n in range(20)]

    found = frame_tv._collect_thumbnails(art, "192.0.2.61", wanted)

    assert set(found) == set(wanted), "a TV that is answering must not be cut off"
