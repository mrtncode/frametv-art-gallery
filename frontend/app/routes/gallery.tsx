

import React, { useEffect, useMemo, useRef, useState } from "react";
import { deleteAlbum, deleteImage, fetchImages, fetchImageDetails, fetchAlbums, uploadImage, createAlbum, renameAlbum, addImagesToAlbum, fetchProviderAlbumImages, fetchProviderAlbums, getProviderImageStreamUrl, type ImageProvenance, type ImageSort } from "../utils/galleryApi";
import ImageCard from "../components/imageCard";
import AlbumStrip, { AlbumNameDialog, type Album } from "~/components/AlbumStrip";
import AlbumPicker, { ALL_ALBUMS, UNSORTED } from "~/components/AlbumPicker";
import ImageGrid from "~/components/imageGrid";
import { getTvs } from "~/utils/tvApi";
import ImageDropZone from "~/components/ImageDropZone";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import ImageUploadModal from "~/components/imageUploadModal";
import { Popover } from "radix-ui";
import { Tooltip } from "~/components/ui/tooltip";
import { ArrowsOutCardinal as MoveIcon, Trash as TrashIcon, X as XIcon, ArrowRight as ArrowRightIcon, ArrowsDownUp as ArrowsUpDownIcon, Check as CheckIcon, CheckCircle as CheckCircleIcon, CheckCircle as CheckCircleSolidIcon, MagnifyingGlass as MagnifyingGlassIcon, UploadSimple as ArrowUpTrayIcon, XCircle as XCircleIcon } from "@phosphor-icons/react";
type ProviderAlbum = { id: string; name: string; asset_count: number };
type ProviderImage = { id: string; filename: string; thumb_url: string; metadata: any };

type GalleryImage = {
  provenance?: ImageProvenance;
  id: string;
  filename: string;
  provider?: string;
  type: "local" | "provider";
  thumb_url?: string;
  metadata?: any;
};

const NEW_ALBUM = "__new__";

const SORT_OPTIONS: { value: ImageSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "By name" },
];

