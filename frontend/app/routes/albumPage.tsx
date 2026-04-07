import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import ImageGrid from '../components/imageGrid';
import { fetchAlbum, fetchImages, addImageToAlbum, deleteAlbum, removeImageFromAlbum } from '../utils/galleryApi';

type AlbumImage = { id: number; filename: string };

type AlbumDetail = {
  id: number;
  name: string;
  images: AlbumImage[];
};

export default function AlbumPage() {
  const { albumId } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadAlbum = async () => {
    if (!albumId) return;
    setLoading(true);
    setError('');
    try {
      const albumData = await fetchAlbum(albumId);
      setAlbum(albumData);
    } catch (e: any) {
      setError(e.message || 'Failed to load album');
      setAlbum(null);
    } finally {
      setLoading(false);
    }
  };

  const loadImages = async () => {
    try {
      const imgs = await fetchImages();
      setImages(imgs || []);
    } catch {
      setImages([]);
    }
  };

  useEffect(() => {
    loadAlbum();
    loadImages();
  }, [albumId]);

  const handleAddToAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!album || !selectedImage) {
      setError('Select a valid image to add.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccessMessage('');
    try {
      await addImageToAlbum(album.name, selectedImage);
      await loadAlbum();
      setSuccessMessage('Image added to album successfully.');
      setSelectedImage('');
    } catch (e: any) {
      setError(e.message || 'Failed to add image to album');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveFromAlbum = async (imageId: number) => {
    if (!album) return;
    setBusy(true);
    setError('');
    try {
      await removeImageFromAlbum(album.id, imageId);
      await loadAlbum();
    } catch (e: any) {
      setError(e.message || 'Failed to remove image from album');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!album) return;
    if (!window.confirm(`Delete album "${album.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteAlbum(album.name);
      navigate('/gallery');
    } catch (e: any) {
      setError(e.message || 'Failed to delete album');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          className="text-sm text-blue-600 hover:underline"
          onClick={() => navigate('/gallery')}
        >
          ← Back to Gallery
        </button>
        <button
          type="button"
          className="text-sm text-red-600 hover:text-red-800"
          onClick={handleDeleteAlbum}
          disabled={busy || !album}
        >
          Delete Album
        </button>
      </div>

      {loading ? (
        <div>Loading album…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : !album ? (
        <div className="text-gray-500">Album not found.</div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{album.name}</h2>
                <p className="text-sm text-gray-500">{album.images.length} image{album.images.length === 1 ? '' : 's'} in this album</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 mb-8 max-w-xl">
            <h3 className="text-base font-semibold mb-3">Add image</h3>
            <form onSubmit={handleAddToAlbum} className="grid gap-3 md:grid-cols-[1.5fr_auto] items-end">
              <label className="sr-only" htmlFor="album-image-select">Image</label>
              <select
                id="album-image-select"
                value={selectedImage}
                onChange={e => setSelectedImage(e.target.value)}
                className="border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Select uploaded image</option>
                {images.map(filename => (
                  <option key={filename} value={filename}>{filename}</option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded"
                disabled={busy || !selectedImage}
              >
                {busy ? 'Saving…' : 'Add'}
              </button>
            </form>
            {successMessage && <div className="text-green-600 text-sm mt-3">{successMessage}</div>}
            {error && <div className="text-red-500 text-sm mt-3">{error}</div>}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold mb-4">Album Images</h3>
            {album.images.length === 0 ? (
              <div className="text-gray-500">No images in this album yet.</div>
            ) : (
              <ImageGrid
                images={album.images.map(img => ({ id: img.id, filename: img.filename, type: 'local' }))}
                onDeleteImage={(img) => handleRemoveFromAlbum(img.id)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
