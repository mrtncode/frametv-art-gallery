"""Per-host request budgets, and cooldowns for hosts that ask us to slow down.

Several gunicorn worker processes share one budget per host, so the numbers live in small
JSON files guarded by a file lock. Without a configured directory (as in tests) nothing is
limited.

Two protections:
* A budget: at most N requests per window to a host, kept below what the host documents.
* A cooldown: when a host answers 403 or 429 (the Met's firewall does this when it dislikes
  our traffic), stop calling it for a while, doubling each time it happens again. That keeps
  one unhappy host from being hammered, and from getting us blocked for longer.
"""

import json
import math
import os
import threading
import time
from contextlib import contextmanager

from .errors import DiscoverError

try:  # POSIX
    import fcntl
except ImportError:  # the Windows desktop build
    fcntl = None
    try:
        import msvcrt
    except ImportError:
        msvcrt = None

# host: (requests, per seconds, first cooldown seconds)
BUDGETS = {
    "api.artic.edu": (40, 60, 120),               # documented: 60 a minute per IP
    "www.artic.edu": (40, 60, 120),               # its image server
    "collectionapi.metmuseum.org": (100, 60, 300),  # documented 80/s, but bursts get blocked
    "openaccess-api.clevelandart.org": (60, 60, 60),
    "api.smk.dk": (60, 60, 60),
    "commons.wikimedia.org": (60, 60, 120),
    "www.reframed.gallery": (30, 60, 300),         # no API: a polite reader of public pages
}
MAX_COOLDOWN = 1800
_thread_lock = threading.Lock()


def _blank():
    return {"hits": [], "cooldown_until": 0.0, "strikes": 0}


class Limiter:
    directory = None

    @classmethod
    def _enabled(cls, host):
        return bool(cls.directory) and host in BUDGETS

    @classmethod
    @contextmanager
    def _state(cls, host):
        """The host's state, locked against other threads and processes, saved on exit."""
        os.makedirs(cls.directory, exist_ok=True)
        path = os.path.join(cls.directory, f"limit_{host}.json")
        with _thread_lock, open(path + ".lock", "a+") as lock:
            if fcntl:
                fcntl.flock(lock, fcntl.LOCK_EX)
            elif msvcrt:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            try:
                try:
                    with open(path, encoding="utf-8") as handle:
                        state = {**_blank(), **json.load(handle)}
                except (OSError, ValueError):
                    state = _blank()
                try:
                    yield state
                finally:
                    temp = f"{path}.{os.getpid()}.tmp"
                    with open(temp, "w", encoding="utf-8") as handle:
                        json.dump(state, handle)
                    os.replace(temp, path)
            finally:
                if fcntl:
                    fcntl.flock(lock, fcntl.LOCK_UN)
                elif msvcrt:
                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)

    @classmethod
    def acquire(cls, host):
        """Count a request to host, or refuse it if the host is resting or over budget."""
        if not cls._enabled(host):
            return
        limit, window, _ = BUDGETS[host]
        now = time.time()
        with cls._state(host) as state:
            if state["cooldown_until"] > now:
                wait = math.ceil(state["cooldown_until"] - now)
                raise DiscoverError(
                    f"{host} asked us to slow down, so it is resting. Try again in about {max(1, round(wait / 60))} min.",
                    429,
                    retry_after=wait,
                )
            state["hits"] = [t for t in state["hits"] if now - t < window]
            if len(state["hits"]) >= limit:
                wait = math.ceil(window - (now - state["hits"][0]))
                raise DiscoverError(
                    f"Too many requests to {host} just now. Try again in {wait} s.", 429, retry_after=wait
                )
            state["hits"].append(now)

    @classmethod
    def trip(cls, host):
        """The host pushed back: rest it, for longer each time it happens again."""
        if not cls._enabled(host):
            return
        _, _, first = BUDGETS[host]
        with cls._state(host) as state:
            state["strikes"] += 1
            state["cooldown_until"] = time.time() + min(first * 2 ** (state["strikes"] - 1), MAX_COOLDOWN)

    @classmethod
    def success(cls, host):
        """An answer after a cooldown ends puts the host back in good standing."""
        if not cls._enabled(host):
            return
        with cls._state(host) as state:
            if state["strikes"] and state["cooldown_until"] <= time.time():
                state["strikes"] = 0

    @classmethod
    def status(cls, hosts):
        """The worst state across hosts: ok, busy (budget used up) or resting (cooling down)."""
        worst = {"state": "ok", "retry_after": 0, "used": 0, "max": 0}
        now = time.time()
        for host in hosts:
            if not cls._enabled(host):
                continue
            limit, window, _ = BUDGETS[host]
            with cls._state(host) as state:
                used = len([t for t in state["hits"] if now - t < window])
                oldest = min((t for t in state["hits"] if now - t < window), default=now)
                if state["cooldown_until"] > now:
                    current = {"state": "resting", "retry_after": math.ceil(state["cooldown_until"] - now)}
                elif used >= limit:
                    current = {"state": "busy", "retry_after": math.ceil(window - (now - oldest))}
                else:
                    current = {"state": "ok", "retry_after": 0}
            rank = {"ok": 0, "busy": 1, "resting": 2}
            if rank[current["state"]] > rank[worst["state"]]:
                worst = {**worst, **current}
            worst["used"], worst["max"] = max(worst["used"], used), max(worst["max"], limit)
        return worst
