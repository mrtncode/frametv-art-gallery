"""Covers cropping an image file in place.

Run with: pytest tests/test_crop_image.py
"""

from PIL import Image as PILImage

from utils.crop_image import crop_image_file


def test_a_crop_is_taken_from_the_picture_as_it_is_shown_upright(tmp_path):
    # Stored 400 wide by 200 tall, but tagged to be turned a quarter (EXIF orientation 6),
    # so the browser shows it 200 wide by 400 tall and the crop is chosen on that.
    path = tmp_path / "phone.jpg"
    stored = PILImage.new("RGB", (400, 200), "white")
    exif = stored.getexif()
    exif[0x0112] = 6
    stored.save(path, exif=exif)

    crop_image_file(str(path), 0, 100, 200, 300)

    with PILImage.open(path) as cropped:
        assert cropped.size == (200, 300)
        assert cropped.getexif().get(0x0112) in (None, 1), "saved upright, not turned again"


def test_a_plain_crop_keeps_the_chosen_box(tmp_path):
    path = tmp_path / "flat.png"
    PILImage.new("RGB", (300, 200), "red").save(path)

    crop_image_file(str(path), 10, 20, 160, 90)

    with PILImage.open(path) as cropped:
        assert cropped.size == (160, 90)
