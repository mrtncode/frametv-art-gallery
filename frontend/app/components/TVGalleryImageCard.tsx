import { useState } from "react";
import { Check as CheckIcon, Image as PhotoIcon, Play as PlayIcon, Trash as TrashIcon } from "@phosphor-icons/react";
import { Skeleton } from "~/components/ui/skeleton"
import ImageSource from "./ImageSource";
import { type TVGalleryImage, type TVImageOrigin } from "../utils/tvApi";

function Loader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <Skeleton className="h-full w-full bg-muted" />
    </div>
  );
}

const ORIGIN_BADGE: Record<TVImageOrigin, { label: string; className: string }> = {
  app: { label: "From this app", className: "bg-selection text-selection-foreground" },
  personal: { label: "Other upload", className: "bg-secondary text-secondary-foreground" },
  samsung: { label: "Samsung Art Store", className: "bg-muted text-muted-foreground" },
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
    // The whole card is the selection target: a click anywhere on it (shift-click for a range) picks it.
    // The buttons and the source link keep their own clicks.
    <div
      key={image.content_id}
      onClick={onToggleSelect ? (event) => onToggleSelect(event.shiftKey) : undefined}
      className={
        "relative flex gap-4 p-4 bg-card border rounded-lg hover:shadow-md transition-shadow " +
        (onToggleSelect ? "cursor-pointer select-none has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 " : "") +
        (selected ? "border-primary ring-1 ring-primary" : "border-border") +
        // Ours stand out with a tint; Samsung's own art is quieter.
        (image.origin === "app" ? " bg-selection/40 border-primary/30" : "") +
        (image.origin === "samsung" ? " opacity-75" : "")
      }
    >
      {onToggleSelect && (
        // A real checkbox, hidden but focusable, so the keyboard and screen readers can select too.
        <input
          type="checkbox"
          className="peer sr-only"
          checked={!!selected}
          aria-label={`Select ${image.filename}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onToggleSelect((event.nativeEvent as MouseEvent).shiftKey)}
        />
      )}
      {/* The thumbnail always comes from the parent's single batched request. Letting the
          <img> fall back to the per-image endpoint fired one TV websocket per card, which
          is what used to pile up and starve the server when a TV stopped answering. */}
      <div className="relative h-20 w-20 shrink-0 self-center overflow-hidden rounded-xl bg-muted border border-border">
        {onToggleSelect && (
          <span
            aria-hidden="true"
            className={
              "absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full border shadow-sm transition-colors " +
              (selected ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/25 text-transparent")
            }
          >
            <CheckIcon weight="bold" className="size-3" />
          </span>
        )}
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
        {image.provenance && image.provenance.source && image.provenance.source !== "upload" && (
          <span className="block" onClick={(event) => event.stopPropagation()}>
            <ImageSource provenance={image.provenance} className="mt-1" />
          </span>
        )}
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
          onClick={(event) => { event.stopPropagation(); onPlay(image.content_id); }}
          className="inline-flex items-center justify-center rounded-lg border border-primary bg-transparent p-2 text-primary transition-colors hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          title="Play image"
          aria-label="Play image"
        >
          <PlayIcon weight="fill" className="w-5 h-5" />
        </button>
        <button
          onClick={(event) => { event.stopPropagation(); onDelete(image.content_id); }}
          className="inline-flex items-center justify-center p-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg transition-colors"
          title="Delete image"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}