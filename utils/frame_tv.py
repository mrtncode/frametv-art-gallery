import base64
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from utils import tv_connection as _tv_connection
from samsungtvws.exceptions import ResponseError

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("Invalid value for %s, falling back to %s", name, default)
        return default


TV_UPLOAD_DEADLINE = _env_int("FRAME_TV_UPLOAD_DEADLINE", 120)
TV_CALL_DEADLINE = _env_int("FRAME_TV_CALL_DEADLINE", 20)
TV_BUSY_WAIT = _env_int("FRAME_TV_BUSY_WAIT", 90)
TV_THUMBNAIL_BATCH = _env_int("FRAME_TV_THUMBNAIL_BATCH", 8)
TV_THUMBNAIL_DEADLINE = _env_int("FRAME_TV_THUMBNAIL_DEADLINE", 120)
TV_THUMBNAIL_GIVE_UP = _env_int("FRAME_TV_THUMBNAIL_GIVE_UP", 3)
TV_THUMBNAIL_FIRST_ANSWER = _env_int("FRAME_TV_THUMBNAIL_FIRST_ANSWER", 25)
TV_STALL_TIMEOUT = _env_int("FRAME_TV_STALL_TIMEOUT", 45)

_CACHE: dict = {}
_CACHE_TTL = 60


def _cache_get(key):
    entry = _CACHE.get(key)
    if not entry:
        return None
    timestamp, value = entry
    if time.time() - timestamp > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key, value):
    _CACHE[key] = (time.time(), value)


_DATA_DIR = Path(os.environ.get("FRAME_TV_DATA", "data"))
if not _DATA_DIR.is_absolute():
    _DATA_DIR = Path(__file__).resolve().parents[1].joinpath(_DATA_DIR)
TV_THUMB_DIR = _DATA_DIR.joinpath("instance", "tv_thumbnails")
TV_THUMB_DIR.mkdir(parents=True, exist_ok=True)
_tv_connection.configure_data_dirs(_DATA_DIR)

FrameTVError = _tv_connection.FrameTVError
FrameTVConnectionError = _tv_connection.FrameTVConnectionError
FrameTVTimeoutError = _tv_connection.FrameTVTimeoutError
FrameTVUnavailableError = _tv_connection.FrameTVUnavailableError


class FrameTVUploadError(FrameTVError):
    """Exception for upload errors to the Frame TV."""


_GALLERY_CACHE: Dict[str, tuple] = {}
TV_GALLERY_TTL = _env_int("FRAME_TV_GALLERY_TTL", 15)


def _cached_gallery(ip: str) -> Optional[List[Dict]]:
    entry = _GALLERY_CACHE.get(ip)
    if entry is None:
        return None
    cached_at, images = entry
    if time.time() - cached_at > TV_GALLERY_TTL:
        _GALLERY_CACHE.pop(ip, None)
        return None
    return images


def _remember_gallery(ip: str, images: List[Dict]) -> None:
    _GALLERY_CACHE[ip] = (time.time(), images)


def forget_gallery(ip: str) -> None:
    _GALLERY_CACHE.pop(ip, None)


def _thumb_disk_path(ip: str, content_id: str) -> Path:
    return TV_THUMB_DIR.joinpath(ip.replace(":", "_"), content_id)


