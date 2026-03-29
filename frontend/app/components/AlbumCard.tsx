import React from 'react'
import { deleteAlbum, getUploadUrl } from "../utils/galleryApi";
type Album = { id:string, name: string; images: string[] };


export default function AlbumCard({album, loadLocalGallery, setError, onImageClick}: {album: Album, loadLocalGallery: () => Promise<void>, setError: (error: string) => void, onImageClick: (image: {id:string, filename:string, type: 'local'}) => void}) {

    async function handleDeleteAlbum(album: string) {
        if (!window.confirm(`Delete album "${album}"?`)) return;
        try {
            await deleteAlbum(album);
            await loadLocalGallery();
        } catch (e: any) {
            setError(e.message || "Failed to delete album");
        }
    }

    async function handleOpenAlbum(album: Album) {
        window.location.href = `/album/${encodeURIComponent(album.id)}`;
    }

  return (
    <div key={album.name} className="border rounded p-3" onClick={() => handleOpenAlbum(album)}>
        <div className="font-bold mb-2 flex items-center justify-between">
            <span>{album.name}</span>
            <button
            className="text-xs text-red-500 hover:underline ml-2"
            onClick={() => handleDeleteAlbum(album.name)}
            >Delete</button>
        </div>
        <div className="flex flex-wrap gap-2">
            {album.images.length === 0 && <span className="text-gray-400">No images</span>}
            {Array.isArray(album.images) && album.images.map(img => (
            <img
                key={img}
                src={getUploadUrl(img)}
                alt={img}
                className="w-16 h-16 object-cover rounded border"
                onClick={() => onImageClick({ id: img, filename: img, type: 'local' })}
                style={{ cursor: 'pointer' }}
            />
            ))}
        </div>
    </div>
  )
}
