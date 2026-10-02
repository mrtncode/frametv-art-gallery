import { useState } from "react";
import { TrashIcon, PlayIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "~/components/ui/skeleton"
import { type TVGalleryImage, type TVImageOrigin } from "../utils/tvApi";

function Loader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <Skeleton className="h-full w-full bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

const ORIGIN_BADGE: Record<TVImageOrigin, { label: string; className: string }> = {
  app: { label: "From this app", className: "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100" },
  personal: { label: "Other upload", className: "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100" },
  samsung: { label: "Samsung Art Store", className: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
};

type TVGalleryImageCardProps = {
  image: TVGalleryImage;
  selectedTvIp: string;
  /** true while the parent is still batch-fetching the missing thumbnails */
  thumbnailsLoading?: boolean;
  selected?: boolean;
  /** passing this shows the selection checkbox */
  onToggleSelect?: (shiftKey: boolean) => void;
  onPlay: (contentId: string) => void;
  onDelete: (contentId: string) => void;
  formatDate: (dateString: string) => string;
};

export default function TVGalleryImageCard({ image, selectedTvIp, thumbnailsLoading, selected, onToggleSelect, onPlay, onDelete, formatDate }: TVGalleryImageCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      key={image.content_id}
      className={
        "flex gap-4 p-4 bg-card border rounded-lg hover:shadow-md transition-shadow " +
        (selected ? "border-blue-500 ring-1 ring-blue-500" : "border-border") +
        // Ours stand out with an accent edge; Samsung's own art is quieter.
        (image.origin === "app" ? " border-l-4 border-l-blue-500" : "") +
        (image.origin === "samsung" ? " opacity-75" : "")
      }
    >
      {onToggleSelect && (
        <label className="flex items-center self-center cursor-pointer" title="Select image">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-600"
            checked={!!selected}
            onChange={(event) => onToggleSelect((event.nativeEvent as MouseEvent).shiftKey)}
          />
        </label>
      )}
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
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ORIGIN_BADGE[image.origin].className}`}
        >
          {ORIGIN_BADGE[image.origin].label}
        </span>
        <div className="text-xs text-muted-foreground mt-1 space-y-1">
          <p>
            Added: {formatDate(image.date_added)}
            {image.width && image.height ? ` · ${image.width}×${image.height}` : ""}
          </p>
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