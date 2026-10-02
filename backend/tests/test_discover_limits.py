"""Covers the per-host request budgets and cooldowns that keep us on good terms with sources.

Run with: pytest tests/test_discover_limits.py
"""

import threading

import pytest
from discover_fakes import FakeNet, FakeResponse

from utils.discover import limits
from utils.discover.common import DiscoverError, http_get
from utils.discover.limits import BUDGETS, MAX_COOLDOWN, Limiter

HOST = "limited.test"


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    fake = Clock()
    monkeypatch.setattr(limits.time, "time", fake)
    return fake


@pytest.fixture
def host(monkeypatch):
    # 3 requests a minute; the first cooldown is 10 seconds.
    monkeypatch.setitem(BUDGETS, HOST, (3, 60, 10))
    return HOST


def test_requests_beyond_the_budget_are_refused_until_the_window_passes(host, clock):
    for _ in range(3):
        Limiter.acquire(host)

    with pytest.raises(DiscoverError) as refused:
        Limiter.acquire(host)
    assert refused.value.status == 429 and refused.value.retry_after == 60

    clock.now += 61
    Limiter.acquire(host)  # the old requests have aged out


def test_a_host_that_pushes_back_is_rested_for_longer_each_time(host, clock):
    Limiter.trip(host)
    with pytest.raises(DiscoverError) as resting:
        Limiter.acquire(host)
    assert resting.value.retry_after == 10 and "resting" in str(resting.value)

    clock.now += 11
    Limiter.acquire(host)            # the first rest is over
    Limiter.trip(host)               # ...and it complains again
    with pytest.raises(DiscoverError) as longer:
        Limiter.acquire(host)
    assert longer.value.retry_after == 20


def test_the_rest_is_capped(host, clock):
    for _ in range(20):
        Limiter.trip(host)

    with pytest.raises(DiscoverError) as resting:
        Limiter.acquire(host)

    assert resting.value.retry_after == MAX_COOLDOWN


def test_a_good_answer_after_a_rest_forgives_the_past(host, clock):
    Limiter.trip(host)
    Limiter.trip(host)               # second strike: a 20 second rest
    clock.now += 21
    Limiter.acquire(host)
    Limiter.success(host)
    Limiter.trip(host)               # a fresh strike starts from the first rest again

    with pytest.raises(DiscoverError) as resting:
        Limiter.acquire(host)
    assert resting.value.retry_after == 10


def test_a_good_answer_during_a_rest_does_not_end_it_early(host, clock):
    Limiter.trip(host)
    Limiter.success(host)

    with pytest.raises(DiscoverError):
        Limiter.acquire(host)


def test_status_reports_ok_busy_and_resting(host, clock):
    assert Limiter.status([HOST])["state"] == "ok"
    for _ in range(3):
        Limiter.acquire(host)
    busy = Limiter.status([HOST])
    assert busy["state"] == "busy" and busy["used"] == 3 and busy["max"] == 3 and busy["retry_after"] == 60

    clock.now += 61
    Limiter.trip(host)
    resting = Limiter.status([HOST])
    assert resting["state"] == "resting" and resting["retry_after"] == 10


def test_hosts_are_limited_independently(host, clock, monkeypatch):
    monkeypatch.setitem(BUDGETS, "other.test", (3, 60, 10))
    Limiter.trip(host)

    Limiter.acquire("other.test")  # unaffected
    assert Limiter.status(["other.test", HOST])["state"] == "resting"  # the worst one is reported


def test_a_host_without_a_budget_is_never_limited(clock):
    for _ in range(1000):
        Limiter.acquire("unlisted.test")
    Limiter.trip("unlisted.test")
    Limiter.acquire("unlisted.test")


def test_nothing_is_limited_before_it_is_configured(host, monkeypatch):
    monkeypatch.setattr(Limiter, "directory", None)

    for _ in range(10):
        Limiter.acquire(host)
    assert Limiter.status([HOST])["state"] == "ok"


def test_the_budget_holds_when_many_threads_ask_at_once(host):
    monkeypatch_budget = (5, 60, 10)
    BUDGETS[HOST] = monkeypatch_budget
    outcomes = []

    def ask():
        try:
            Limiter.acquire(HOST)
            outcomes.append("ok")
        except DiscoverError:
            outcomes.append("refused")

    threads = [threading.Thread(target=ask) for _ in range(12)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert outcomes.count("ok") == 5 and outcomes.count("refused") == 7


def test_a_403_or_429_from_a_source_rests_it_without_asking_again(monkeypatch):
    net = FakeNet().install(monkeypatch)
    net.add("collectionapi.metmuseum.org", FakeResponse(status=403))
    url = "https://collectionapi.metmuseum.org/public/collection/v1/objects/1"

    with pytest.raises(DiscoverError) as first:
        http_get(url)
    assert first.value.status == 429
    calls_after_first = len(net.calls)

    with pytest.raises(DiscoverError) as second:
        http_get(url)

    assert len(net.calls) == calls_after_first, "a resting source must not be contacted"
    assert second.value.retry_after and "resting" in str(second.value)


def test_a_normal_404_does_not_rest_a_source(monkeypatch):
    net = FakeNet().install(monkeypatch)
    net.add("api.smk.dk", FakeResponse(status=404))

    for _ in range(3):
        with pytest.raises(DiscoverError) as missing:
            http_get("https://api.smk.dk/api/v1/art/?object_number=nope")
        assert missing.value.status == 404

    assert Limiter.status(["api.smk.dk"])["state"] == "ok"
