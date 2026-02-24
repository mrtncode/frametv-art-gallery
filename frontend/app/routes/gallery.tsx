
import React, { useEffect, useState } from "react";
import { fetchImages, fetchAlbums, createAlbum, addImageToAlbum, deleteAlbum, fetchProviderAlbumImages, fetchProviderAlbums, getProviderImageStreamUrl } from "../utils/galleryApi";
import { sendToTV, playUploadedImage, tvPowerOn, tvPowerOff, tvArtMode, tvStatus, getTvs, TVError } from "../utils/tvApi";
type Album = { name: string; images: string[] };
type ProviderAlbum = { id: string; name: string; asset_count: number };
type ProviderImage = { id: string; filename: string; thumb_url: string; metadata: any };

export default function Gallery() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [providerAlbums, setProviderAlbums] = useState<ProviderAlbum[]>([]);
  const [providerImages, setProviderImages] = useState<ProviderImage[]>([]);
  const [useProvider, setUseProvider] = useState(true); // toggle to test
  const [albumName, setAlbumName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<{ type: 'image'|'album'; data: any }|null>(null);
  const [tvLoading, setTvLoading] = useState(false);
  const [tvs, setTvs] = useState<{ ip: string; name?: string; mac?: string }[]>([]);
  const [selectedTvIp, setSelectedTvIp] = useState<string>("");
  const [tvStatusState, setTvStatusState] = useState<any>(null);

  async function handleSendToTV(filename: string) {
    if (!selectedTvIp) {
      setError("Select a TV");
      return;
    }
    setTvLoading(true);
    try {
      await sendToTV({ ip: selectedTvIp, filename });
      setError("");
    } catch (e: any) {
      console.log("error", e)
      if (e instanceof TVError && e.status === 400) {
        setError("There was a problem communicating with the TV. Please ensure the TV is reachable and has enough storage space for new images.")
        return
      }
      setError((e as Error).message || "Failed to send to TV");
    } finally {
      setTvLoading(false);
    }
  }

  function getSelectedTv() {
    return tvs.find(tv => tv.ip === selectedTvIp);
  }

  async function handleTvPowerOn() {
    const tv = getSelectedTv();
    if (!tv) { setError("Select a TV"); return; }
    setTvLoading(true);
    try {
      await tvPowerOn(tv.ip, tv.mac || undefined);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to power on TV");
    } finally { setTvLoading(false); }
  }

  async function handleTvPowerOff() {
    const tv = getSelectedTv();
    if (!tv) { setError("Select a TV"); return; }
    setTvLoading(true);
    try {
      await tvPowerOff(tv.ip);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to power off TV");
    } finally { setTvLoading(false); }
  }

  async function handleTvArtMode() {
    const tv = getSelectedTv();
    if (!tv) { setError("Select a TV"); return; }
    setTvLoading(true);
    try {
      await tvArtMode(tv.ip);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to set art mode");
    } finally { setTvLoading(false); }
  }

  async function handleTvStatus() {
    const tv = getSelectedTv();
    if (!tv) { setError("Select a TV"); return; }
    setTvLoading(true);
    try {
      const status = await tvStatus(tv.ip);
      setTvStatusState(status);
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to get TV status");
    } finally { setTvLoading(false); }
  }

  async function loadLocalGallery() {
    setLoading(true);
    try {
      const [imgs, als] = await Promise.all([fetchImages(), fetchAlbums()]);
      setImages(imgs);
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
    } catch (e: any) {
      setError(e.message || "Failed to load provider gallery");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (useProvider) {
      loadProviderGallery();
    } else {
      loadLocalGallery();
    }
    getTvs().then(setTvs).catch(() => setTvs([]));
  }, [useProvider]);

  async function handleProviderAlbumSelect(albumId: string) {
    setLoading(true);
    try {
      const imgs = await fetchProviderAlbumImages(albumId);
      setProviderImages(imgs);
    } catch (e: any) {
      setError(e.message || "Failed to load provider album images");
    } finally {
      setLoading(false);
    }
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

  async function handleDeleteAlbum(album: string) {
    if (!window.confirm(`Delete album "${album}"?`)) return;
    try {
      await deleteAlbum(album);
      await loadLocalGallery();
    } catch (e: any) {
      setError(e.message || "Failed to delete album");
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
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        throw new Error("Upload failed");
      }
      await loadLocalGallery();
      setUploadFile(null);
    } catch (e: any) {
      setError(e.message || "Failed to upload");
      setUploading(false);
    }
  }

  async function handlePlayUploadedImage(filename: string) {
    if (!selectedTvIp) {
      setError("Select a TV");
      return;
    }
    setTvLoading(true);
    try {
      await playUploadedImage({ ip: selectedTvIp, filename });
      setError("");
    } catch (e: any) {
      setError(e.message || "Failed to play uploaded image on TV");
    } finally {
      setTvLoading(false);
    }
  }
  console.log("test")

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-4">Gallery</h2>

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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {images.map(img => (
            <div key={img} className="border rounded p-2 flex flex-col items-center">
              <img
                src={`/uploads/${img}`}
                alt={img}
                className="w-full h-32 object-contain mb-2 bg-gray-100"
                onClick={() => setModal({ type: 'image', data: img })}
                style={{ cursor: 'pointer' }}
              />
              <div className="flex flex-wrap gap-1 mb-2">
                {albums.map(album => (
                  <button
                    key={album.name}
                    className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-blue-200"
                    onClick={() => handleAddToAlbum(album.name, img)}
                  >
                    Add to {album.name}
                  </button>
                ))}
              </div>
              <button
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                onClick={() => handleSendToTV(img)}
                disabled={tvLoading}
              >Send to TV</button>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-xl font-semibold mb-2">Albums</h3>
      <div className="space-y-4">
        {albums.length === 0 && <div className="text-gray-500">No albums yet.</div>}
        {albums.map(album => (
          <div key={album.name} className="border rounded p-3">
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
                  src={`/uploads/${img}`}
                  alt={img}
                  className="w-16 h-16 object-cover rounded border"
                  onClick={() => setModal({ type: 'image', data: img })}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Popup - always rendered */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw] relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-black text-xl"
              onClick={() => setModal(null)}
              aria-label="Close"
            >×</button>
            {modal.type === 'image' && (
              <>
                <img src={`/uploads/${modal.data}`} alt={modal.data} className="w-full max-h-64 object-contain mb-4" />
                <div className="mb-2 text-sm text-gray-700">{modal.data}</div>
                {/* TV controls */}
                <div className="mt-4">
                  <div className="mb-2">
                    <label className="block text-sm mb-1">Select TV:</label>
                    <select
                      className="border px-2 py-1 rounded w-full"
                      value={selectedTvIp}
                      onChange={e => setSelectedTvIp(e.target.value)}
                      disabled={tvLoading}
                    >
                      <option value="">-- Select TV --</option>
                      {tvs.map(tv => (
                        <option key={tv.ip} value={tv.ip}>
                          {tv.name || tv.ip}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button
                      className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
                      onClick={() => handleSendToTV(modal.data)}
                      disabled={tvLoading || !selectedTvIp}
                    >
                      {tvLoading ? 'Uploading…' : 'Upload to TV'}
                    </button>
                    <button
                      className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
                      onClick={() => handlePlayUploadedImage(modal.data)}
                      disabled={tvLoading || !selectedTvIp}
                    >
                      Play on TV
                    </button>
                    <button
                      className="bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-50"
                      onClick={handleTvPowerOn}
                      disabled={tvLoading || !selectedTvIp}
                    >
                      Turn On TV
                    </button>
                  </div>
                  {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
                </div>
              </>
            )}
            {modal.type === 'album' && (
              <>
                <div className="text-lg font-bold mb-2">{modal.data.name}</div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {Array.isArray(modal.data.images) && modal.data.images.length === 0 && <span className="text-gray-400">No images</span>}
                  {Array.isArray(modal.data.images) && modal.data.images.map((img: string) => (
                    <img key={img} src={`/uploads/${img}`} alt={img} className="w-16 h-16 object-cover rounded border" />
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
