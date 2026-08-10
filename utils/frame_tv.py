import socket
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Any, Callable, Dict, List, Optional
import base64
import websocket
from samsungtvws import SamsungTVWS
from samsungtvws.exceptions import ConnectionFailure
from const import CONNECTION_NAME
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("Invalid value for %s, falling back to %s", name, default)
        return default


DEFAULT_PORT = 8002
# Socket-level timeout handed to samsungtvws (covers connect and single reads).
DEFAULT_TIMEOUT = _env_int("FRAME_TV_SOCKET_TIMEOUT", 8)
# Wall-clock cap for a whole TV operation, see _tv_call().
TV_CALL_DEADLINE = _env_int("FRAME_TV_CALL_DEADLINE", 20)
# Uploads push the whole image over the websocket, so they get a longer budget.
TV_UPLOAD_DEADLINE = _env_int("FRAME_TV_UPLOAD_DEADLINE", 120)
# Pairing waits for someone to accept the prompt on the TV, so it needs room too.
TV_PAIRING_TIMEOUT = _env_int("FRAME_TV_PAIRING_TIMEOUT", 45)
# How long a TV is skipped after it failed to answer, so one dead set cannot
# turn a page full of thumbnails into a page full of stuck requests.
TV_DOWN_COOLDOWN = _env_int("FRAME_TV_DOWN_COOLDOWN", 30)
# Simple in-memory cache to reduce repeated TV requests
# Structure: { (ip, 'gallery'): (timestamp, value), (ip, content_id): (timestamp, bytes) }
_CACHE: dict = {}
_CACHE_TTL = 60  # seconds

def _cache_get(key):
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, value = entry
    if time.time() - ts > _CACHE_TTL:
        try:
            del _CACHE[key]
        except KeyError:
            pass
        return None
    return value

def _cache_set(key, value):
    _CACHE[key] = (time.time(), value)


# Disk-backed thumbnail cache — store under the project's data directory
PROJECT_ROOT = Path(__file__).resolve().parents[1]
# Match app.py's DATA_DIR behavior: use FRAME_TV_DATA env or default to 'data'
_DATA_DIR = Path(os.environ.get('FRAME_TV_DATA', 'data'))
if not _DATA_DIR.is_absolute():
    _DATA_DIR = PROJECT_ROOT.joinpath(_DATA_DIR)
TV_THUMB_DIR = _DATA_DIR.joinpath('instance', 'tv_thumbnails')
TV_THUMB_DIR.mkdir(parents=True, exist_ok=True)

def _thumb_disk_path(ip: str, content_id: str) -> Path:
    safe_ip = ip.replace(':', '_')
    return TV_THUMB_DIR.joinpath(safe_ip, content_id)

def _thumb_disk_get(ip: str, content_id: str) -> Optional[bytes]:
    p = _thumb_disk_path(ip, content_id)
    if p.is_file():
        try:
            return p.read_bytes()
        except Exception:
            return None
    return None

def _thumb_disk_set(ip: str, content_id: str, data: bytes) -> None:
    p = _thumb_disk_path(ip, content_id)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    except Exception:
        logger.exception("Failed to write thumbnail to disk for %s %s", ip, content_id)

class FrameTVError(Exception):
    """Base exception for Frame TV operations."""
    pass

class FrameTVConnectionError(FrameTVError):
    """Exception for connection errors to the Frame TV."""
    pass


class FrameTVTimeoutError(FrameTVConnectionError):
    """Exception for timeouts while talking to the Frame TV."""
    pass

class FrameTVUploadError(FrameTVError):
    """Exception for upload errors to the Frame TV."""
    pass


def _is_timeout_error(err: Exception) -> bool:
    return (
        isinstance(err, (TimeoutError, socket.timeout))
        or getattr(err, "winerror", None) == 10060
        or "10060" in str(err)
        or "timed out" in str(err).lower()
    )


