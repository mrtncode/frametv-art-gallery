

import React, { useEffect, useRef, useState } from "react";
import { deleteImage, fetchImages, fetchAlbums, uploadImage, createAlbum, addImagesToAlbum, fetchProviderAlbumImages, fetchProviderAlbums, getProviderImageStreamUrl, type ImageSort } from "../utils/galleryApi";
import ImageCard from "../components/imageCard";
import AlbumCard from "~/components/AlbumCard";
import ImageGrid from "~/components/imageGrid";
import { getTvs } from "~/utils/tvApi";
import ImageDropZone from "~/components/ImageDropZone";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import ImageUploadModal from "~/components/imageUploadModal";
import { PlusIcon } from "@heroicons/react/24/outline";

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

const NEW_ALBUM = "__new__";

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
  const [tvs, setTvs] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Multi-select: filenames, plus the last clicked row so shift-click can span a range.
  const [selected, setSelected] = useState<string[]>([]);
  const lastClickedIndex = useRef<number | null>(null);
  const [bulkAlbum, setBulkAlbum] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Files waiting on an album choice after a drop.
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [dropAlbumId, setDropAlbumId] = useState("");
  const [dropNewAlbumName, setDropNewAlbumName] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ImageSort>("newest");

  async function loadLocalGallery() {
    setLoading(true);
    try {
      const [imgs, als] = await Promise.all([fetchImages({ q: search, sort }), fetchAlbums()]);
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

  // Re-query on search and sort, debounced so typing does not fire a request per key.
  useEffect(() => {
    const timer = setTimeout(loadLocalGallery, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, sort]);

  useEffect(() => {
    loadProviderGallery();
    // Load TVs once and share with image cards to avoid per-card requests
    (async () => {
      try {
        const list = await getTvs();
        setTvs(list || []);
      } catch (_e) {
        // ignore
      }
    })();
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

  /** Resolve a destination album id, creating the album first when asked for a new one. */
  async function resolveAlbumId(albumId: string, newAlbumName: string): Promise<string | undefined> {
    if (albumId !== NEW_ALBUM) return albumId || undefined;

    const name = newAlbumName.trim();
    if (!name) throw new Error("Enter a name for the new album");

    const existing = albums.find(album => album.name === name);
    const updatedAlbums: Album[] = existing ? albums : await createAlbum(name);
    setAlbums(updatedAlbums);

    const target = updatedAlbums.find(album => album.name === name);
    if (!target) throw new Error("Failed to create album");
    return String(target.id);
  }

  /** Upload a batch of files into one album, reporting how it went. */
  async function uploadFiles(files: File[], albumId: string | undefined) {
    setLoading(true);
    setError("");
    let uploaded = 0;
    let failed = 0;
    const duplicates: string[] = [];

    for (const file of files) {
      try {
        const result = await uploadImage(file, albumId);
        uploaded++;
        if (result?.duplicate_of) duplicates.push(`${result.filename} (same as ${result.duplicate_of})`);
      } catch (err) {
        failed++;
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }

    if (duplicates.length > 0) {
      toast.warning(`Already in the gallery: ${duplicates.join(", ")}`, {
        position: "top-center",
        duration: 8000,
      });
    }

    if (uploaded > 0) await loadLocalGallery();
    setLoading(false);

    if (failed === 0) {
      toast.success(`Uploaded ${uploaded} image${uploaded === 1 ? "" : "s"}`, { position: "top-center" });
    } else if (uploaded > 0) {
      setError(`Uploaded ${uploaded}, but ${failed} failed`);
    } else {
      setError("No valid image files were uploaded");
    }
  }

  /** Dropped files wait in a modal so the album can be chosen for this batch. */
  async function handleFilesDropped(files: File[]) {
    setError("");
    setDropAlbumId("");
    setDropNewAlbumName("");
    setPendingFiles(files);
  }

  async function confirmDropUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingFiles) return;
    let albumId: string | undefined;
    try {
      albumId = await resolveAlbumId(dropAlbumId, dropNewAlbumName);
    } catch (e: any) {
      setError(e.message || "Failed to prepare album");
      return;
    }
    const files = pendingFiles;
    setPendingFiles(null);
    await uploadFiles(files, albumId);
  }

  function toggleSelect(filename: string, index: number, shiftKey: boolean) {
    setSelected(prev => {
      const anchor = lastClickedIndex.current;
      if (shiftKey && anchor !== null) {
        const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
        const range = images.slice(from, to + 1).map(img => img.filename);
        const next = new Set(prev);
        const selecting = !prev.includes(filename);
        range.forEach(name => (selecting ? next.add(name) : next.delete(name)));
        return Array.from(next);
      }
      return prev.includes(filename) ? prev.filter(name => name !== filename) : [...prev, filename];
    });
    lastClickedIndex.current = index;
  }

  async function handleBulkAssign() {
    if (!bulkAlbum || selected.length === 0) return;
    setBulkBusy(true);
    setError("");
    try {
      await addImagesToAlbum(bulkAlbum, selected);
      toast.success(`${selected.length} image${selected.length === 1 ? "" : "s"} moved to ${bulkAlbum}`, { position: "top-center" });
      setSelected([]);
      setBulkAlbum("");
      lastClickedIndex.current = null;
      await loadLocalGallery();
    } catch (e: any) {
      setError(e.message || "Failed to assign images to album");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selected.length === 0) return;
    const count = selected.length;
    if (!window.confirm(`Delete ${count} image${count === 1 ? "" : "s"}? This cannot be undone.`)) return;

    setBulkBusy(true);
    setError("");
    let deleted = 0;
    const failures: string[] = [];
    for (const filename of selected) {
      try {
        await deleteImage(filename);
        deleted++;
      } catch (e: any) {
        failures.push(filename);
        console.error(`Failed to delete ${filename}:`, e);
      }
    }

    setSelected([]);
    lastClickedIndex.current = null;
    await loadLocalGallery();
    setBulkBusy(false);

    if (failures.length === 0) {
      toast.success(`Deleted ${deleted} image${deleted === 1 ? "" : "s"}`, { position: "top-center" });
    } else {
      setError(`Deleted ${deleted}, but ${failures.length} failed: ${failures.join(", ")}`);
    }
  }

  return (
    <ImageDropZone
        className="max-w-6xl mx-auto py-8 px-4 pb-28"
        disabled={loading}
      onFilesDropped={handleFilesDropped}
    >
      <h1 className="text-2xl font-bold mb-6 mt-3 text-center text-foreground">Gallery</h1>

          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-xl font-semibold">Uploaded Images</h3>
            {images.length > 0 && (
              <button
                type="button"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => {
                  setSelected(selected.length === images.length ? [] : images.map(img => img.filename));
                  lastClickedIndex.current = null;
                }}
              >
                {selected.length === images.length ? "Clear selection" : "Select all"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              aria-label="Search images by name"
              className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 flex-1 min-w-48"
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as ImageSort)}
              aria-label="Sort images"
              className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">By name</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Tick the boxes, or shift-click, to move or delete several images at once.</p>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="mb-8">
              <ImageGrid
                images={images}
                albums={albums}
                tvs={tvs}
                onDeleteImage={handleDeleteImage}
                onAssignSuccess={loadLocalGallery}
                selectedFilenames={selected}
                onToggleSelect={toggleSelect}
              />
            </div>
          )}

          {selected.length > 0 && (
            <div className="sticky bottom-4 z-30 mb-8 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-lg">
              <span className="text-sm font-medium">
                {selected.length} image{selected.length === 1 ? "" : "s"} selected
              </span>
              <select
                value={bulkAlbum}
                onChange={e => setBulkAlbum(e.target.value)}
                className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                disabled={bulkBusy}
              >
                <option value="">Move to album…</option>
                {albums.map(album => (
                  <option key={album.id} value={album.name}>{album.name}</option>
                ))}
              </select>
              <Button onClick={handleBulkAssign} disabled={bulkBusy || !bulkAlbum}>
                {bulkBusy ? "Working…" : "Move"}
              </Button>
              <Button
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => { setSelected([]); lastClickedIndex.current = null; }}
              >
                Clear
              </button>
            </div>
          )}

          <div className="flex-row flex justify-between items-center py-2 mb-3">
            <h3 className="text-xl font-semibold align-middle">Albums</h3>
            <Button onClick={() => setShowCreateAlbumModal(true)}>Create album</Button>
          </div>

          {/* Dropped files: pick where they land before anything is uploaded */}
          {pendingFiles && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-sm relative">
                <button
                  className="absolute top-2 right-2 text-muted-foreground hover:text-muted-foreground text-xl font-bold"
                  onClick={() => setPendingFiles(null)}
                  aria-label="Cancel"
                >
                  ×
                </button>
                <h4 className="text-base font-semibold mb-1">
                  Upload {pendingFiles.length} image{pendingFiles.length === 1 ? "" : "s"}
                </h4>
                <p className="text-sm text-muted-foreground mb-3">Choose where they should go.</p>
                <form onSubmit={confirmDropUpload} className="flex flex-col gap-2">
                  <select
                    value={dropAlbumId}
                    onChange={e => setDropAlbumId(e.target.value)}
                    className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    autoFocus
                  >
                    <option value="">No album</option>
                    {albums.map(album => (
                      <option key={album.id} value={album.id}>{album.name}</option>
                    ))}
                    <option value={NEW_ALBUM}>+ New album…</option>
                  </select>
                  {dropAlbumId === NEW_ALBUM && (
                    <input
                      type="text"
                      value={dropNewAlbumName}
                      onChange={e => setDropNewAlbumName(e.target.value)}
                      placeholder="New album name"
                      className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  )}
                  <Button
                    type="submit"
                    className="px-4 py-2 text-sm"
                    disabled={dropAlbumId === NEW_ALBUM && !dropNewAlbumName.trim()}
                  >
                    Upload
                  </Button>
                  {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
                </form>
              </div>
            </div>
          )}

          {/* Modal for Create Album */}
          {showCreateAlbumModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-sm relative">
                <button
                  className="absolute top-2 right-2 text-muted-foreground hover:text-muted-foreground text-xl font-bold"
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
            {albums.length === 0 && <div className="text-muted-foreground">No albums yet.</div>}
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
              {providerAlbums.length === 0 && <div className="text-muted-foreground">No external albums found.</div>}
              {providerAlbums.map(album => (
                <div key={album.id} className="border rounded p-3 mb-2">
                  <div className="font-bold mb-2 flex items-center justify-between">
                    <span>{album.name}</span>
                    <button
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-2"
                      onClick={() => handleProviderAlbumSelect(album.id)}
                    >Load Images</button>
                  </div>
                </div>
              ))}
              <h3 className="text-xl font-semibold mb-2" id="provider_images">External Images</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {providerImages.length === 0 && <span className="text-muted-foreground">No images selected</span>}
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

      {/* Floating Action Button for Upload */}
      <button
        type="button"
        onClick={() => setShowUploadModal(true)}
        aria-label="Upload Image"
        title="Upload Image"
        className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-40 flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-full shadow-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
      >
        <PlusIcon className="w-7 h-7" strokeWidth={2.5} />
      </button>

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        albums={albums}
        onUploadSuccess={loadLocalGallery}
      />
    </ImageDropZone>
  );
}

