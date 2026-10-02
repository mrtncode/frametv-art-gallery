"""Framing for the Frame: 16:9 crop maths and the image processing around it."""

import io
import os

from PIL import Image as PILImage
from PIL import ImageCms, ImageOps

from .common import TARGET_HEIGHT, TARGET_WIDTH

FIT_FILL = "fill"    # crop to 16:9 so the artwork fills the screen
FIT_WHOLE = "whole"  # keep the whole artwork, let the TV add a matte

# Below this width an upscale to 3840 would look mushy, so the crop keeps its own size.
UPSCALE_MIN_WIDTH = 2560
JPEG_QUALITY = 92


def plan_fill(width, height):
    """Centred 16:9 crop box as (x, y, crop_width, crop_height), all integers."""
    if width * 9 >= height * 16:
        crop_height = height
        crop_width = height * 16 // 9
    else:
        crop_width = width
        crop_height = width * 9 // 16
    return (width - crop_width) // 2, (height - crop_height) // 2, crop_width, crop_height


def quality_label(width):
    """How sharp the result will be on a 3840 px wide panel."""
    if width >= TARGET_WIDTH:
        return "tv_ready"
    if width >= UPSCALE_MIN_WIDTH:
        return "soft"
    return "low"


def quality_label_whole(width, height):
    """Sharpness when the whole artwork is fitted inside the 3840x2160 panel."""
    fill = min(width / TARGET_WIDTH, height / TARGET_HEIGHT)
    if fill >= 1:
        return "tv_ready"
    if fill >= UPSCALE_MIN_WIDTH / TARGET_WIDTH:
        return "soft"
    return "low"


def _to_srgb(img):
    icc = img.info.get("icc_profile")
    if icc and img.mode in ("RGB", "CMYK", "L"):
        try:
            source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            target = ImageCms.createProfile("sRGB")
            return ImageCms.profileToProfile(img, source, target, outputMode="RGB")
        except (ImageCms.PyCMSError, OSError, ValueError):
            pass
    return img.convert("RGB")


def inspect_image(path):
    """Pixel size and sharpness label of a downloaded file; raises if it is not an image."""
    try:
        with PILImage.open(path) as img:
            img.verify()
        with PILImage.open(path) as img:
            width, height = img.size
    except (OSError, PILImage.DecompressionBombError) as exc:
        raise ValueError("The download was not a usable image") from exc
    return {"width": width, "height": height, "quality": quality_label(width)}


def process_image(source_path, dest_path, fit):
    """Write a Frame-ready JPEG (sRGB, EXIF stripped) from a downloaded original."""
    try:
        with PILImage.open(source_path) as img:
            # Lets JPEG decoding shrink huge scans while reading instead of after.
            img.draft("RGB", (TARGET_WIDTH, TARGET_HEIGHT))
            img = ImageOps.exif_transpose(img)
            img = _to_srgb(img)
            width, height = img.size

            if fit == FIT_FILL:
                x, y, crop_width, crop_height = plan_fill(width, height)
                img = img.crop((x, y, x + crop_width, y + crop_height))
                if crop_width >= UPSCALE_MIN_WIDTH and crop_width != TARGET_WIDTH:
                    img = img.resize((TARGET_WIDTH, TARGET_HEIGHT), PILImage.LANCZOS)
            else:
                scale = min(TARGET_WIDTH / width, TARGET_HEIGHT / height, 1)
                if scale < 1:
                    img = img.resize(
                        (max(1, round(width * scale)), max(1, round(height * scale))),
                        PILImage.LANCZOS,
                    )

            out_width, out_height = img.size
            label = (
                quality_label(crop_width)
                if fit == FIT_FILL
                else quality_label_whole(width, height)
            )
            img.save(dest_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
    except (OSError, PILImage.DecompressionBombError) as exc:
        raise ValueError("The download was not a usable image") from exc
    return {"width": out_width, "height": out_height, "quality": label}


def is_exact_target(info):
    return info["width"] == TARGET_WIDTH and info["height"] == TARGET_HEIGHT


def remove_quietly(path):
    try:
        os.remove(path)
    except OSError:
        pass
