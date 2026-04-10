

import React, { useEffect, useState } from "react";
import { deleteImage, fetchImages, fetchAlbums, uploadImage, createAlbum, fetchProviderAlbumImages, fetchProviderAlbums, getProviderImageStreamUrl } from "../utils/galleryApi";
import ImageCard from "../components/imageCard";
import AlbumCard from "~/components/AlbumCard";
import ImageGrid from "~/components/imageGrid";
import { Button } from "~/components/ui/button";

type Album = { id:string, name: string; images: string[] };
type ProviderAlbum = { id: string; name: string; asset_count: number };
type ProviderImage = { id: string; filename: string; thumb_url: string; metadata: any };

type GalleryImage = {
  id: string;
  filename: string;
  provider?: string;
  type: "local" | "provider";
  thumb_url?: string;
  metadata?: any;
};

export default function Gallery() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [providerAlbums, setProviderAlbums] = useState<ProviderAlbum[]>([]);
  const [providerImages, setProviderImages] = useState<GalleryImage[]>([]);
  const [providerImagesPage, setProviderImagesPage] = useState(0);
  const [providerImagesHasMore, setProviderImagesHasMore] = useState(false);
  const [providerImagesAlbumId, setProviderImagesAlbumId] = useState<string | null>(null);
  const [providerEnabled, setProviderEnabled] = useState<boolean>(false); // dynamically set
  const [albumName, setAlbumName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);

  async function loadLocalGallery() {
    setLoading(true);
    try {
      const [imgs, als] = await Promise.all([fetchImages(), fetchAlbums()]);
      // Convert to GalleryImage objects
      setImages(imgs.map((img: string) => ({
        id: img,
        filename: img,
        type: "local"
      })));
      setAlbums(als);
    } catch (e: any) {
      setError(e.message || "Failed to load gallery");
    } finally {
      setLoading(false);
    }
  }

  async function loadProviderGallery() {
    setLoading(true);
    try {
      const als = await fetchProviderAlbums();
      setProviderAlbums(als);
      setProviderImages([]);
      setProviderEnabled(Array.isArray(als) && als.length > 0);
    } catch (e: any) {
      setError(e.message || "Failed to load provider gallery");
      setProviderEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLocalGallery();
    loadProviderGallery();
  }, []);

  async function handleProviderAlbumSelect(albumId: string) {
    setLoading(true);
    setProviderImagesAlbumId(albumId);
    setProviderImagesPage(0);
    await getImageFromProviderAlbum(albumId, 0);
    setLoading(false);
    setTimeout(() => {
      const element = document.getElementById("provider_images");
      if (element) element.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }

  async function getImageFromProviderAlbum(albumId: string, page: number) {
    try {
      const imgs = await fetchProviderAlbumImages(albumId);
      // Pagination: slice the images for the current page (10 per page)
      const pageSize = 10;
      const start = page * pageSize;
      const end = start + pageSize;
      const pageImgs = imgs.slice(start, end);
      const galleryImgs = pageImgs.map((img: any) => ({
        id: img.id,
        filename: img.filename,
        type: "provider",
        provider: "immich",
        thumb_url: img.thumb_url,
        metadata: img.metadata
      }));
      if (page === 0) {
        setProviderImages(galleryImgs);
      } else {
        setProviderImages(prev => [...prev, ...galleryImgs]);
      }
      setProviderImagesHasMore(end < imgs.length);
    } catch (e: any) {
      setError(e.message || "Failed to load provider album images");
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderImagesLoadMore() {
    if (!providerImagesAlbumId) return;
    const nextPage = providerImagesPage + 1;
    setProviderImagesPage(nextPage);
    setLoading(true);
    await getImageFromProviderAlbum(providerImagesAlbumId, nextPage);
    setLoading(false);
  }


  async function handleCreateAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!albumName.trim()) return;
    setCreating(true);
    try {
      await createAlbum(albumName.trim());
      setAlbumName("");
      setError("");
      await loadLocalGallery();
    } catch (e: any) {
      setError(e.message || "Failed to create album");
    } finally {
      setCreating(false);
    }
  }


  async function handleDeleteImage(image: any) {
    setLoading(true);
    setError("");
    try {
      await deleteImage(image.filename);
      await loadLocalGallery();
    } catch (e: any) {
      setError(e.message || "Failed to delete image");
    } finally {
      setLoading(false);
    }
  }

  // --- Upload Button State and Handler ---
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File|null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError("");
    try {
      await uploadImage(uploadFile);
      await loadLocalGallery();
      setUploadFile(null);
      setUploading(false)
    } catch (e: any) {
      setError(e.message || "Failed to upload");
      setUploading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-4">Gallery</h2>
          <div className="flex flex-col md:flex-row gap-6 mb-8">
            {/* Upload Image Form */}
            <div className="flex-1 bg-white rounded-lg shadow p-4">
              <h4 className="text-base font-semibold mb-3">Upload image</h4>
              <form onSubmit={handleUpload} className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  disabled={uploading}
                />
                <Button
                  type="submit"
                  className=" px-4 py-2 rounded text-sm"
                  disabled={uploading || !uploadFile}
                >
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
                {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
              </form>
            </div>
          </div>


          <h3 className="text-xl font-semibold mb-2">Uploaded Images</h3>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="mb-8">
              <ImageGrid
                images={images}
                albums={albums}
                onDeleteImage={handleDeleteImage}
                onAssignSuccess={loadLocalGallery}
              />
            </div>
          )}

          <div className="flex-row flex justify-between items-center py-2 mb-3">
            <h3 className="text-xl font-semibold align-middle">Albums</h3>
            <Button onClick={() => setShowCreateAlbumModal(true)}>Create album</Button>
          </div>

          {/* Modal for Create Album */}
          {showCreateAlbumModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm relative">
                <button
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl font-bold"
                  onClick={() => setShowCreateAlbumModal(false)}
                  aria-label="Close"
                >
                  ×
                </button>
                <h4 className="text-base font-semibold mb-3">Create album</h4>
                <form
                  onSubmit={async (e) => {
                    await handleCreateAlbum(e);
                    if (!error) setShowCreateAlbumModal(false);
                  }}
                  className="flex flex-col gap-2"
                >
                  <input
                    type="text"
                    value={albumName}
                    onChange={e => setAlbumName(e.target.value)}
                    placeholder="Album name"
                    className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <Button
                    type="submit"
                    className="transition px-4 py-2 text-sm"
                    disabled={creating || !albumName.trim()}
                  >
                    {creating ? "Creating…" : "Create"}
                  </Button>
                  {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
                </form>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            {albums.length === 0 && <div className="text-gray-500">No albums yet.</div>}
            {albums.map(album => (
              <AlbumCard
                key={album.id}
                album={album}
                loadLocalGallery={loadLocalGallery}
                setError={setError}
                onImageClick={_img => undefined}
              />
            ))}
          </div>

          {/* Provider Albums/Images Section (additional, not replacing local) */}
          {providerEnabled && (
            <>
              <hr className="my-8" />
              <h3 className="text-xl font-semibold mb-2">External Albums</h3>
              {providerAlbums.length === 0 && <div className="text-gray-500">No external albums found.</div>}
              {providerAlbums.map(album => (
                <div key={album.id} className="border rounded p-3 mb-2">
                  <div className="font-bold mb-2 flex items-center justify-between">
                    <span>{album.name}</span>
                    <button
                      className="text-xs text-blue-600 hover:underline ml-2"
                      onClick={() => handleProviderAlbumSelect(album.id)}
                    >Load Images</button>
                  </div>
                </div>
              ))}
              <h3 className="text-xl font-semibold mb-2" id="provider_images">External Images</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {providerImages.length === 0 && <span className="text-gray-400">No images selected</span>}
                {providerImages.map(img => (
                  <ImageCard
                    key={img.id}
                    src={getProviderImageStreamUrl(img.id, "fullsize")}
                    alt={img.filename}
                    filename={img.filename}

                    image={img}
                    showControls={false}
                  />
                ))}
              </div>
              {providerImagesHasMore && (
                <div className="flex justify-center mt-4">
                  <button
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                    onClick={handleProviderImagesLoadMore}
                    disabled={loading}
                  >
                    {loading ? "Loading…" : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      );
}