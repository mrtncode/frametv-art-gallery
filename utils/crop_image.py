"""Image cropping utility using Pillow."""

import os
from pathlib import Path

try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None


class CropImageError(Exception):
    """Raised when image cropping fails."""
    pass


def validate_crop_params(x: int, y: int, width: int, height: int) -> None:
    """
    Validate crop parameters.
    
    Args:
        x: Left offset
        y: Top offset
        width: Crop width
        height: Crop height
        
    Raises:
        CropImageError: If parameters are invalid
    """
    if not all(isinstance(v, int) for v in [x, y, width, height]):
        raise CropImageError('Crop parameters must be integers')
    
    if width <= 0 or height <= 0 or x < 0 or y < 0:
        raise CropImageError('Invalid crop dimensions: width and height must be > 0, x and y must be >= 0')


def crop_image_file(image_path: str, x: int, y: int, width: int, height: int) -> None:
    """
    Crop an image file in place.
    
    Args:
        image_path: Full path to the image file
        x: Left offset in pixels
        y: Top offset in pixels
        width: Crop width in pixels
        height: Crop height in pixels
        
    Raises:
        CropImageError: If cropping fails
        FileNotFoundError: If image not found
    """
    if PILImage is None:
        raise CropImageError('Pillow library not installed')
    
    validate_crop_params(x, y, width, height)
    
    if not os.path.exists(image_path):
        raise FileNotFoundError(f'Image not found at {image_path}')
    
    try:
        with PILImage.open(image_path) as img:
            img_w, img_h = img.size
            
            # Validate crop box is within image bounds
            if x + width > img_w or y + height > img_h:
                raise CropImageError(
                    f'Crop rectangle ({x}, {y}, {x + width}, {y + height}) '
                    f'is outside image bounds ({img_w}x{img_h})'
                )
            
            # Perform the crop
            cropped = img.crop((x, y, x + width, y + height))
            
            # Save with original format
            save_kwargs = {}
            if img.format == 'JPEG':
                save_kwargs['format'] = 'JPEG'
                save_kwargs['quality'] = 95
            
            cropped.save(image_path, **save_kwargs)
            
    except PILImage.UnidentifiedImageError as e:
        raise CropImageError(f'Invalid image file: {e}')
    except Exception as e:
        raise CropImageError(f'Failed to crop image: {e}')
