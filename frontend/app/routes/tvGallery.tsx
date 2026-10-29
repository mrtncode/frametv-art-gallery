import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { SparklesIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import TVGalleryImageCard from "~/components/TVGalleryImageCard";

import { toast } from "sonner";
import {
  deleteTvGalleryImage,
  deleteTvGalleryImages,
  fetchTvGalleryThumbnails,
  getTvGalleryImages,
  getTvs,
  playTvGalleryImage,
  type TVGalleryImage,
} from "~/utils/tvApi";

export default function TVGallery() {
  const [searchParams] = useSearchParams();
  const tvIp = searchParams.get("ip");

  const [images, setImages] = useState<TVGalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const [selectedTvIp, setSelectedTvIp] = useState<string>(tvIp || "");
  const [tvs, setTvs] = useState<any[]>([]);
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
      if (tvIp) {
        setSelectedTvIp(tvIp);
      }
    } catch (error) {
      console.error("Failed to fetch TVs:", error);
      toast.error("Failed to load TVs");
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
        const range = images.slice(from, to + 1).map(img => img.content_id);
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

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold mb-6 mt-3 text-center text-foreground">TV Settings</h1>
      </div>

      {tvs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No TVs configured</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select TV</label>
            <select
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
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No images on TV</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <p className="text-sm text-muted-foreground">
                  {images.length} image{images.length !== 1 ? "s" : ""} on TV
                </p>
                <button
                  type="button"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => {
                    setSelected(selected.length === images.length ? [] : images.map(img => img.content_id));
                    lastClickedIndex.current = null;
                  }}
                >
                  {selected.length === images.length ? "Clear selection" : "Select all"}
                </button>
              </div>

              {images.map((image, index) => (
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