def _thumb_disk_get(ip: str, content_id: str) -> Optional[bytes]:
    path = _thumb_disk_path(ip, content_id)
    if not path.is_file():
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def _thumb_disk_set(ip: str, content_id: str, data: bytes) -> None:
    path = _thumb_disk_path(ip, content_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    except OSError:
        logger.exception("Failed to write thumbnail to disk for %s %s", ip, content_id)


TV_GALLERY_TTL = _env_int("FRAME_TV_GALLERY_TTL", 15)
_GALLERY_CACHE: Dict[str, tuple] = {}


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

    content_id = _tv_call(ip, "uploading artwork to", action, token=token, deadline=TV_UPLOAD_DEADLINE, skip_when_down=False)
    forget_gallery(ip)
    return content_id

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
    try:
        art.delete_list(deletions)
    except ResponseError as err:
        # Some firmware rejects delete_list with -10. Fall back to one-by-one delete.
        logger.warning("Batch delete rejected, falling back to single deletes: %s", err)
        for content_id in deletions:
            try:
                art.delete(content_id)
            except ResponseError as single_err:
                if "error number -10" in str(single_err).lower():
                    logger.info("TV already missing content %s while deleting old images", content_id)
                    continue
                raise
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

    _tv_call(ip, "deleting images from", action, token=token, skip_when_down=False)
    forget_gallery(ip)

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
        skip_when_down=False,
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
        skip_when_down=False,
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
    _tv_call(ip, "powering off", lambda session: session.tv.send_key("KEY_POWER"), token=token, skip_when_down=False)

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
        skip_when_down=False,
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
            skip_when_down=False,
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Error changing matte on TV %s", ip)

def _content_date(item: Dict) -> str:
    """The date a TV content entry carries, as ISO 8601.

    Firmware reports it as `image_date` in EXIF form ("2026:08:10 14:24:23"), which no
    date parser in a browser accepts. The older key names are kept as a fallback in
    case another firmware uses them.
    """
    raw = item.get("image_date") or item.get("date_added") or item.get("created_at")
    if not raw or not isinstance(raw, str):
        return ""
    try:
        return datetime.strptime(raw.strip(), "%Y:%m:%d %H:%M:%S").isoformat()
    except ValueError:
        # Already ISO, or a shape we do not know: hand it over untouched.
        return raw


def _cached_thumbnail(ip: str, content_id: str) -> Optional[bytes]:
    cached = _cache_get((ip, content_id))
    if cached is not None:
        return cached
    disk = _thumb_disk_get(ip, content_id)
    if disk is not None:
        _cache_set((ip, content_id), disk)
    return disk


# Content the TV has no preview for at all — some of the art it ships with. Asking
# again on every page load costs a round trip each time and always gets the same
# nothing, so the answer is remembered; the window is short enough that a firmware
# that starts answering is picked up on its own.
_NO_THUMBNAIL_TTL = _env_int("FRAME_TV_NO_THUMBNAIL_TTL", 3600)
_NO_THUMBNAIL: Dict[tuple, float] = {}


def _remember_no_thumbnail(ip: str, content_id: str) -> None:
    _NO_THUMBNAIL[(ip, content_id)] = time.time()


def _known_to_have_no_thumbnail(ip: str, content_id: str) -> bool:
    seen_at = _NO_THUMBNAIL.get((ip, content_id))
    if seen_at is None:
        return False
    if time.time() - seen_at > _NO_THUMBNAIL_TTL:
        del _NO_THUMBNAIL[(ip, content_id)]
        return False
    return True


def _content_id_of(name: str, wanted: List[str]) -> Optional[str]:
    """The content id a batch thumbnail belongs to.

    samsungtvws keys the batch answer by `fileID.fileType` — "MY_F0440.jpg", not
    "MY_F0440" — because that is how the TV labels each file on the D2D socket. Keeping
    the key verbatim meant every thumbnail was filed under a name nothing ever looked
    up, so a gallery stayed blank while the bytes were arriving perfectly well.
    """
    if name in wanted:
        return name
    stem = name.rsplit('.', 1)[0]
    return stem if stem in wanted else None


def _single_thumbnail(art, ip: str, content_id: str) -> Tuple[Optional[bytes], bool]:
    """One thumbnail through the single-image endpoint.

    Returns (payload, still_talking). `still_talking` is False only when the call died
    at the connection level: the difference between "this image has no preview" and
    "the TV has stopped answering" is what tells the caller whether to keep walking the
    gallery or to stop. Getting that wrong costs a socket timeout per remaining image.
    """
    try:
        thumbnail = art.get_thumbnail(content_id)
    except Exception as err:
        if _is_connection_error(err):
            return None, False
        logger.debug("TV %s declined %s: %s", ip, content_id, err)
        return None, True
    if isinstance(thumbnail, (bytes, bytearray)) and thumbnail:
        return bytes(thumbnail), True
    return None, True


def _collect_thumbnails(
    art, ip: str, content_ids: List[str], fetch_missing: bool = True,
    on_batch: Optional[Callable[[List[str]], None]] = None,
    frames_received: Optional[Callable[[], int]] = None,
) -> Dict[str, bytes]:
    """Thumbnails for `content_ids`: cache first, then whatever is left, in batches.

    Serving the cache keeps a TV that has gone quiet from blanking a gallery it has
    already answered for once.

    The TV streams every thumbnail of a request down one D2D socket before the call
    returns, so asking for a whole gallery at once is a single transfer that either
    finishes or is lost entirely — a set with forty 4K images never finished. Asking
    in batches means each one is saved as it lands, so a gallery fills in over a few
    visits instead of staying blank forever.

    One unservable image takes its whole batch down with it: the TV closes the socket
    rather than skipping the entry. So a refused batch is asked for again one at a
    time, which isolates the offender and saves the rest of it.
    """
    found: Dict[str, bytes] = {}
    missing: List[str] = []
    for cid in content_ids:
        # The TV refuses to serve any thumbnail for its own art, so asking for it is a round
        if cid.startswith("SAM-") or cid.startswith("SAM_") or cid.startswith("SAM"):
            _remember_no_thumbnail(ip, cid)
            print(f"TV {ip} has no preview for {cid}")
            continue
        cached = _cached_thumbnail(ip, cid)
        if cached is not None:
            found[cid] = cached
        elif _known_to_have_no_thumbnail(ip, cid):
            # Remembered as previewless: asking again is a round trip for the same
            # nothing — and for a poisoned entry, another stall.
            continue
        else:
            missing.append(cid)

    if not missing or not fetch_missing:
        return found

    def keep(cid: str, data) -> bool:
        if not isinstance(data, (bytes, bytearray)) or not data:
            return False
        payload = bytes(data)
        found[cid] = payload
        _thumb_disk_set(ip, cid, payload)
        _cache_set((ip, cid), payload)
        return True

    # A refusal only says something about the image if the TV goes on to answer for
    # another one. A set that stops mid-gallery would otherwise have every image left
    # in the list written off as previewless, and a page of placeholders is worse than
    # a slow one. So refusals are noted and judged at the end.
    refusals: List[tuple] = []
    answered = 0
    dead_in_a_row = 0
    started = time.monotonic()

    def nothing_is_coming() -> bool:
        """True once the walk has run a while with nothing at all to show for it."""
        return answered == 0 and time.monotonic() - started > TV_THUMBNAIL_FIRST_ANSWER

    for start in range(0, len(missing), TV_THUMBNAIL_BATCH):
        if nothing_is_coming():
            logger.warning(
                "TV %s gave nothing in %ds; leaving its thumbnails for next time",
                ip, TV_THUMBNAIL_FIRST_ANSWER,
            )
            return found

        batch = missing[start:start + TV_THUMBNAIL_BATCH]
        if on_batch:
            # Which images the blocked call was asking for, if it never comes back.
            on_batch(batch)
        try:
            frames_before = frames_received() if frames_received else None
            call_started = time.monotonic()
            thumb_map = art.get_thumbnail_list(batch) or {}
        except Exception as err:
            stalled = (
                frames_received is not None
                and frames_before is not None
                and frames_received() > frames_before
                and time.monotonic() - call_started >= TV_STALL_TIMEOUT - 2
            )
            if stalled:
                # The set answered during this very call, then stopped and held the
                # socket open until the watchdog cut it: it was alive, so the batch
                # itself is the problem — an entry whose transfer starts and never
                # finishes. A refusal arrives fast, a dead TV says nothing at all;
                # only a long call that still delivered frames is a stall.
                # Remembering these as previewless is what stops every page load
                # paying another stall for the same image.
                for cid in batch:
                    logger.warning(
                        "TV %s stalled serving %s mid-transfer; treating it as previewless",
                        ip, cid,
                    )
                    _remember_no_thumbnail(ip, cid)
            else:
                logger.info(
                    "TV %s refused a batch of %d thumbnails (%s); asking one at a time",
                    ip, len(batch), err,
                )
            thumb_map = {}

        if isinstance(thumb_map, dict):
            for name, data in thumb_map.items():
                cid = _content_id_of(name, batch)
                if cid is None:
                    logger.debug("TV %s answered with an unexpected thumbnail %r", ip, name)
                    continue
                if keep(cid, data):
                    answered += 1

        for cid in batch:
            if cid in found or _known_to_have_no_thumbnail(ip, cid):
                continue
            if nothing_is_coming():
                logger.warning(
                    "TV %s gave nothing in %ds; leaving its thumbnails for next time",
                    ip, TV_THUMBNAIL_FIRST_ANSWER,
                )
                return found
            if on_batch:
                on_batch([cid])
            payload, still_talking = _single_thumbnail(art, ip, cid)
            if payload is None:
                refusals.append((cid, answered))
                # A set that will not serve an image closes the socket on it, exactly
                # as a set that has gone away does, so the two cannot be told apart
                # from one call. What separates them is how many in a row: a handful
                # of unservable images is normal, a wall of them is a TV that stopped
                # talking. Walking the rest at a socket timeout apiece is what had a
                # page load holding the TV for two minutes.
                dead_in_a_row += 1 if not still_talking else 0
                if dead_in_a_row >= TV_THUMBNAIL_GIVE_UP:
                    logger.warning(
                        "TV %s went quiet after %d thumbnails; leaving the rest for next time",
                        ip, answered,
                    )
                    return found
                continue
            dead_in_a_row = 0
            if keep(cid, payload):
                answered += 1

        if answered == 0:
            # A whole batch, then every one of its images on its own, and not a single
            # answer: the set is away rather than out of previews. Walking the rest of
            # the gallery one dead call at a time would only make the page slower.
            logger.warning("TV %s is not answering for thumbnails; giving up", ip)
            return found

    for cid, answered_before in refusals:
        if answered > answered_before:
            # The TV kept working after refusing this one, so it is the image that has
            # no preview, not the connection. Asking again every visit would cost a
            # round trip to be told the same nothing.
            logger.info("TV %s has no preview for %s", ip, cid)
            _remember_no_thumbnail(ip, cid)
    return found


def get_tv_gallery_thumbnails(
    ip: str, content_ids: List[str], token: Optional[str] = None
) -> Dict[str, bytes]:
    """Fetch several thumbnails in a single round trip to the TV.

    One request beats one per image: the TV only serves a single art channel, so the
    parallel requests a gallery page used to fire were rejecting each other.
    """
    cached = {}
    missing = []
    for cid in content_ids:
        hit = _cached_thumbnail(ip, cid)
        if hit is not None:
            cached[cid] = hit
        else:
            missing.append(cid)

    if not missing:
        return cached

    try:
        fetched = _tv_call(
            ip,
            "fetching thumbnails from",
            lambda session: _collect_thumbnails(
                session.art(), ip, missing,
                on_batch=lambda batch: session.note_context(f"batch {batch}"),
                frames_received=session.frames_received,
            ),
            token=token,
            deadline=TV_THUMBNAIL_DEADLINE,
            stall_timeout=TV_STALL_TIMEOUT,
        )
    except FrameTVError as err:
        # Hand back whatever was cached rather than blanking a whole page because one
        # image was missing from it. One line: the cooldown is already recorded.
        logger.warning("Serving %d cached thumbnails for TV %s: %s", len(cached), ip, err)
        return cached

    cached.update(fetched or {})
    return cached


def get_tv_gallery_images(ip: str, token: Optional[str] = None) -> List[Dict]:
    """
    Fetch the list of images currently on the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        List[Dict]: List of image dictionaries with metadata (content_id, filename, date_added).
    """
    # Briefly cached, and dropped the moment anything here changes the TV's contents.
    # Without it, reloading the page while a walk of thumbnails still holds the TV
    # queued behind it and then failed, reporting a set that was answering perfectly
    # well. The listing is what the page needs first, so it must not wait on the
    # slowest thing running.
    listing = _cached_gallery(ip)
    if listing is not None:
        return listing

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
                    "filename": item.get("file_name") or item.get("filename") or "",
                    "date_added": _content_date(item),
                    "width": item.get("width"),
                    "height": item.get("height"),
                    "matte": item.get("matte_id"),
                    "thumbnail": None,
                })
                seen_content_ids.append(content_id)

        # Cached thumbnails only: the listing has to come back quickly, and the page
        # asks for whatever is still missing in its own request afterwards.
        by_content_id = {img["content_id"]: img for img in images}
        thumbnails = _collect_thumbnails(art, ip, list(by_content_id), fetch_missing=False)
        for cid, data in thumbnails.items():
            img = by_content_id.get(cid)
            if img is not None:
                img["thumbnail"] = base64.b64encode(data).decode("ascii")

        return images

    images = _tv_call(
        ip, "fetching gallery images from", action, token=token,
        stall_timeout=TV_STALL_TIMEOUT,
    )
    _remember_gallery(ip, images)
    return images

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
        skip_when_down=False,
    )
    forget_gallery(ip)
    return True

