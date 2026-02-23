from typing import Optional
from samsungtvws import SamsungTVWS
from samsungtvws.helper import get_ssl_context
from const import CONNECTION_NAME

DEFAULT_PORT = 8002
DEFAULT_TIMEOUT = 8

class FrameTVError(Exception):
    """Base exception for Frame TV operations."""
    pass

class FrameTVConnectionError(FrameTVError):
    """Exception for connection errors to the Frame TV."""
    pass

class FrameTVUploadError(FrameTVError):
    """Exception for upload errors to the Frame TV."""
    pass

def upload_artwork(
    ip: str,
    art_path: str,
    brightness: Optional[int] = None,
    display: bool = True,
    delete_others: bool = False,
    token: Optional[str] = None,
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
    Returns:
        Optional[str]: Content ID of the uploaded image, or None if failed.
    """
    tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token, name=CONNECTION_NAME)
    tv.open()
    with open(art_path, "rb") as f:
        content_id = tv.art().upload(f.read())
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
        print(f"Could not enumerate TV gallery: {err}")

    deletions = [item.get("content_id") for item in available if item.get("content_id") and item.get("content_id") != keep_content_id]
    
    kept = [item.get("content_id") for item in available if item.get("content_id") == keep_content_id]
    if len(kept) > 1:
        print(f"Warning: Found {len(kept)} copies of active image {keep_content_id}. Keeping all to avoid accidental deletion.")
    
    if not deletions:
        print("No other images to delete")
        return

    print(f"Deleting {len(deletions)} old images: {deletions}")
    art.delete_list(deletions)
    if debug:
        print("Deleted %s old images", len(deletions))

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
    print("wake on lan is currently not implemented")
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
