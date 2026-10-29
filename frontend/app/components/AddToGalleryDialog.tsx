import { useEffect, useState } from "react";
import { Dialog, Progress } from "radix-ui";
import { Link } from "react-router";
import { ArrowSquareOut as ArrowTopRightOnSquareIcon, CheckCircle as CheckCircleIcon, Heart as HeartIcon, Warning as ExclamationTriangleIcon, X as XMarkIcon } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import ArtworkImage from "./ArtworkImage";
import { FitCriteriaList } from "./FitBadge";
import SourceLogo from "./SourceLogo";
import { FITS_MAX_LOSS } from "~/lib/fit";
import type { Artwork, DiscoverSource, Framing, ImportJob } from "~/utils/discoverApi";

export const NEW_ALBUM = "__new__";

export type AddChoice = { framing: Framing; albumId: string; newAlbumName: string };
type AlbumOption = { id: string; name: string };

interface AddToGalleryDialogProps {
  open: boolean;
  artwork: Artwork | null;
  source: DiscoverSource | null;
  albums: AlbumOption[];
  /** Last choices, so adding a second picture is one click */
  defaults: { framing: Framing; albumId: string };
  /** True once the choices are confirmed and the import is under way */
  started: boolean;
  /** null until the server has accepted the import */
  job: ImportJob | null;
  /** Set when the import could not even be started */
  startError: string;
  onConfirm: (choice: AddChoice) => void;
  onClose: () => void;
  /** Return to the choices after a failure */
  onRetry: () => void;
}

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

function qualityNote(job: ImportJob) {
  const result = job.result;
  if (!result) return "";
  if (result.duplicate_of) {
    return `You already had this one (${result.duplicate_of}), so nothing new was added.`;
  }
  if (result.quality === "tv_ready") {
    return `Ready for your Frame at ${result.width} × ${result.height}.`;
  }
  if (result.quality === "soft") {
    return `Saved at ${result.width} × ${result.height}. The original is a little under 4K, so it may look slightly soft on a large TV.`;
  }
  return `Saved at ${result.width} × ${result.height}. The original is low resolution, so expect it to look soft on the TV.`;
}