def delete_tv_images(ip: str, content_ids: List[str], token: Optional[str] = None) -> int:
    """Delete several images from the TV in a single round trip.

    The TV takes a list, so this is one connection rather than one per image — which
    matters given it only serves a single art channel.

    Returns:
        int: how many content ids were sent for deletion.
    """
    wanted = [cid for cid in content_ids if cid]
    if not wanted:
        return 0

    def action(session: _TVSession) -> int:
        art = session.art()
        try:
            art.delete_list(wanted)
            return len(wanted)
        except ResponseError as err:
            # Older/newer firmware mixes may reject the list call entirely.
            logger.warning("Batch delete rejected for TV %s, falling back to per-image delete: %s", ip, err)

        deleted = 0
        for content_id in wanted:
            try:
                art.delete(content_id)
                deleted += 1
            except ResponseError as single_err:
                if "error number -10" in str(single_err).lower():
                    # If the TV says the item is already gone, treat it as deleted.
                    logger.info("TV %s already missing content %s during delete", ip, content_id)
                    deleted += 1
                    continue
                raise
        return deleted

    deleted = _tv_call(
        ip,
        f"deleting {len(wanted)} images from",
        action,
        token=token,
        skip_when_down=False,
    )
    for content_id in wanted:
        _CACHE.pop((ip, content_id), None)
    forget_gallery(ip)
    return deleted


