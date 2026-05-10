import { useState, useEffect } from "react";
import { TrashIcon, PlayIcon, ArrowPathIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "~/components/ui/skeleton"
import { toast } from "sonner";
import {
  getTvGalleryThumbnailUrl,
  type TVGalleryImage,
} from "../utils/tvApi";

function Loader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <Skeleton className="h-full w-full bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

type TVGalleryImageCardProps = {
  image: TVGalleryImage;
  selectedTvIp: string;
  onPlay: (contentId: string) => void;
  onDelete: (contentId: string) => void;
  formatDate: (dateString: string) => string;
};

export default function TVGalleryImageCard({ image, selectedTvIp, onPlay, onDelete, formatDate }: TVGalleryImageCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      key={image.content_id}
      className="flex gap-4 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        {!imgLoaded && !imgError && <Loader />}
        <img
          src={getTvGalleryThumbnailUrl(selectedTvIp, image.content_id)}
          alt={image.filename}
          className="h-full w-full object-cover"
          style={{ display: imgLoaded && !imgError ? "block" : "none" }}
          onLoad={() => setImgLoaded(true)}
          onError={(event) => {
            setImgError(true);
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) {
              fallback.style.display = "flex";
            }
          }}
        />
        <div
          className="absolute inset-0 hidden items-center justify-center text-gray-400"
          style={{ display: imgError ? "flex" : "none" }}
        >
          <PhotoIcon className="h-8 w-8" />
        </div>
      </div>

      <div className="flex-1 min-w-0 self-center">
        <p className="font-medium truncate">{image.filename}</p>
        <div className="text-xs text-gray-500 mt-1 space-y-1">
          <p>Added: {formatDate(image.date_added)}</p>
          <p className="text-gray-400 truncate">ID: {image.content_id}</p>
        </div>
      </div>
      <div className="flex gap-2 self-center ml-4">
        <button
          onClick={() => onPlay(image.content_id)}
          className="inline-flex items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          title="Play image"
        >
          <PlayIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onDelete(image.content_id)}
          className="inline-flex items-center justify-center p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          title="Delete image"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}