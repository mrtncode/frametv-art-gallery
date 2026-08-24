import contextlib
import logging
import os
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import websocket
from samsungtvws import SamsungTVWS
from samsungtvws.exceptions import ConnectionFailure

from const import CONNECTION_NAME

logger = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("Invalid value for %s, falling back to %s", name, default)
        return default


DEFAULT_PORT = 8002
DEFAULT_TIMEOUT = _env_int("FRAME_TV_SOCKET_TIMEOUT", 8)
TV_CALL_DEADLINE = _env_int("FRAME_TV_CALL_DEADLINE", 20)
TV_UPLOAD_DEADLINE = _env_int("FRAME_TV_UPLOAD_DEADLINE", 120)
TV_PAIRING_TIMEOUT = _env_int("FRAME_TV_PAIRING_TIMEOUT", 45)
TV_DOWN_COOLDOWN = _env_int("FRAME_TV_DOWN_COOLDOWN", 30)
TV_BUSY_WAIT = _env_int("FRAME_TV_BUSY_WAIT", 90)


class FrameTVError(Exception):
    """Base exception for Frame TV operations."""


class FrameTVConnectionError(FrameTVError):
    """Exception for connection errors to the Frame TV."""


class FrameTVTimeoutError(FrameTVConnectionError):
    """Exception for timeouts while talking to the Frame TV."""


class FrameTVUnavailableError(FrameTVConnectionError):
    """Raised instead of contacting a TV that just failed during its cooldown."""


class _ConnectionTracker:
    """The websocket module as samsungtvws sees it, noting each connection it opens."""

    def __init__(self, real_module):
        self._real = real_module

    def __getattr__(self, name):
        return getattr(self._real, name)

    def create_connection(self, *args, **kwargs):
        connection = self._real.create_connection(*args, **kwargs)
        thread_id = threading.get_ident()
        real_recv = connection.recv

        def recv(*recv_args, **recv_kwargs):
            data = real_recv(*recv_args, **recv_kwargs)
            _note_traffic(thread_id, data)
            return data

        connection.recv = recv
        with _INFLIGHT_GUARD:
            _INFLIGHT_SOCKETS[thread_id] = connection
        return connection


_INFLIGHT_SOCKETS: Dict[int, Any] = {}
_INFLIGHT_TV: Dict[int, str] = {}
_INFLIGHT_GUARD = threading.Lock()
_TRAFFIC: Dict[int, list[int]] = {}
_INFLIGHT_PROGRESS: Dict[int, Callable[[], None]] = {}


def _note_traffic(thread_id: int, data) -> None:
    with _INFLIGHT_GUARD:
        traffic = _TRAFFIC.get(thread_id)
        if traffic is not None:
            traffic[0] += 1
            traffic[1] += len(data) if data else 0
        hook = _INFLIGHT_PROGRESS.get(thread_id)
    if hook is not None:
        hook()


def _traffic_snapshot(thread_id: int) -> str:
    with _INFLIGHT_GUARD:
        traffic = _TRAFFIC.get(thread_id)
    if traffic is None:
        return "no traffic recorded"
    return f"{traffic[0]} frame(s), {traffic[1]} byte(s) received"


def _traffic_frames(thread_id: int) -> int:
    with _INFLIGHT_GUARD:
        traffic = _TRAFFIC.get(thread_id)
    return traffic[0] if traffic is not None else 0


def _install_connection_tracker() -> None:
    from samsungtvws import connection as samsung_connection

    if not isinstance(samsung_connection.websocket, _ConnectionTracker):
        samsung_connection.websocket = _ConnectionTracker(samsung_connection.websocket)


def _forget_inflight(thread_id: int) -> None:
    with _INFLIGHT_GUARD:
        _INFLIGHT_SOCKETS.pop(thread_id, None)
        _INFLIGHT_TV.pop(thread_id, None)
        _INFLIGHT_PROGRESS.pop(thread_id, None)
        _TRAFFIC.pop(thread_id, None)


def _claim_inflight(thread_id: int, ip: str, on_progress: Optional[Callable[[], None]] = None) -> None:
    with _INFLIGHT_GUARD:
        _INFLIGHT_TV[thread_id] = ip
        _TRAFFIC[thread_id] = [0, 0]
        if on_progress is not None:
            _INFLIGHT_PROGRESS[thread_id] = on_progress


def _close_inflight(thread_id: int) -> bool:
    with _INFLIGHT_GUARD:
        connection = _INFLIGHT_SOCKETS.pop(thread_id, None)
    if connection is None:
        return False
    try:
        connection.close()
    except Exception:
        logger.debug("Error closing an in-flight connection", exc_info=True)
    return True