def get_tv_device_info(ip: str, token: Optional[str] = None) -> Optional[Dict]:
    """Whatever the TV reports about itself.

    There is no storage endpoint in the art API, so this is the only place any
    capacity figure could turn up — and whether it does depends on the firmware.
    """
    return _tv_call(
        ip,
        "reading device info from",
        lambda session: session.art().get_device_info(),
        token=token,
    )


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
    cached = _cached_thumbnail(ip, content_id)
    if cached is not None:
        return cached

    def action(session: _TVSession) -> Optional[bytes]:
        # The batch endpoint is the reliable path on recent firmware and already falls
        # back to the single call for content it skips.
        return _collect_thumbnails(session.art(), ip, [content_id],
                                   on_batch=lambda batch: session.note_context(f"batch {batch}"),
                                   frames_received=session.frames_received,
                                   ).get(content_id)

    thumbnail_bytes = _tv_call(ip, f"fetching thumbnail {content_id} from", action, token=token)
    if thumbnail_bytes is not None:
        _thumb_disk_set(ip, content_id, thumbnail_bytes)
        _cache_set((ip, content_id), thumbnail_bytes)
    return thumbnail_bytes


# Connection ownership lives in tv_connection. These aliases preserve the private
# module surface used by older callers while keeping the session factory patchable.
from utils import tv_connection as _tv_connection

_tv_connection.configure_data_dirs(_DATA_DIR)
FrameTVError = _tv_connection.FrameTVError
FrameTVConnectionError = _tv_connection.FrameTVConnectionError
FrameTVTimeoutError = _tv_connection.FrameTVTimeoutError
FrameTVUnavailableError = _tv_connection.FrameTVUnavailableError
_TVSession = _tv_connection._TVSession
TV_DOWN_DIR = _tv_connection.TV_DOWN_DIR
TV_LOCK_DIR = _tv_connection.TV_LOCK_DIR

reset_connections = _tv_connection.reset_connections
_is_connection_error = _tv_connection._is_connection_error
set_token_observer = _tv_connection.set_token_observer


def _tv_call(ip, action_description, action, **kwargs):
    return _tv_connection._tv_call(
        ip,
        action_description,
        action,
        session_factory=_TVSession,
        busy_wait=TV_BUSY_WAIT,
        **kwargs,
    )