def _is_connection_error(err: Exception) -> bool:
    """True when the error means "the TV is not talking to us" rather than "the TV said no"."""
    return isinstance(
        err, (OSError, ConnectionFailure, FrameTVConnectionError, websocket.WebSocketException)
    ) or _is_timeout_error(err)


def _raise_tv_connection_error(ip: str, action_description: str, err: Exception) -> None:
    if _is_timeout_error(err):
        raise FrameTVTimeoutError(f"Timeout while {action_description} TV {ip}") from err
    raise FrameTVConnectionError(f"Error while {action_description} TV {ip}") from err


# --- Bounded TV calls ---
#
# samsungtvws has no overall timeout: art requests wait in a `while True` loop on
# recv() until the TV answers the right frame. A set that accepts the socket but
# stops answering therefore blocks the request forever — long enough for gunicorn
# to kill the worker, respawn it, and hit the same wall on the next thumbnail.
# Every TV call runs in a worker thread with a hard deadline, and the sockets are
# closed from the outside on expiry, which is what makes the pending recv() fail.

_TV_EXECUTOR = ThreadPoolExecutor(
    max_workers=_env_int("FRAME_TV_MAX_PARALLEL_CALLS", 8),
    thread_name_prefix="frametv",
)

# The cooldown is shared between gunicorn workers through a marker file whose mtime is
# when the TV last failed. Keeping it in memory would only teach one worker out of four,
# so a page full of thumbnails would still stall once per worker.
TV_DOWN_DIR = _DATA_DIR.joinpath('instance', 'tv_down')


def _tv_down_marker(ip: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "-._" else "_" for ch in ip)
    return TV_DOWN_DIR.joinpath(f"tv-{safe}")


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


class _TVSession:
    """A TV connection (remote channel + art channel) closable from another thread.

    samsungtvws opens a fresh art channel on every `tv.art()` call, so the object is
    kept here: one channel per operation instead of one per call, and a handle the
    caller can close to unblock a read that is stuck in the worker thread.
    """

    def __init__(self, ip: str, token: Optional[str], timeout: int):
        self.ip = ip
        self._tv = SamsungTVWS(
            host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME, timeout=timeout
        )
        self._art = None

    @property
    def tv(self) -> SamsungTVWS:
        return self._tv

    def art(self):
        if self._art is None:
            self._art = self._tv.art()
        return self._art

    def close(self) -> None:
        for channel in (self._art, self._tv):
            if channel is None:
                continue
            try:
                channel.close()
            except Exception:
                logger.debug("Error closing channel for TV %s", self.ip, exc_info=True)


def _tv_call(
    ip: str,
    action_description: str,
    action: Callable[["_TVSession"], Any],
    *,
    token: Optional[str] = None,
    deadline: Optional[int] = None,
    open_remote: bool = True,
) -> Any:
    """Run `action(session)` against the TV, never blocking longer than `deadline`.

    Raises FrameTVTimeoutError when the deadline expires and FrameTVConnectionError
    when the TV is unreachable; errors coming from the TV itself (a rejected
    request, a bad content id) are re-raised untouched so callers can tell the two
    apart. A TV that fails is skipped for TV_DOWN_COOLDOWN seconds.
    """
    if deadline is None:
        deadline = TV_CALL_DEADLINE

    cooldown = _tv_cooldown_remaining(ip)
    if cooldown > 0:
        raise FrameTVConnectionError(
            f"TV {ip} did not answer recently; skipping {action_description} it for another {cooldown:.0f}s"
        )

    session = _TVSession(ip, token, DEFAULT_TIMEOUT)

    def run():
        if open_remote:
            session.tv.open()
        return action(session)

    future = _TV_EXECUTOR.submit(run)
    try:
        result = future.result(timeout=deadline)
    except FutureTimeoutError as err:
        # cancel() succeeds only while the call is still queued; otherwise close the
        # sockets so the recv() blocking the worker thread raises and lets it go.
        if not future.cancel():
            session.close()
        _mark_tv_down(ip)
        raise FrameTVTimeoutError(
            f"Timeout after {deadline}s while {action_description} TV {ip}"
        ) from err
    except Exception as err:
        session.close()
        if _is_connection_error(err):
            _mark_tv_down(ip)
            _raise_tv_connection_error(ip, action_description, err)
        raise

    _mark_tv_up(ip)
    session.close()
    return result