// The same square icon button as the TV gallery's filter and select-all.
const iconButton =
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/** Placeholder tiles shaped like ImageCard while the first list of images loads. */
function ImageGridSkeleton() {
  return (
    <div className="w-full py-3" role="status" aria-busy="true">
      <span className="sr-only">Loading your images</span>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function Gallery() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [providerAlbums, setProviderAlbums] = useState<ProviderAlbum[]>([]);
  const [providerImages, setProviderImages] = useState<GalleryImage[]>([]);
  const [providerImagesPage, setProviderImagesPage] = useState(0);
  const [providerImagesHasMore, setProviderImagesHasMore] = useState(false);
  const [providerImagesAlbumId, setProviderImagesAlbumId] = useState<string | null>(null);
  const [providerEnabled, setProviderEnabled] = useState<boolean>(false); // dynamically set
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // False until the first list of images arrives: the grid shows skeletons until then.
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [tvs, setTvs] = useState<any[]>([]);
  // The album being named: "new" to create one, an album to rename it.
  const [nameTarget, setNameTarget] = useState<Album | "new" | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Multi-select: filenames, plus the last clicked row so shift-click can span a range.
  const [selected, setSelected] = useState<string[]>([]);
  const lastClickedIndex = useRef<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Files waiting on an album choice after a drop.
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [dropAlbumId, setDropAlbumId] = useState("");
  const [dropNewAlbumName, setDropNewAlbumName] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ImageSort>("newest");
  // Which album the gallery shows, kept in the URL so coming back from an album page keeps it.
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get("album") || ALL_ALBUMS;

  function chooseScope(next: string) {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        if (next === ALL_ALBUMS) params.delete("album");
        else params.set("album", next);
        return params;
      },
      { replace: true }
    );
    // Never leave something selected that cannot be seen.
    setSelected([]);
    lastClickedIndex.current = null;
  }

  const scopeAlbum = albums.find(album => String(album.id) === scope) ?? null;
  const albumedFilenames = useMemo(() => new Set(albums.flatMap(album => album.images)), [albums]);
  const unsortedCount = images.filter(img => !albumedFilenames.has(img.filename)).length;
  const visibleImages = useMemo(() => {
    if (scope === ALL_ALBUMS) return images;
    if (scope === UNSORTED) return images.filter(img => !albumedFilenames.has(img.filename));
    const inAlbum = new Set(scopeAlbum?.images ?? []);
    return images.filter(img => inAlbum.has(img.filename));
  }, [images, albumedFilenames, scope, scopeAlbum]);
  const allSelected = visibleImages.length > 0 && visibleImages.every(img => selected.includes(img.filename));

  async function loadLocalGallery() {
    setLoading(true);
    try {
      const [imgs, als, details] = await Promise.all([
        fetchImages({ q: search, sort }),
        fetchAlbums(),
        // Where each image came from; the gallery works without it.
        fetchImageDetails().catch(() => ({} as Record<string, ImageProvenance>)),
      ]);
      // Convert to GalleryImage objects
      setImages(imgs.map((img: string) => ({
        id: img,
        filename: img,
        type: "local",
        provenance: details[img],
      })));
      setAlbums(als);
    } catch (e: any) {
      setError(e.message || "Failed to load gallery");
    } finally {
      setLoading(false);
      setImagesLoaded(true);
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


  /** Create or rename, from the album name dialog. Throws so the dialog can show why. */
  async function handleNameAlbum(name: string) {
    if (nameTarget === "new") {
      setAlbums(await createAlbum(name));
      toast.success(`Created ${name}`, { position: "top-center" });
    } else if (nameTarget) {
      setAlbums(await renameAlbum(nameTarget.id, name));
      toast.success(`Renamed to ${name}`, { position: "top-center" });
    }
  }

  async function handleDeleteAlbum(album: Album) {
    if (!window.confirm(`Delete the album "${album.name}"? Its images stay in the gallery.`)) return;
    try {
      setAlbums(await deleteAlbum(album.name));
      if (scope === String(album.id)) chooseScope(ALL_ALBUMS);
      toast.success(`Deleted ${album.name}`, { position: "top-center" });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete album", { position: "top-center" });
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
        const range = visibleImages.slice(from, to + 1).map(img => img.filename);
        const next = new Set(prev);
        const selecting = !prev.includes(filename);
        range.forEach(name => (selecting ? next.add(name) : next.delete(name)));
        return Array.from(next);
      }
      return prev.includes(filename) ? prev.filter(name => name !== filename) : [...prev, filename];
    });
    lastClickedIndex.current = index;
  }

  async function handleBulkAssign(albumName: string) {
    if (!albumName || selected.length === 0) return;
    setBulkBusy(true);
    setError("");
    try {
      await addImagesToAlbum(albumName, selected);
      toast.success(`${selected.length} image${selected.length === 1 ? "" : "s"} moved to ${albumName}`, { position: "top-center" });
      setSelected([]);
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
      <h1 className="sr-only">Gallery</h1>

      <AlbumStrip
        albums={albums}
        activeId={scopeAlbum ? String(scopeAlbum.id) : null}
        onSelect={id => chooseScope(id ?? ALL_ALBUMS)}
        onCreate={() => setNameTarget("new")}
        onRename={album => setNameTarget(album)}
        onDelete={handleDeleteAlbum}
        loading={!imagesLoaded}
      />

      {/* Search: which album, then what to look for; results update as you type. */}
      <div role="search" className="mb-3 flex gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-stretch rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
          <AlbumPicker albums={albums} scope={scopeAlbum || scope === UNSORTED ? scope : ALL_ALBUMS} onSelect={chooseScope} unsortedCount={unsortedCount} />
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={scopeAlbum ? `Search ${scopeAlbum.name}` : scope === UNSORTED ? "Search unsorted images" : "Search by name"}
              aria-label="Search images by name"
              className="h-full rounded-l-none rounded-r-md border-0 bg-transparent pl-9 pr-9 text-base shadow-none focus-visible:ring-0 dark:bg-transparent [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <XCircleIcon weight="regular" className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-1 flex items-center justify-between gap-2 px-1 text-sm">
        <p className="min-w-0 text-muted-foreground" aria-live="polite">
          {!imagesLoaded
            ? "Loading…"
            : `${visibleImages.length} image${visibleImages.length === 1 ? "" : "s"}${scopeAlbum ? ` in ${scopeAlbum.name}` : scope === UNSORTED ? " not in an album" : ""}`}
          {scopeAlbum && (
            <Link to={`/album/${encodeURIComponent(scopeAlbum.id)}`} className="ml-3 inline-flex items-center gap-1 text-primary hover:underline">
              Open album to send it to a TV
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Popover.Root>
            <Tooltip label={`Sort images: ${SORT_OPTIONS.find(o => o.value === sort)?.label}`}>
              <Popover.Trigger className={iconButton} aria-label={`Sort images, ${SORT_OPTIONS.find(o => o.value === sort)?.label}`}>
                <ArrowsUpDownIcon className="size-5" aria-hidden="true" />
              </Popover.Trigger>
            </Tooltip>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className="z-50 w-48 rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg focus:outline-none"
              >
                <div role="radiogroup" aria-label="Sort images">
                  {SORT_OPTIONS.map(option => (
                    <Popover.Close asChild key={option.value}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sort === option.value}
                        onClick={() => setSort(option.value)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {option.label}
                        {sort === option.value && <CheckIcon className="size-4 text-primary" aria-hidden="true" />}
                      </button>
                    </Popover.Close>
                  ))}
                </div>
                <Popover.Arrow className="fill-popover" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Tooltip label={allSelected ? "Clear selection" : `Select all ${visibleImages.length} image${visibleImages.length === 1 ? "" : "s"} shown`}>
            <button
              type="button"
              className={iconButton}
              aria-label={allSelected ? "Clear selection" : `Select all ${visibleImages.length}`}
              aria-pressed={allSelected}
              disabled={visibleImages.length === 0}
              onClick={() => {
                setSelected(allSelected ? [] : visibleImages.map(img => img.filename));
                lastClickedIndex.current = null;
              }}
            >
              {allSelected ? (
                <CheckCircleSolidIcon weight="fill" className="size-5 text-primary" aria-hidden="true" />
              ) : (
                <CheckCircleIcon className="size-5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {!imagesLoaded ? (
        <ImageGridSkeleton />
      ) : visibleImages.length === 0 ? (
        <div className="my-4 rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {search ? (
            <p>Nothing here matches “{search}”.</p>
          ) : scopeAlbum ? (
            <p>{scopeAlbum.name} is empty. In All albums, tick some images and use “Move to album”.</p>
          ) : scope === UNSORTED ? (
            <p>Every image is in an album.</p>
          ) : (
            <p>
              No images yet. Drop pictures anywhere on this page, upload them, or{" "}
              <Link to="/discover" className="text-primary hover:underline">find art in Discover</Link>.
            </p>
          )}
        </div>
      ) : (
        // Refetching for a new search keeps the old results in view, dimmed, rather than flashing skeletons.
        <div className={`mb-8 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <ImageGrid
            images={visibleImages}
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
            <div className="sticky bottom-20 z-30 mb-8 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
              <span className="text-sm font-medium">{selected.length} selected</span>
              <div className="ml-auto flex items-center gap-2">
                <Popover.Root>
                  <Tooltip label="Move to an album">
                    <Popover.Trigger className={iconButton} disabled={bulkBusy || albums.length === 0} aria-label="Move selected to an album">
                      <MoveIcon className="size-5" aria-hidden="true" />
                    </Popover.Trigger>
                  </Tooltip>
                  <Popover.Portal>
                    <Popover.Content
                      align="end"
                      side="top"
                      sideOffset={8}
                      collisionPadding={12}
                      className="z-50 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg focus:outline-none"
                    >
                      <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Move to…</p>
                      {albums.map(album => (
                        <Popover.Close asChild key={album.id}>
                          <button
                            type="button"
                            onClick={() => handleBulkAssign(album.name)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <span className="truncate">{album.name}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{album.images.length}</span>
                          </button>
                        </Popover.Close>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
                <Tooltip label="Clear selection">
                  <button
                    type="button"
                    className={iconButton}
                    aria-label="Clear selection"
                    onClick={() => { setSelected([]); lastClickedIndex.current = null; }}
                  >
                    <XIcon weight="regular" className="size-5" aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label={bulkBusy ? "Working…" : `Delete ${selected.length} image${selected.length === 1 ? "" : "s"}`}>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={bulkBusy}
                    aria-label={`Delete ${selected.length} selected`}
                    className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <TrashIcon className="size-5" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}

          {/* Dropped files: pick where they land before anything is uploaded */}
          {pendingFiles && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-sm relative">
                <button
                  className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => setPendingFiles(null)}
                  aria-label="Cancel"
                >
                  <XIcon weight="regular" className="size-5" aria-hidden="true" />
                </button>
                <h4 className="text-base font-semibold mb-1">
                  Upload {pendingFiles.length} image{pendingFiles.length === 1 ? "" : "s"}
                </h4>
                <p className="text-sm text-muted-foreground mb-3">Choose where they should go.</p>
                <form onSubmit={confirmDropUpload} className="flex flex-col gap-2">
                  <select
                    value={dropAlbumId}
                    onChange={e => setDropAlbumId(e.target.value)}
                    className="border border-input bg-background px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
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
                      className="border border-input bg-background px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                    />
                  )}
                  <Button
                    type="submit"
                    className="px-4 py-2 text-sm"
                    disabled={dropAlbumId === NEW_ALBUM && !dropNewAlbumName.trim()}
                  >
                    Upload
                  </Button>
                  {error && <div className="text-destructive text-sm mt-1">{error}</div>}
                </form>
              </div>
            </div>
          )}

          <AlbumNameDialog target={nameTarget} onClose={() => setNameTarget(null)} onSubmit={handleNameAlbum} />

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
                      className="text-xs text-primary hover:underline ml-2"
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
                    tvs={tvs}
                    showControls={false}
                  />
                ))}
              </div>
              {providerImagesHasMore && (
                <div className="flex justify-center mt-4">
                  <button
                    className="bg-primary text-primary-foreground px-4 py-2 rounded"
                    onClick={handleProviderImagesLoadMore}
                    disabled={loading}
                  >
                    {loading ? "Loading…" : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}

      {/* Floating Action Buttons */}
      {/* Out of the way while images are selected, so it never covers the action bar */}
      <div className={`fixed bottom-24 flex-row right-6 md:bottom-8 md:right-8 z-40 flex gap-2 ${selected.length > 0 ? "hidden" : ""}`}>
        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          aria-label="Upload Image"
          title="Upload Image"
          className=" flex items-center justify-center w-16 h-16 bg-primary hover:bg-primary-hover active:scale-95 text-primary-foreground rounded-full shadow-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          <ArrowUpTrayIcon className="w-7 h-7" weight="bold" />
        </button>
      </div>

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

