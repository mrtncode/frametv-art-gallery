import { useState } from "react";
import { TrashIcon, PlayIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "~/components/ui/skeleton"
import { type TVGalleryImage } from "../utils/tvApi";

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
  /** true while the parent is still batch-fetching the missing thumbnails */
  thumbnailsLoading?: boolean;
  onPlay: (contentId: string) => void;
  onDelete: (contentId: string) => void;
  formatDate: (dateString: string) => string;
};

export default function TVGalleryImageCard({ image, selectedTvIp, thumbnailsLoading, onPlay, onDelete, formatDate }: TVGalleryImageCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      key={image.content_id}
      className="flex gap-4 p-4 bg-card border border-border rounded-lg hover:shadow-md transition-shadow"
    >
      {/* The thumbnail always comes from the parent's single batched request. Letting the
          <img> fall back to the per-image endpoint fired one TV websocket per card, which
          is what used to pile up and starve the server when a TV stopped answering. */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted border border-border">
        {image.thumbnail ? (
          <>
            {!imgLoaded && !imgError && <Loader />}
            <img
              src={`data:image/jpeg;base64,${image.thumbnail}`}
              alt={image.filename}
              className="h-full w-full object-cover"
              style={{ display: imgLoaded && !imgError ? "block" : "none" }}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
            {imgError && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <PhotoIcon className="h-8 w-8" />
              </div>
            )}
          </>
        ) : thumbnailsLoading ? (
          <Loader />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground" title="No preview available">
            <PhotoIcon className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 self-center">
        <p className="font-medium truncate">{image.filename}</p>
        <div className="text-xs text-muted-foreground mt-1 space-y-1">
          <p>Added: {formatDate(image.date_added)}</p>
          <p className="text-muted-foreground truncate">ID: {image.content_id}</p>
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