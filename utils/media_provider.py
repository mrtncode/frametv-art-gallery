from abc import ABC, abstractmethod
from typing import List, Dict, Optional

class MediaProvider(ABC):
    """
    Abstract interface for media providers (albums/images).
    Implementations: Immich, Google Photos, etc.
    """
    @abstractmethod
    def get_albums(self) -> List[Dict]:
        """Return a list of albums with metadata."""
        pass

    @abstractmethod
    def get_album_images(self, album_id: str) -> List[Dict]:
        """Return a list of images for a given album."""
        pass

    @abstractmethod
    def stream_image(self, image_id: str) -> Optional[bytes]:
        """Stream image bytes for given image id."""
        pass

    @abstractmethod
    def get_image_metadata(self, image_id: str) -> Dict:
        """Return metadata for a given image."""
        pass
