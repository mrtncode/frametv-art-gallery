import asyncio
import aiohttp
from typing import List, Dict, Optional
from aioimmich import Immich
from .media_provider import MediaProvider

class ImmichProvider(MediaProvider):
    def __init__(self, api_key: str, host: str, port: int = 443):
        self.api_key = api_key
        self.host = host
        self.port = port

    async def _get_client(self):
        session = aiohttp.ClientSession()
        return Immich(session, self.api_key, self.host, port=self.port), session

    async def get_albums(self) -> List[Dict]:
        immich, session = await self._get_client()
        albums = await immich.albums.async_get_all_albums()
        await session.close()
        return [
            {
                "id": album.album_id,
                "name": album.album_name,
                "asset_count": album.asset_count
            } for album in albums
        ]

    async def get_album_images(self, album_id: str) -> List[Dict]:
        immich, session = await self._get_client()
        album = await immich.albums.async_get_album_info(album_id, without_assests=False)
        await session.close()
        return [
            {
                "id": asset.asset_id,
                "filename": asset.original_file_name,
                "thumb_url": asset.thumbnail_url,
                "metadata": asset.metadata
            } for asset in album.assets
        ]

    async def stream_image(self, image_id: str, size: str = "fullsize") -> Optional[bytes]:
        immich, session = await self._get_client()
        asset_bytes = await immich.assets.async_view_asset(image_id, size=size)
        await session.close()
        return asset_bytes

    async def get_image_metadata(self, image_id: str) -> Dict:
        immich, session = await self._get_client()
        asset = await immich.assets.async_get_asset(image_id)
        await session.close()
        return asset.metadata