def _fetch_matte_list(art) -> Optional[Dict]:
    try:
        return art.get_matte_list()
    except Exception:  # pylint: disable=broad-except
        logger.exception("Error getting matte list")
        return None


def _matte_kwargs(art, matte: Optional[str]) -> Dict[str, str]:
    if matte is None:
        return {}
    available_mattes = _fetch_matte_list(art)
    if available_mattes and 'matte_types' in available_mattes:
        matte_types = available_mattes['matte_types']
        # Extract matte_type values from the list of dicts
        available_matte_names = [m.get('matte_type') for m in matte_types if isinstance(m, dict)]
        if matte not in available_matte_names:
            logger.warning("Requested matte '%s' not in available mattes: %s", matte, available_matte_names)
    return {'matte': matte, 'portrait_matte': matte}


def upload_artwork(
    ip: str,
    art_path: str,
    brightness: Optional[int] = None,
    display: bool = True,
    delete_others: bool = False,
    token: Optional[str] = None,
    matte: Optional[str] = "none",
    **kwargs
) -> Optional[str]:
    """
    Upload an artwork image to the Frame TV, optionally set brightness, and display it.
    Args:
        ip (str): IP address of the TV.
        art_path (str): Path to the artwork image file.
        brightness (Optional[int]): Brightness level to set after upload.
        display (bool): Whether to display the uploaded image immediately.
        delete_others (bool): Whether to delete every other artwork on the TV.
        token (Optional[str]): Token string to use for authentication.
        matte (Optional[str]): Matte/frame style to use (e.g., 'shadowbox_polar', 'shadowbox_modern', 'none' (no matte)).
    Returns:
        Optional[str]: Content ID of the uploaded image, or None if failed.
    """
    with open(art_path, "rb") as f:
        payload = f.read()

    def action(session: _TVSession) -> Optional[str]:
        art = session.art()
        content_id = art.upload(payload, **_matte_kwargs(art, matte))
        if brightness is not None:
            art.set_brightness(brightness)
        if display and content_id:
            art.select_image(content_id, show=True)
        if delete_others:
            _delete_other_images(art, content_id, debug=True)
        return content_id

    return _tv_call(ip, "uploading artwork to", action, token=token, deadline=TV_UPLOAD_DEADLINE)

def _delete_other_images(art, keep_content_id: str, *, debug: bool) -> None:
    available = []
    try:
        # art.available() returns a content list
        available = art.available() or []
    except Exception as err:  # pylint: disable=broad-except
        logger.exception("Could not enumerate TV gallery")
        return

    deletions = [item.get("content_id") for item in available if item.get("content_id") and item.get("content_id") != keep_content_id]

    kept = [item.get("content_id") for item in available if item.get("content_id") == keep_content_id]
    if len(kept) > 1:
        logger.warning("Found %d copies of active image %s; keeping all to avoid accidental deletion.", len(kept), keep_content_id)

    if not deletions:
        logger.debug("No other images to delete")
        return
    logger.info("Deleting %d old images: %s", len(deletions), deletions)
    art.delete_list(deletions)
    if debug:
        logger.debug("Deleted %d old images", len(deletions))

def delete_all_images_from_tv(ip: str, token: Optional[str] = None) -> None:
    """
    Delete all uploaded images from the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    """
    def action(session: _TVSession) -> None:
        art = session.art()
        available = art.available() or []
        content_ids = [item.get("content_id") for item in available if item.get("content_id")]
        if content_ids:
            art.delete_list(content_ids)
            logger.info("Deleted %d images from TV %s", len(content_ids), ip)
        else:
            logger.info("No images found on TV %s to delete", ip)

    _tv_call(ip, "deleting images from", action, token=token)

