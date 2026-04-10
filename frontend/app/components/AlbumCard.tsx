import React from 'react'
import { useNavigate } from "react-router";
import { deleteAlbum, getUploadUrl } from "../utils/galleryApi";
import { Button } from './ui/button';
import { TrashIcon } from '@heroicons/react/24/outline';

type Album = { id:string, name: string; images: string[] };

export default function AlbumCard({
  album,
  loadLocalGallery,
  setError,
  onImageClick
}: {
  album: Album,
  loadLocalGallery: () => Promise<void>,
  setError: (error: string) => void,
  onImageClick: (image: {id:string, filename:string, type: 'local'}) => void
}) {
  const navigate = useNavigate();

  async function handleDeleteAlbum(albumName: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!window.confirm(`Delete album "${albumName}"?`)) return;
    try {
      await deleteAlbum(albumName);
      await loadLocalGallery();
    } catch (e: any) {
      setError(e.message || "Failed to delete album");
    }
  }

  function handleOpenAlbum(album: Album) {
    navigate(`/album/${encodeURIComponent(album.id)}`);
  }

  return (
    <div className="border rounded-xl p-3 cursor-pointer hover:border-gray-300 transition flex justify-between items-center" onClick={() => handleOpenAlbum(album)}>
      <div className="font-bold mb-2 flex flex-col">
        <span>{album.name}</span>

        <div className="flex flex-wrap gap-2 mt-3">
          {album.images.length === 0 && <span className="text-gray-400">No images</span>}
          {Array.isArray(album.images) && album.images.map(img => (
            <img
              key={img}
              src={getUploadUrl(img)}
              alt={img}
              className="w-16 h-16 object-cover rounded border"
              onClick={(event) => {
                event.stopPropagation();
                onImageClick({ id: img, filename: img, type: 'local' });
              }}
              style={{ cursor: 'pointer' }}
            />
          ))}
      </div>

      </div>

      <div>
        <Button
          className="text-xl hover:underline ml-2"
          onClick={(event) => handleDeleteAlbum(album.name, event)}
        >
          <TrashIcon />
        </Button>
      </div>


    </div>
  )
}
