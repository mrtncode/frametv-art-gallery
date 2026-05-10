import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { SparklesIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import TVGalleryImageCard from "~/components/TVGalleryImageCard";

import { toast } from "sonner";
import {
  deleteTvGalleryImage,
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
  const [selectedTvIp, setSelectedTvIp] = useState<string>(tvIp || "");
  const [tvs, setTvs] = useState<any[]>([]);

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
      } else if (tvList?.length > 0) {
        setSelectedTvIp(tvList[0].ip);
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
    } catch (error) {
      console.error("Failed to fetch gallery:", error);
      toast.error("Failed to load TV gallery");
    } finally {
      setLoading(false);
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
        <SparklesIcon className="w-6 h-6" />
        <h1 className="text-3xl font-bold">TV Gallery</h1>
      </div>

      {tvs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No TVs configured</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select TV</label>
            <select
              value={selectedTvIp}
              onChange={(e) => setSelectedTvIp(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-950"
            >
              {tvs.map((tv) => (
                <option key={tv.ip} value={tv.ip}>
                  {tv.name || tv.ip}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No images on TV</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                {images.length} image{images.length !== 1 ? "s" : ""} on TV
              </p>
              {images.map((image) => (
                <TVGalleryImageCard
                  key={image.content_id}
                  image={image}
                  selectedTvIp={selectedTvIp}
                  onPlay={handlePlayImage}
                  onDelete={handleDeleteImage}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