def play_uploaded_content(ip: str, content_id: str, token: Optional[str] = None) -> None:
    """
    Play an already uploaded image on the Frame TV using its content_id.
    Args:
        ip (str): IP address of the TV.
        content_id (str): Content ID of the uploaded image.
        token (Optional[str]): Token string to use for authentication.
    """
    _tv_call(
        ip,
        f"playing image {content_id} on",
        lambda session: session.art().select_image(content_id, show=True),
        token=token,
    )

def set_brightness(ip: str, brightness: int, token: Optional[str] = None) -> None:
    """
    Set the brightness of the Frame TV in art mode.
    Args:
        ip (str): IP address of the TV.
        brightness (int): Brightness level to set.
        token (Optional[str]): Token string to use for authentication.
    """
    _tv_call(
        ip,
        "setting brightness on",
        lambda session: session.art().set_brightness(brightness),
        token=token,
    )

def is_art_mode_on(ip: str, token: Optional[str] = None) -> bool:
    """
    Check if the Frame TV is currently in art mode.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        bool: True if art mode is enabled, False otherwise.
    """
    status = _tv_call(
        ip,
        "reading art mode from",
        lambda session: session.art().get_artmode(),
        token=token,
    )
    return status == "on"

def is_tv_reachable(ip: str, token: Optional[str] = None) -> bool:
    """
    Check if the Frame TV is reachable on the network.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        bool: True if the TV is reachable, False otherwise.
    """
    try:
        _tv_call(ip, "reaching", lambda session: True, token=token)
        return True
    except Exception:
        return False

def power_on(ip: str, mac: str, token: Optional[str] = None) -> None:
    """
    Power on the Frame TV using Wake-on-LAN.
    Args:
        ip (str): IP address of the TV (unused, for interface consistency).
        mac (str): MAC address of the TV.
        token (Optional[str]): Token string to use for authentication.
    """
    logger.info("wake on lan is currently not implemented")
    pass

def power_off(ip: str, token: Optional[str] = None) -> None:
    """
    Power off the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    """
    _tv_call(ip, "powering off", lambda session: session.tv.send_key("KEY_POWER"), token=token)

def enable_art_mode(ip: str, token: Optional[str] = None) -> None:
    """
    Enable art mode on the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    """
    _tv_call(
        ip,
        "enabling art mode on",
        lambda session: session.art().set_artmode(True),
        token=token,
    )

def remove_token(ip: str) -> None:
    """
    Delete the authentication token file for the specified TV IP.
    Args:
        ip (str): IP address of the TV.
    """
    pass