const field =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export default function AddToGalleryDialog({
  open,
  artwork,
  source,
  albums,
  defaults,
  started,
  job,
  startError,
  onConfirm,
  onClose,
  onRetry,
}: AddToGalleryDialogProps) {
  const [framing, setFraming] = useState<Framing>(defaults.framing);
  const [albumId, setAlbumId] = useState(defaults.albumId);
  const [newAlbumName, setNewAlbumName] = useState("");

  // Start from the last choices each time a different picture is opened.
  const artworkKey = artwork ? `${artwork.source}:${artwork.id}` : "";
  useEffect(() => {
    setFraming(defaults.framing);
    setAlbumId(albums.some((a) => a.id === defaults.albumId) ? defaults.albumId : "");
    setNewAlbumName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkKey]);

  if (!artwork || !source) return null;

  const loss = artwork.crop_loss;
  const choiceMatters = !artwork.tv_ready && loss !== null && loss > FITS_MAX_LOSS;
  const effectiveFraming: Framing = choiceMatters ? framing : "fill";
  const cropPct = loss === null ? null : Math.round(loss * 100);

  const failed = started && (Boolean(startError) || job?.state === "error");
  const finished = started && job?.state === "done";
  const running = started && !failed && !finished;
  const percent = finished ? 100 : (job?.percent ?? null);
  const received = job?.received_bytes ?? 0;
  const total = job?.total_bytes ?? null;
  const sizeText =
    received > 0 ? (total ? `${megabytes(received)} of ${megabytes(total)} MB` : `${megabytes(received)} MB`) : "";

  const heading = !started
    ? "Add to your gallery"
    : failed
      ? "That didn't work"
      : finished
        ? "Added to your gallery"
        : "Adding to your gallery";
  const status = failed
    ? startError || job?.error || "Something went wrong."
    : finished
      ? qualityNote(job!)
      : job?.message || "Getting ready…";

  const canConfirm = albumId !== NEW_ALBUM || newAlbumName.trim().length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            // Focus the dialog, not its close button, which would open with a focus ring on it.
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">{heading}</Dialog.Title>
              <Dialog.Description className="truncate text-sm text-muted-foreground">
                {artwork.title}
                {artwork.artist ? ` · ${artwork.artist}` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label="Close"
            >
              <XMarkIcon weight="regular" className="size-5" />
            </Dialog.Close>
          </div>

          {!started ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canConfirm) onConfirm({ framing: effectiveFraming, albumId, newAlbumName });
              }}
              className="space-y-5"
            >
              <div>
                <div className="relative aspect-video overflow-hidden rounded-md bg-neutral-900">
                  <ArtworkImage artwork={artwork} fit={effectiveFraming === "whole" ? "contain" : "cover"} lazy={false} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {effectiveFraming === "whole"
                    ? "Preview: the whole artwork. The TV shows it with a matte."
                    : "Preview: how it fills the screen."}
                </p>
              </div>

              <FitCriteriaList artwork={artwork} />

              {choiceMatters && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">How should it sit on the screen?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        [
                          "fill",
                          "Fill the screen",
                          cropPct === null ? "Crops to 16:9" : `Crops ${cropPct}% off the edges`,
                        ],
                        ["whole", "Keep the whole artwork", "The TV adds a matte around it"],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-md border p-3 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 ${
                          framing === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent"
                        }`}
                      >
                        <input
                          type="radio"
                          name="framing"
                          value={value}
                          checked={framing === value}
                          onChange={() => setFraming(value)}
                          className="sr-only"
                        />
                        <span className="block font-medium">{label}</span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div>
                <label htmlFor="add-album" className="mb-1.5 block text-sm font-medium">
                  Album
                </label>
                <select id="add-album" value={albumId} onChange={(e) => setAlbumId(e.target.value)} className={field}>
                  <option value="">No album</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.name}
                    </option>
                  ))}
                  <option value={NEW_ALBUM}>+ New album…</option>
                </select>
                {albumId === NEW_ALBUM && (
                  <Input
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="New album name"
                    aria-label="New album name"
                    className="mt-2"
                    autoFocus
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canConfirm}>
                  Add to gallery
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div aria-live="polite" className="mb-5">
                {finished && (
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" />
                    <p>{status}</p>
                  </div>
                )}
                {failed && (
                  <div className="flex items-start gap-2 text-sm">
                    <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
                    <p>{status}</p>
                  </div>
                )}
                {running && (
                  <>
                    <Progress.Root
                      value={percent}
                      max={100}
                      aria-label="Download progress"
                      className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <Progress.Indicator
                        className={`h-full rounded-full bg-primary transition-[width] duration-300 ${
                          percent === null ? "w-full animate-pulse" : ""
                        }`}
                        style={percent === null ? undefined : { width: `${percent}%` }}
                      />
                    </Progress.Root>
                    <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>{status}</span>
                      <span className="shrink-0 tabular-nums">{percent === null ? sizeText : `${Math.round(percent)}%`}</span>
                    </div>
                    {percent !== null && sizeText && (
                      <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground">{sizeText}</p>
                    )}
                  </>
                )}
              </div>

              <section aria-label={`Support ${source.support_name}`} className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex gap-3">
                  <SourceLogo source={source} src={source.support_icon_url} className="size-11" />
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 font-semibold">
                      Please support {source.support_name}
                      <HeartIcon className="size-4 text-primary" aria-hidden="true" />
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This high-resolution file is free because {source.support_name} makes it available to everyone. A
                      gift, however small, helps keep art like this open.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <a href={source.support_url} target="_blank" rel="noopener noreferrer">
                        {source.support_label}
                        <ArrowTopRightOnSquareIcon aria-hidden="true" />
                      </a>
                    </Button>
                  </div>
                </div>
              </section>

              <div className="mt-5 flex items-center justify-end gap-2">
                {failed && <Button onClick={onRetry}>Try again</Button>}
                {finished && (
                  <Button asChild>
                    <Link to="/gallery" onClick={onClose}>
                      View in gallery
                    </Link>
                  </Button>
                )}
                <Button variant="outline" onClick={onClose}>
                  {running ? "Hide" : finished ? "Keep browsing" : "Close"}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
