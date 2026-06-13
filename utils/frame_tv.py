import socket
from typing import Dict, List, Optional
import base64
from samsungtvws import SamsungTVWS
from samsungtvws.helper import get_ssl_context
from const import CONNECTION_NAME
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8002
DEFAULT_TIMEOUT = 8
# Simple in-memory cache to reduce repeated TV requests
# Structure: { (ip, 'gallery'): (timestamp, value), (ip, content_id): (timestamp, bytes) }
_CACHE: dict = {}
_CACHE_TTL = 60  # seconds

def _cache_get(key):
    import time
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
    import time
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


def _raise_tv_connection_error(ip: str, operation: str, err: Exception) -> None:
    if _is_timeout_error(err):
        raise FrameTVTimeoutError(f"Timeout while {operation} TV {ip}") from err
    raise FrameTVConnectionError(f"Error while {operation} TV {ip}") from err

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
        delete_others (bool): Whether to delete other artworks (not implemented).
        token (Optional[str]): Token string to use for authentication.
        matte (Optional[str]): Matte/frame style to use (e.g., 'shadowbox_polar', 'shadowbox_modern', 'none' (no matte)).
    Returns:
        Optional[str]: Content ID of the uploaded image, or None if failed.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    upload_kwargs = {}
    available_mattes = get_available_mattes(ip, token)
    if matte is not None:
        # Validate matte against available options
        if available_mattes and 'matte_types' in available_mattes:
            matte_types = available_mattes['matte_types']
            # Extract matte_type values from the list of dicts
            available_matte_names = [m.get('matte_type') for m in matte_types if isinstance(m, dict)]
            if matte not in available_matte_names:
                logger.warning("Requested matte '%s' not in available mattes: %s", matte, available_matte_names)
        upload_kwargs['matte'] = matte
        upload_kwargs['portrait_matte'] = matte
    with open(art_path, "rb") as f:
        content_id = tv.art().upload(f.read(), **upload_kwargs)
    if brightness is not None:
        tv.art().set_brightness(brightness)
    if display and content_id:
        tv.art().select_image(content_id, show=True)
    tv.close()

    if delete_others:
        _delete_other_images(tv.art(), content_id, debug=True)

    return content_id

def _delete_other_images(art, keep_content_id: str, *, debug: bool) -> None:
    try:
        # art.available() returns a content list
        available = art.available() or []
    except Exception as err:  # pylint: disable=broad-except
        logger.exception("Could not enumerate TV gallery")

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
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    try:
        available = tv.art().available() or []
        content_ids = [item.get("content_id") for item in available if item.get("content_id")]
        if content_ids:
            tv.art().delete_list(content_ids)
            logger.info("Deleted %d images from TV %s", len(content_ids), ip)
        else:
            logger.info("No images found on TV %s to delete", ip)
    except Exception as err:  # pylint: disable=broad-except
        logger.exception("Error while deleting images from TV %s", ip)
    finally:
        tv.close()

def play_uploaded_content(ip: str, content_id: str, token: Optional[str] = None) -> None:
    """
    Play an already uploaded image on the Frame TV using its content_id.
    Args:
        ip (str): IP address of the TV.
        content_id (str): Content ID of the uploaded image.
        token (Optional[str]): Token string to use for authentication.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    tv.art().select_image(content_id, show=True)
    tv.close()

def set_brightness(ip: str, brightness: int, token: Optional[str] = None) -> None:
    """
    Set the brightness of the Frame TV in art mode.
    Args:
        ip (str): IP address of the TV.
        brightness (int): Brightness level to set.
        token (Optional[str]): Token string to use for authentication.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    tv.art().set_brightness(brightness)
    tv.close()

def is_art_mode_on(ip: str, token: Optional[str] = None) -> bool:
    """
    Check if the Frame TV is currently in art mode.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        bool: True if art mode is enabled, False otherwise.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    status = tv.art().get_artmode()
    tv.close()
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
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
        tv.open()
        tv.close()
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
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    tv.send_key("KEY_POWER")
    tv.close()

def enable_art_mode(ip: str, token: Optional[str] = None) -> None:
    """
    Enable art mode on the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    tv.art().set_artmode(True)
    tv.close()

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
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
        tv.open()
        mattes = tv.art().get_matte_list()
        tv.close()
        return mattes
    except Exception as err:  # pylint: disable=broad-except
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
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
        tv.open()
        tv.art().change_matte(matte)
        tv.close()
    except Exception as err:  # pylint: disable=broad-except
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

    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME, timeout=DEFAULT_TIMEOUT)
    try:
        tv.open()
        art = tv.art()
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

        # Try to fetch thumbnails in a single batch call to avoid many serial connections
        try:
            if seen_content_ids:
                thumb_map = art.get_thumbnail_list(seen_content_ids)
                if isinstance(thumb_map, dict):
                    for img in images:
                        cid = img["content_id"]
                        # Prefer disk cache first
                        disk = _thumb_disk_get(ip, cid)
                        if disk:
                            img["thumbnail"] = base64.b64encode(disk).decode("ascii")
                            continue
                        data = thumb_map.get(cid)
                        if isinstance(data, (bytes, bytearray)):
                            b = bytes(data)
                            img["thumbnail"] = base64.b64encode(b).decode("ascii")
                            # persist to disk
                            try:
                                _thumb_disk_set(ip, cid, b)
                            except Exception:
                                pass
        except Exception:
            # Fall back silently if batch thumbnail retrieval fails
            pass

        return images
    except Exception as err:  # pylint: disable=broad-except
        _raise_tv_connection_error(ip, "fetching gallery images from", err)
    finally:
        try:
            tv.close()
        except Exception:
            pass

def delete_tv_image(ip: str, content_id: str, token: Optional[str] = None) -> bool:
    """
    Delete a specific image from the Frame TV by content_id.
    Args:
        ip (str): IP address of the TV.
        content_id (str): Content ID of the image to delete.
        token (Optional[str]): Token string to use for authentication.
    Returns:
        bool: True if deletion was successful.
    Raises:
        RuntimeError: If the TV connection or deletion fails.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME, timeout=DEFAULT_TIMEOUT)
    try:
        tv.open()
        tv.art().delete(content_id)
        return True
    except Exception as err:  # pylint: disable=broad-except
        _raise_tv_connection_error(ip, f"deleting image {content_id} from", err)
    finally:
        try:
            tv.close()
        except Exception:
            pass

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

    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME, timeout=DEFAULT_TIMEOUT)
    try:
        tv.open()
        art = tv.art()

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

        if thumbnail_bytes is not None:
            try:
                _thumb_disk_set(ip, content_id, thumbnail_bytes)
            except Exception:
                pass
            _cache_set((ip, content_id), thumbnail_bytes)
            return thumbnail_bytes
        return None
    except Exception as err:  # pylint: disable=broad-except
        _raise_tv_connection_error(ip, f"fetching thumbnail {content_id} from", err)
    finally:
        try:
            tv.close()
        except Exception:
            pass
