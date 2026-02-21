from pathlib import Path
from typing import Optional
from samsungtvws import SamsungTVWS
from samsungtvws.helper import get_ssl_context

DEFAULT_PORT = 8002
DEFAULT_TIMEOUT = 8

TOKEN_DIR = Path(__file__).resolve().parent.parent / "data"
TOKEN_DIR.mkdir(parents=True, exist_ok=True)

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
    if token is not None:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token)
    else:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token_file=str(TOKEN_DIR / f"{ip.replace('.', '_')}.token"))
    tv.open()
    with open(art_path, "rb") as f:
        content_id = tv.art().upload(f.read())
    if brightness is not None:
        tv.art().set_brightness(brightness)
    if display and content_id:
        tv.art().select_image(content_id, show=True)
    tv.close()
    return content_id

def set_brightness(ip: str, brightness: int, token: Optional[str] = None) -> None:
    """
    Set the brightness of the Frame TV in art mode.
    Args:
        ip (str): IP address of the TV.
        brightness (int): Brightness level to set.
        token (Optional[str]): Token string to use for authentication.
    """
    if token is not None:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token)
    else:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token_file=str(TOKEN_DIR / f"{ip.replace('.', '_')}.token"))
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
    if token is not None:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token)
    else:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token_file=str(TOKEN_DIR / f"{ip.replace('.', '_')}.token"))
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
        if token is not None:
            tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token)
        else:
            tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token_file=str(TOKEN_DIR / f"{ip.replace('.', '_')}.token"))
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
    from samsungtvws.shortcuts import wake_on_lan
    wake_on_lan(mac)

def power_off(ip: str, token: Optional[str] = None) -> None:
    """
    Power off the Frame TV.
    Args:
        ip (str): IP address of the TV.
        token (Optional[str]): Token string to use for authentication.
    """
    if token is not None:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token)
    else:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token_file=str(TOKEN_DIR / f"{ip.replace('.', '_')}.token"))
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
    if token is not None:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token=token)
    else:
        tv = SamsungTVWS(host=ip, port=DEFAULT_PORT, token_file=str(TOKEN_DIR / f"{ip.replace('.', '_')}.token"))
    tv.open()
    tv.art().set_artmode(True)
    tv.close()

def remove_token(ip: str) -> None:
    """
    Delete the authentication token file for the specified TV IP.
    Args:
        ip (str): IP address of the TV.
    """
    token_path = TOKEN_DIR / f"{ip.replace('.', '_')}.token"
    if token_path.exists():
        token_path.unlink()
