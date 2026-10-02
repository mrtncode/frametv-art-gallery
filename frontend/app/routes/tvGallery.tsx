import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { Popover } from "radix-ui";
import { CheckCircleIcon, FunnelIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import TVGalleryImageCard from "~/components/TVGalleryImageCard";
import { Skeleton } from "~/components/ui/skeleton";

import { toast } from "sonner";
import {
  deleteTvGalleryImage,
  deleteTvGalleryImages,
  fetchTvGalleryThumbnails,
  getTvGalleryImages,
  getTvs,
  playTvGalleryImage,
  type TVGalleryImage,
  type TVImageOrigin,
} from "~/utils/tvApi";

// Ours first, then other personal uploads, then Samsung's own art. The TV's order is kept
// within each group.
const ORIGIN_RANK: Record<TVImageOrigin, number> = { app: 0, personal: 1, samsung: 2 };

function GallerySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">Loading the TV&apos;s gallery</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-lg border border-border bg-card p-4" aria-hidden="true">
          <Skeleton className="size-4 self-center rounded" />
          <Skeleton className="size-20 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 self-center">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="ml-4 flex gap-2 self-center">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TVGallery() {
  const [searchParams] = useSearchParams();
  const tvIp = searchParams.get("ip");

  const [images, setImages] = useState<TVGalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const [selectedTvIp, setSelectedTvIp] = useState<string>(tvIp || "");
  const [tvs, setTvs] = useState<any[]>([]);
  const [tvsLoaded, setTvsLoaded] = useState(false);
  // The Samsung Art Store subscription is hidden by default so our own pictures stand out.
  const [showSamsung, setShowSamsung] = useState(false);
  // Multi-select, plus the last clicked row so shift-click can span a range.
  const [selected, setSelected] = useState<string[]>([]);
  const lastClickedIndex = useRef<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTVs();
  }, []);

  useEffect(() => {
    if (selectedTvIp) {
      fetchGallery();
    }
  }, [selectedTvIp]);

  const fetchTVs = async () => {
    try {
      const tvList = await getTvs();
      setTvs(tvList || []);
      // Open on the TV from the link if there is one, otherwise on the first TV.
      const requested = (tvList || []).find((tv: any) => tv.ip === tvIp);
      setSelectedTvIp(requested?.ip ?? (tvList || [])[0]?.ip ?? "");
    } catch (error) {
      console.error("Failed to fetch TVs:", error);
      toast.error("Failed to load TVs");
    } finally {
      setTvsLoaded(true);
    }
  };

  const fetchGallery = async () => {
    if (!selectedTvIp) return;
    setLoading(true);
    try {
      const tvImages = await getTvGalleryImages(selectedTvIp);
      setImages(tvImages || []);
      // Set loading to false now so the gallery list appears immediately
      setLoading(false);

      // Fetch missing thumbnails in background and update state when ready
      const missing = (tvImages || []).filter((i) => !i.thumbnail).map((i) => i.content_id);
      if (missing.length > 0) {
        setThumbnailsLoading(true);
        (async () => {
          try {
            const thumbs = await fetchTvGalleryThumbnails(selectedTvIp, missing);
            setImages((prev) => prev.map((img) => ({ ...img, thumbnail: img.thumbnail || thumbs[img.content_id] || null })));
          } catch (err) {
            console.warn("Failed to batch-fetch thumbnails", err);
          } finally {
            setThumbnailsLoading(false);
          }
        })();
      }
    } catch (error) {
      console.error("Failed to fetch gallery:", error);
      toast.error("Failed to load TV gallery");
      setLoading(false);
      setThumbnailsLoading(false);
    }
  };

  const samsungCount = images.filter((img) => img.origin === "samsung").length;
  const visibleImages = useMemo(
    () =>
      images
        .map((img, position) => ({ img, position }))
        .filter(({ img }) => showSamsung || img.origin !== "samsung")
        .sort((a, b) => ORIGIN_RANK[a.img.origin] - ORIGIN_RANK[b.img.origin] || a.position - b.position)
        .map(({ img }) => img),
    [images, showSamsung]
  );
  const allSelected = visibleImages.length > 0 && visibleImages.every((img) => selected.includes(img.content_id));

  function changeShowSamsung(show: boolean) {
    setShowSamsung(show);
    if (!show) {
      // Never leave something selected that cannot be seen.
      setSelected((prev) => prev.filter((id) => images.find((img) => img.content_id === id)?.origin !== "samsung"));
      lastClickedIndex.current = null;
    }
  }

  const handlePlayImage = async (contentId: string) => {
    try {
      await playTvGalleryImage(selectedTvIp, contentId);
      toast.success("Image playing on TV");
    } catch (error) {
      console.error("Failed to play image:", error);
      toast.error("Failed to play image");
    }
  };

  const handleDeleteImage = async (contentId: string) => {
    if (!confirm("Delete this image from TV?")) return;
    try {
      await deleteTvGalleryImage(selectedTvIp, contentId);
      toast.success("Image deleted");
      fetchGallery();
    } catch (error) {
      console.error("Failed to delete image:", error);
      toast.error("Failed to delete image");
    }
  };

  function toggleSelect(contentId: string, index: number, shiftKey: boolean) {
    setSelected(prev => {
      const anchor = lastClickedIndex.current;
      if (shiftKey && anchor !== null) {
        const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
        const range = visibleImages.slice(from, to + 1).map(img => img.content_id);
        const next = new Set(prev);
        const selecting = !prev.includes(contentId);
        range.forEach(id => (selecting ? next.add(id) : next.delete(id)));
        return Array.from(next);
      }
      return prev.includes(contentId) ? prev.filter(id => id !== contentId) : [...prev, contentId];
    });
    lastClickedIndex.current = index;
  }

  const handleDeleteSelected = async () => {
    const count = selected.length;
    if (count === 0) return;
    if (!confirm(`Delete ${count} image${count === 1 ? "" : "s"} from the TV? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      // One call for the whole selection: the TV takes the list, and it only serves
      // a single art channel anyway.
      const deleted = await deleteTvGalleryImages(selectedTvIp, selected);
      toast.success(`Deleted ${deleted} image${deleted === 1 ? "" : "s"} from the TV`);
      setSelected([]);
      lastClickedIndex.current = null;
      await fetchGallery();
    } catch (error: any) {
      console.error("Failed to delete images:", error);
      toast.error(error.message || "Failed to delete the images");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string): string => {
    if (!dateString || dateString === "Unknown") return "Unknown";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const iconButton =
    "relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold mb-6 mt-3 text-center text-foreground">TV Settings</h1>
      </div>

      {!tvsLoaded ? (
        <div className="mb-6 space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading your TVs</span>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : tvs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No TVs configured</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <label htmlFor="tv-select" className="block text-sm font-medium mb-2">Select TV</label>
            <select
              id="tv-select"
              value={selectedTvIp}
              onChange={(e) => {
                setSelectedTvIp(e.target.value);
                setImages([]);
                setSelected([]);
                lastClickedIndex.current = null;
              }}
              className="w-full p-2 border border-border rounded-lg bg-card"
            >
              <option value="" disabled>
                Select a TV
              </option>
              {tvs.map((tv) => (
                <option key={tv.ip} value={tv.ip}>
                  {tv.name || tv.ip}
                </option>
              ))}
            </select>
          </div>

          {!selectedTvIp ? (
            <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 px-6 py-10 text-center dark:border-blue-900 dark:bg-blue-950/30">
              <SparklesIcon className="mx-auto mb-3 h-10 w-10 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-foreground">Select a TV to view its gallery</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a TV above to load its artwork.
              </p>
            </div>
          ) : loading ? (
            <GallerySkeleton />
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No images on TV</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <p className="text-sm text-muted-foreground">
                  {visibleImages.length} image{visibleImages.length !== 1 ? "s" : ""} on TV
                  {!showSamsung && samsungCount > 0 && ` · ${samsungCount} Samsung hidden`}
                </p>
                <div className="flex items-center gap-2">
                  <Popover.Root>
                    <Popover.Trigger
                      className={iconButton}
                      aria-label="Filter images"
                      title="Filter images"
                    >
                      <FunnelIcon className="size-5" aria-hidden="true" />
                      {showSamsung && (
                        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-blue-600" aria-hidden="true" />
                      )}
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        align="end"
                        sideOffset={6}
                        className="z-50 w-72 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-lg focus:outline-none"
                      >
                        <p className="mb-2 font-semibold">Show on this TV</p>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-blue-600"
                            checked={showSamsung}
                            onChange={(e) => changeShowSamsung(e.target.checked)}
                          />
                          <span>
                            Samsung Art Store images{samsungCount > 0 ? ` (${samsungCount})` : ""}
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              The subscription art that comes with the TV (ids starting SAM). Hidden by default so
                              your own pictures stand out.
                            </span>
                          </span>
                        </label>
                        <Popover.Arrow className="fill-card" />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={allSelected ? "Clear selection" : `Select all ${visibleImages.length}`}
                    title={allSelected ? "Clear selection" : "Select all"}
                    aria-pressed={allSelected}
                    disabled={visibleImages.length === 0}
                    onClick={() => {
                      setSelected(allSelected ? [] : visibleImages.map(img => img.content_id));
                      lastClickedIndex.current = null;
                    }}
                  >
                    {allSelected ? (
                      <CheckCircleSolidIcon className="size-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    ) : (
                      <CheckCircleIcon className="size-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {visibleImages.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  <p>Only Samsung Art Store images are on this TV.</p>
                  <button
                    type="button"
                    className="mt-2 text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => changeShowSamsung(true)}
                  >
                    Show them
                  </button>
                </div>
              )}

              {visibleImages.map((image, index) => (
                <TVGalleryImageCard
                  key={image.content_id}
                  image={image}
                  selectedTvIp={selectedTvIp}
                  thumbnailsLoading={thumbnailsLoading}
                  selected={selected.includes(image.content_id)}
                  onToggleSelect={(shiftKey) => toggleSelect(image.content_id, index, shiftKey)}
                  onPlay={handlePlayImage}
                  onDelete={handleDeleteImage}
                  formatDate={formatDate}
                />
              ))}

              {selected.length > 0 && (
                <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
                  <span className="text-sm font-medium">
                    {selected.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg"
                  >
                    {deleting ? "Deleting…" : "Delete from TV"}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:underline"
                    onClick={() => { setSelected([]); lastClickedIndex.current = null; }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
