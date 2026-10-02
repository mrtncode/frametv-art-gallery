import { Dialog, Progress } from "radix-ui";
import { Link } from "react-router";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import SourceLogo from "./SourceLogo";
import type { Artwork, DiscoverSource, ImportJob } from "~/utils/discoverApi";

interface DownloadProgressModalProps {
  open: boolean;
  artwork: Artwork | null;
  source: DiscoverSource | null;
  /** null until the server has accepted the import */
  job: ImportJob | null;
  /** set when the import could not even be started */
  startError: string;
  onClose: () => void;
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

/**
 * Shown while an artwork downloads. The wait is real, and so is the thank-you: the
 * source is making a high-resolution file available for free, so this is the moment to
 * point at where to support them. Nothing here delays the download or blocks closing.
 */
export default function DownloadProgressModal({
  open,
  artwork,
  source,
  job,
  startError,
  onClose,
  onRetry,
}: DownloadProgressModalProps) {
  if (!artwork || !source) return null;

  const failed = Boolean(startError) || job?.state === "error";
  const finished = job?.state === "done";
  const running = !failed && !finished;
  const percent = finished ? 100 : (job?.percent ?? null);

  const received = job?.received_bytes ?? 0;
  const total = job?.total_bytes ?? null;
  const sizeText =
    received > 0 ? (total ? `${megabytes(received)} of ${megabytes(total)} MB` : `${megabytes(received)} MB`) : "";

  const heading = failed ? "That didn't work" : finished ? "Added to your gallery" : "Adding to your gallery";
  const status = failed
    ? startError || job?.error || "Something went wrong."
    : finished
      ? qualityNote(job!)
      : job?.message || "Getting ready…";

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 text-foreground shadow-xl focus:outline-none">
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
              <XMarkIcon className="size-5" />
            </Dialog.Close>
          </div>

          <div aria-live="polite" className="mb-5">
            {finished && (
              <div className="flex items-start gap-2 text-sm">
                <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
                <p>{status}</p>
              </div>
            )}
            {failed && (
              <div className="flex items-start gap-2 text-sm">
                <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
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

          <section
            aria-label={`Support ${source.name}`}
            className="rounded-lg border border-border bg-muted/40 p-4"
          >
            <div className="flex gap-3">
              <SourceLogo source={source} className="size-11" />
              <div className="min-w-0">
                <h4 className="flex items-center gap-1.5 font-semibold">
                  Please support {source.short_name}
                  <HeartIcon className="size-4 text-rose-500" aria-hidden="true" />
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  This high-resolution file is free because {source.name} makes it available to everyone.
                  A gift, however small, helps keep art like this open.
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