def get_available_mattes(ip: str, token: Optional[str] = None) -> Optional[Dict]:
    """
    Get the list of available matte styles and colors on the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        Optional[Dict]: Dictionary with 'matte_types' and 'matte_colors' keys, or None if failed.
    """
    try:
        return _tv_call(
            ip,
            "getting matte list from",
            lambda session: _fetch_matte_list(session.art()),
            token=token,
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Error getting matte list from TV %s", ip)
        return None

def change_matte(ip: str, matte: str, token: Optional[str] = None) -> None:
    """
    Change the matte style on the Frame TV.
    Args:
        ip (str): IP address of the TV.
        matte (str): Matte style to set.
        token (Optional[str]): Token string to use for authentication.
    """
    try:
        _tv_call(
            ip,
            "changing matte on",
            lambda session: session.art().change_matte(matte),
            token=token,
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Error changing matte on TV %s", ip)

def get_tv_gallery_images(ip: str, token: Optional[str] = None) -> List[Dict]:
    """
    Fetch the list of images currently on the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        List[Dict]: List of image dictionaries with metadata (content_id, filename, date_added).
    """
    # Do not cache the gallery listing to ensure deletions/changes are observed live

    def action(session: _TVSession) -> List[Dict]:
        art = session.art()
        available = art.available() or []

        images = []
        seen_content_ids = []
        for item in available:
            content_id = item.get("content_id")
            if content_id and content_id not in seen_content_ids:
                images.append({
                    "content_id": content_id,
                    "filename": item.get("file_name", "Unknown"),
                    "date_added": item.get("date_added", item.get("created_at", "Unknown")),
                    "thumbnail": None,
                })
                seen_content_ids.append(content_id)

        # Serve whatever the disk cache already has, so a TV that stops answering
        # still renders the thumbnails fetched on an earlier visit.
        missing = []
        by_content_id = {img["content_id"]: img for img in images}
        for cid, img in by_content_id.items():
            disk = _thumb_disk_get(ip, cid)
            if disk:
                img["thumbnail"] = base64.b64encode(disk).decode("ascii")
            else:
                missing.append(cid)

        # Fetch the rest in a single batch call to avoid many serial connections
        try:
            if missing:
                thumb_map = art.get_thumbnail_list(missing)
                if isinstance(thumb_map, dict):
                    for cid, data in thumb_map.items():
                        img = by_content_id.get(cid)
                        if img is None or not isinstance(data, (bytes, bytearray)):
                            continue
                        b = bytes(data)
                        img["thumbnail"] = base64.b64encode(b).decode("ascii")
                        _thumb_disk_set(ip, cid, b)
        except Exception:
            # Fall back silently if batch thumbnail retrieval fails
            logger.debug("Batch thumbnail retrieval failed for TV %s", ip, exc_info=True)

        return images

    return _tv_call(ip, "fetching gallery images from", action, token=token)

def delete_tv_image(ip: str, content_id: str, token: Optional[str] = None) -> bool:
    """
    Delete a specific image from the Frame TV by content_id.
    Args:
        ip (str): IP address of the TV.
        content_id (str): Content ID of the image to delete.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        bool: True if deletion was successful.
    """
    _tv_call(
        ip,
        f"deleting image {content_id} from",
        lambda session: session.art().delete(content_id),
        token=token,
    )
    return True

def get_tv_gallery_thumbnail(ip: str, content_id: str, token: Optional[str] = None) -> Optional[bytes]:
    """
    Fetch the thumbnail bytes for a TV gallery image.
    Args:
        ip (str): IP address of the TV.
        content_id (str): Content ID of the image.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        Optional[bytes]: Thumbnail image bytes, or None if unavailable.
    """
    # Check in-memory cache first
    cached = _cache_get((ip, content_id))
    if cached is not None:
        return cached

    # Check disk-backed cache
    disk = _thumb_disk_get(ip, content_id)
    if disk is not None:
        # also populate in-memory cache
        _cache_set((ip, content_id), disk)
        return disk

    def action(session: _TVSession) -> Optional[bytes]:
        art = session.art()
        thumbnail_bytes = None

        # Newer firmware tends to be more reliable when we request thumbnails
        # through the D2D list endpoint, which returns the response over the
        # response socket.
        try:
            thumbnail_map = art.get_thumbnail_list([content_id])
            if isinstance(thumbnail_map, dict):
                thumbnail_bytes = next(
                    (bytes(data) for data in thumbnail_map.values() if isinstance(data, (bytes, bytearray))),
                    None,
                )
        except Exception:
            thumbnail_bytes = None

        if thumbnail_bytes is None:
            thumbnail = art.get_thumbnail(content_id)
            if isinstance(thumbnail, (bytes, bytearray)):
                thumbnail_bytes = bytes(thumbnail)

        return thumbnail_bytes

    thumbnail_bytes = _tv_call(ip, f"fetching thumbnail {content_id} from", action, token=token)
    if thumbnail_bytes is not None:
        _thumb_disk_set(ip, content_id, thumbnail_bytes)
        _cache_set((ip, content_id), thumbnail_bytes)
    return thumbnail_bytes
