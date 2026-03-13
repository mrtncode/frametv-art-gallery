

import React, { useEffect, useState } from "react";
import { deleteImage, fetchImages, fetchAlbums, uploadImage, createAlbum, addImageToAlbum, deleteAlbum, fetchProviderAlbumImages, fetchProviderAlbums, getProviderImageStreamUrl, getUploadUrl } from "../utils/galleryApi";
import ImageCard from "../components/imageCard";
import AlbumCard from "~/components/AlbumCard";
import ImageGrid from "~/components/imageGrid";

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
  const [modal, setModal] = useState<{ type: 'image'|'album'; data: any }|null>(null);



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

  async function handleAddToAlbum(album: string, image: string) {
    try {
      await addImageToAlbum(album, image);
      await loadLocalGallery();
    } catch (e: any) {
      setError(e.message || "Failed to add image");
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
    } catch (e: any) {
      setError(e.message || "Failed to upload");
      setUploading(false);
    }
  }

  console.log("test")

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-4">Gallery</h2>

          {/* Local Upload and Albums Section */}
          <div className="mb-4">
            <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="border px-2 py-1 rounded w-full sm:w-auto"
                disabled={uploading}
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-3 py-1 rounded w-full sm:w-auto"
                disabled={uploading || !uploadFile}
              >{uploading ? "Uploading…" : "Upload Image"}</button>
            </form>
            {error && <div className="text-red-500 mt-1">{error}</div>}
          </div>

          <div className="mb-8">
            <form onSubmit={handleCreateAlbum} className="flex gap-2 items-center">
              <input
                type="text"
                value={albumName}
                onChange={e => setAlbumName(e.target.value)}
                placeholder="New album name"
                className="border px-2 py-1 rounded"
              />
              <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">Create Album</button>
            </form>
            {error && <div className="text-red-500 mt-1">{error}</div>}
          </div>

          <h3 className="text-xl font-semibold mb-2">Uploaded Images</h3>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="mb-8">
              <ImageGrid
                images={images}
                onImageClick={img => setModal({ type: 'image', data: img })}
              />
            </div>
          )}
          <div className="space-y-4">
            {albums.length === 0 && <div className="text-gray-500">No albums yet.</div>}
            {albums.map(album => (
              <AlbumCard key={album.id} album={album} loadLocalGallery={loadLocalGallery} setError={setError} />
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
                    onClick={() => setModal({ type: 'image', data: img })}
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

          {/* Modal Popup - always rendered */}
          {modal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-white rounded-lg shadow-lg p-6 min-w-[70vwpx] max-w-[90vw] relative">
                <button
                  className="absolute top-2 right-2 text-gray-500 hover:text-black text-xl"
                  onClick={() => setModal(null)}
                  aria-label="Close"
                >×</button>
                {modal.type === 'image' && (() => {
                  const imgObj: GalleryImage = modal.data;
                  let imgSrc = imgObj.type === "local"
                    ? getUploadUrl(imgObj.filename)
                    : getProviderImageStreamUrl(imgObj.id, "fullsize");
                  let imgAlt = imgObj.filename;
                  let filename = imgObj.filename;
                  return (
                    <>
                      <ImageCard
                        src={imgSrc}
                        alt={imgAlt}
                        filename={filename}
                        image={imgObj}
                        large
                        showControls={true}
                        onDelete={() => handleDeleteImage(imgObj)}
                      />
                    </>
                  );
                })()}
                {modal.type === 'album' && (
                  <>
                    <div className="text-lg font-bold mb-2">{modal.data.name}</div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Array.isArray(modal.data.images) && modal.data.images.length === 0 && <span className="text-gray-400">No images</span>}
                      {Array.isArray(modal.data.images) && modal.data.images.map((img: string) => (
                        <img key={img} src={getUploadUrl(img)} alt={img} className="w-16 h-16 object-cover rounded border" />
                      ))}
                    </div>
                    {/* TV controls and info can go here */}
                    <div className="mt-4 text-center text-gray-500">TV controls coming soon…</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }