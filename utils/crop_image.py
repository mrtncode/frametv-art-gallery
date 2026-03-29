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


# Crop presets: common aspect ratios for different displays
CROP_PRESETS = {
    '640x480': {'width': 640, 'height': 480, 'label': '640x480 (4:3)'},
    '800x600': {'width': 800, 'height': 600, 'label': '800x600 (4:3)'},
    '1024x768': {'width': 1024, 'height': 768, 'label': '1024x768 (4:3)'},
    '1280x960': {'width': 1280, 'height': 960, 'label': '1280x960 (4:3)'},
    '1920x1080': {'width': 1920, 'height': 1080, 'label': '1920x1080 (16:9)'},
}



def get_preset_crop_box(image_path: str, preset_name: str) -> tuple[int, int, int, int]:
    """
    Calculate centered crop box coordinates for a preset based on image dimensions.
    
    Args:
        image_path: Full path to the image file
        preset_name: Name of the preset (e.g., '640x480')
        
    Returns:
        Tuple of (x, y, width, height) for the centered crop box
        
    Raises:
        CropImageError: If preset not found or image cannot be opened
        FileNotFoundError: If image not found
    """
    if preset_name not in CROP_PRESETS:
        available = ', '.join(CROP_PRESETS.keys())
        raise CropImageError(f'Unknown preset: {preset_name}. Available: {available}')
    
    if PILImage is None:
        raise CropImageError('Pillow library not installed')
    
    if not os.path.exists(image_path):
        raise FileNotFoundError(f'Image not found at {image_path}')
    
    preset = CROP_PRESETS[preset_name]
    preset_width = preset['width']
    preset_height = preset['height']
    
    try:
        with PILImage.open(image_path) as img:
            img_width, img_height = img.size
            
            # Calculate centered crop box
            x = max(0, (img_width - preset_width) // 2)
            y = max(0, (img_height - preset_height) // 2)
            
            # Ensure we don't exceed image bounds
            width = min(preset_width, img_width - x)
            height = min(preset_height, img_height - y)
            
            return (x, y, width, height)
    except Exception as e:
        raise CropImageError(f'Failed to read image dimensions: {e}')


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