def _safe_ip(ip: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-._" else "_" for ch in ip)


_DATA_DIR = Path(os.environ.get("FRAME_TV_DATA", "data"))
if not _DATA_DIR.is_absolute():
    _DATA_DIR = PROJECT_ROOT.joinpath(_DATA_DIR)
TV_DOWN_DIR = _DATA_DIR.joinpath("instance", "tv_down")
TV_LOCK_DIR = _DATA_DIR.joinpath("instance", "tv_locks")


def configure_data_dirs(data_dir) -> None:
    """Set the shared marker and lock directories used by connection management."""
    global TV_DOWN_DIR, TV_LOCK_DIR
    TV_DOWN_DIR = data_dir.joinpath("instance", "tv_down")
    TV_LOCK_DIR = data_dir.joinpath("instance", "tv_locks")


def _tv_down_marker(ip: str):
    return TV_DOWN_DIR.joinpath(f"tv-{_safe_ip(ip)}")


def _tv_cooldown_remaining(ip: str) -> float:
    try:
        failed_at = _tv_down_marker(ip).stat().st_mtime
    except OSError:
        return 0.0
    return max(0.0, TV_DOWN_COOLDOWN - (time.time() - failed_at))


def _mark_tv_down(ip: str) -> None:
    try:
        TV_DOWN_DIR.mkdir(parents=True, exist_ok=True)
        _tv_down_marker(ip).touch()
    except OSError:
        logger.debug("Could not record TV %s as unreachable", ip, exc_info=True)


def _mark_tv_up(ip: str) -> None:
    try:
        _tv_down_marker(ip).unlink()
    except OSError:
        pass


try:
    import fcntl
except ImportError:  # pragma: no cover - Windows development
    fcntl = None


_LOCAL_TV_LOCKS: Dict[str, threading.Lock] = {}
_LOCAL_TV_LOCKS_GUARD = threading.Lock()


def _local_tv_lock(ip: str) -> threading.Lock:
    with _LOCAL_TV_LOCKS_GUARD:
        lock = _LOCAL_TV_LOCKS.get(ip)
        if lock is None:
            lock = threading.Lock()
            _LOCAL_TV_LOCKS[ip] = lock
        return lock


@contextlib.contextmanager
def _tv_exclusive(ip: str, wait: float):
    give_up_at = time.monotonic() + wait
    busy = FrameTVUnavailableError(
        f"TV {ip} stayed busy with another request for more than {wait:.0f}s"
    )
    local = _local_tv_lock(ip)
    if not local.acquire(timeout=max(0.0, wait)):
        raise busy
    handle = None
    try:
        if fcntl is not None:
            TV_LOCK_DIR.mkdir(parents=True, exist_ok=True)
            handle = open(TV_LOCK_DIR.joinpath(f"tv-{_safe_ip(ip)}"), "w")
            while True:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    if time.monotonic() >= give_up_at:
                        raise busy
                    time.sleep(0.1)
        yield
    finally:
        if handle is not None:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
            handle.close()
        local.release()


def reset_connections(ip: str) -> int:
    with _INFLIGHT_GUARD:
        stale = [tid for tid, owner in _INFLIGHT_TV.items() if owner == ip]
        connections = [(tid, _INFLIGHT_SOCKETS.pop(tid, None)) for tid in stale]
    closed = 0
    for _, connection in connections:
        if connection is None:
            continue
        try:
            connection.close()
            closed += 1
        except Exception:
            logger.debug("Error closing a stale connection to TV %s", ip, exc_info=True)
    return closed


class _TVSession:
    """Owns the remote and art channels for one exclusive TV operation."""

    def __init__(self, ip: str, token: Optional[str], timeout: int):
        self.ip = ip
        self._tv = SamsungTVWS(
            host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME, timeout=timeout
        )
        self._art = None
        self._worker_thread_id: Optional[int] = None
        self._last_progress = time.monotonic()
        self._context = ""

    def note_progress(self) -> None:
        self._last_progress = time.monotonic()

    def note_context(self, description: str) -> None:
        self._context = description

    def describe_traffic(self) -> str:
        if self._worker_thread_id is None:
            return "no traffic recorded"
        return _traffic_snapshot(self._worker_thread_id)

    def frames_received(self) -> int:
        if self._worker_thread_id is None:
            return 0
        return _traffic_frames(self._worker_thread_id)

    def idle_for(self) -> float:
        return time.monotonic() - self._last_progress

    def claim_worker(self) -> None:
        self._worker_thread_id = threading.get_ident()
        _claim_inflight(self._worker_thread_id, self.ip, on_progress=self.note_progress)

    def release_worker(self) -> None:
        if self._worker_thread_id is not None:
            _forget_inflight(self._worker_thread_id)

    @property
    def tv(self) -> SamsungTVWS:
        return self._tv

    def art(self):
        if self._art is None:
            self._art = self._tv.art()
        return self._art

    def current_token(self) -> Optional[str]:
        for channel in (self._art, self._tv):
            token = getattr(channel, "token", None)
            if token:
                return str(token)
        return None

    def close(self) -> None:
        for channel in (self._art, self._tv):
            if channel is not None:
                try:
                    channel.close()
                except Exception:
                    logger.debug("Error closing channel for TV %s", self.ip, exc_info=True)
        if self._worker_thread_id is not None:
            _close_inflight(self._worker_thread_id)


_TV_EXECUTOR = ThreadPoolExecutor(
    max_workers=_env_int("FRAME_TV_MAX_PARALLEL_CALLS", 8), thread_name_prefix="frametv"
)
_token_observer: Optional[Callable[[str, str], None]] = None


def set_token_observer(observer: Optional[Callable[[str, str], None]]) -> None:
    global _token_observer
    _token_observer = observer


def _is_timeout_error(err: Exception) -> bool:
    return (
        isinstance(err, (TimeoutError, socket.timeout))
        or getattr(err, "winerror", None) == 10060
        or "10060" in str(err)
        or "timed out" in str(err).lower()
    )


def _is_connection_error(err: Exception) -> bool:
    return isinstance(
        err, (OSError, ConnectionFailure, FrameTVConnectionError, websocket.WebSocketException)
    ) or _is_timeout_error(err)


def _raise_tv_connection_error(ip: str, action_description: str, err: Exception) -> None:
    if _is_timeout_error(err):
        raise FrameTVTimeoutError(f"Timeout while {action_description} TV {ip}") from err
    raise FrameTVConnectionError(f"Error while {action_description} TV {ip}") from err


def _tv_call(ip, action_description, action, *, token=None, deadline=None,
             open_remote=True, skip_when_down=True, stall_timeout=None,
             session_factory=None, busy_wait=None):
    if deadline is None:
        deadline = TV_CALL_DEADLINE
    if session_factory is None:
        session_factory = _TVSession
    cooldown = _tv_cooldown_remaining(ip) if skip_when_down else 0
    if cooldown > 0:
        raise FrameTVUnavailableError(
            f"TV {ip} did not answer recently; skipping {action_description} it for another {cooldown:.0f}s"
        )
    wait = deadline if skip_when_down else (busy_wait if busy_wait is not None else TV_BUSY_WAIT)
    with _tv_exclusive(ip, wait=wait):
        reset_connections(ip)
        session = session_factory(ip, token, DEFAULT_TIMEOUT)
        phases: Dict[str, float] = {}

        def run():
            session.claim_worker()
            started = time.monotonic()
            try:
                if open_remote:
                    session.tv.open()
                phases["open"] = time.monotonic() - started
                acting = time.monotonic()
                try:
                    return action(session)
                finally:
                    phases["action"] = time.monotonic() - acting
            finally:
                session.release_worker()

        def keep_any_new_token():
            if _token_observer is None:
                return
            fresh = session.current_token()
            if fresh and fresh != token:
                try:
                    _token_observer(ip, fresh)
                except Exception:
                    logger.warning("Could not hand on the new token for TV %s", ip, exc_info=True)

        finished = threading.Event()
        if stall_timeout:
            def watch_for_a_stall():
                while not finished.wait(1):
                    idle = session.idle_for()
                    if idle >= stall_timeout:
                        logger.warning("TV %s sent nothing for %.0fs while %s; closing the connection (%s)",
                                       ip, idle, action_description, session.describe_traffic())
                        session.close()
                        return

            threading.Thread(target=watch_for_a_stall, name="frametv-stall", daemon=True).start()

        future = _TV_EXECUTOR.submit(run)
        try:
            try:
                result = future.result(timeout=deadline)
            finally:
                finished.set()
        except FutureTimeoutError as err:
            if not future.cancel():
                session.close()
            keep_any_new_token()
            _mark_tv_down(ip)
            logger.warning("TV %s timed out %s", ip, action_description)
            raise FrameTVTimeoutError(
                f"Timeout after {deadline}s while {action_description} TV {ip}"
            ) from err
        except Exception as err:
            session.close()
            keep_any_new_token()
            if _is_connection_error(err):
                _mark_tv_down(ip)
                _raise_tv_connection_error(ip, action_description, err)
            raise
        _mark_tv_up(ip)
        keep_any_new_token()
        session.close()
        return result


_install_connection_tracker()