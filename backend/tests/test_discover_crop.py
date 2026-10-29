"""Covers the 16:9 framing used when importing from Discover.

Run with: pytest tests/test_discover_crop.py
"""

import pytest
from PIL import Image as PILImage

from utils.discover.artic import iiif_url
from utils.discover.common import crop_loss
from utils.discover.crop import (
    FIT_FILL,
    FIT_WHOLE,
    inspect_image,
    plan_fill,
    process_image,
    quality_label,
    quality_label_whole,
)


@pytest.mark.parametrize(
    "size, expected",
    [
        ((3840, 2160), (0, 0, 3840, 2160)),   # already 16:9
        ((4000, 2826), (0, 288, 4000, 2250)),  # a landscape painting
        ((1000, 1500), (0, 469, 1000, 562)),   # portrait: keeps the middle band
        ((5000, 2000), (722, 0, 3555, 2000)),  # wider than 16:9: trims the sides
    ],
)
def test_fill_crop_is_centred_and_sixteen_by_nine(size, expected):
    assert plan_fill(*size) == expected
    _, _, width, height = plan_fill(*size)
    assert abs(width / height - 16 / 9) < 0.002


def test_crop_loss_matches_the_shapes_people_ask_about():
    assert crop_loss(16 / 9) == 0
    assert crop_loss(4 / 3) == pytest.approx(0.25, abs=0.001)
    assert crop_loss(1.0) == pytest.approx(0.4375, abs=0.001)
    assert crop_loss(2 / 3) == pytest.approx(0.625, abs=0.001)
    assert crop_loss(None) is None


def test_sharpness_labels():
    assert quality_label(3840) == "tv_ready"
    assert quality_label(3000) == "soft"
    assert quality_label(2000) == "low"
    assert quality_label_whole(4000, 2826) == "tv_ready"
    assert quality_label_whole(3400, 1581) == "soft"
    assert quality_label_whole(800, 600) == "low"


def make_image(path, size, colour="navy"):
    PILImage.new("RGB", size, colour).save(path, "JPEG")


def test_fill_produces_an_exact_frame_sized_jpeg(tmp_path):
    source, dest = tmp_path / "in.jpg", tmp_path / "out.jpg"
    make_image(source, (4000, 2826))

    info = process_image(str(source), str(dest), FIT_FILL)

    assert (info["width"], info["height"], info["quality"]) == (3840, 2160, "tv_ready")
    with PILImage.open(dest) as result:
        assert result.size == (3840, 2160)
        assert result.format == "JPEG"


def test_fill_does_not_blow_up_a_small_image(tmp_path):
    source, dest = tmp_path / "in.jpg", tmp_path / "out.jpg"
    make_image(source, (1000, 1500))

    info = process_image(str(source), str(dest), FIT_FILL)

    # 1000 px wide is too little to stretch to 3840 without turning to mush.
    assert (info["width"], info["height"], info["quality"]) == (1000, 562, "low")


def test_whole_keeps_the_entire_artwork_inside_the_panel(tmp_path):
    source, dest = tmp_path / "in.jpg", tmp_path / "out.jpg"
    make_image(source, (4000, 2826))

    info = process_image(str(source), str(dest), FIT_WHOLE)

    assert info["height"] == 2160
    assert info["width"] == round(4000 * 2160 / 2826)
    assert info["quality"] == "tv_ready"


def test_whole_never_upscales(tmp_path):
    source, dest = tmp_path / "in.jpg", tmp_path / "out.jpg"
    make_image(source, (1200, 800))

    info = process_image(str(source), str(dest), FIT_WHOLE)

    assert (info["width"], info["height"]) == (1200, 800)


def test_an_image_that_is_not_an_image_is_refused(tmp_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"<html>not an image</html>")

    with pytest.raises(ValueError):
        inspect_image(str(bad))
    with pytest.raises(ValueError):
        process_image(str(bad), str(tmp_path / "out.jpg"), FIT_FILL)


def test_iiif_urls_make_the_museum_do_the_cropping():
    fill = iiif_url("abc", FIT_FILL, 5898, 4176)
    assert fill == "https://www.artic.edu/iiif/2/abc/0,429,5898,3317/3840,2160/0/default.jpg"

    # A source too small for 3840 is requested at its own width, never as "full" (blocked).
    small = iiif_url("abc", FIT_FILL, 3000, 2400)
    assert small == "https://www.artic.edu/iiif/2/abc/0,356,3000,1687/3000,/0/default.jpg"

    assert iiif_url("abc", FIT_WHOLE, 8808, 8460).endswith("/full/!3840,2160/0/default.jpg")
    assert iiif_url("abc", FIT_WHOLE, 1200, 800).endswith("/full/1200,/0/default.jpg")
