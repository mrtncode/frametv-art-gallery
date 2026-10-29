import { useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowSquareOut as ArrowTopRightOnSquareIcon, Check as CheckIcon, Plus as PlusIcon, X as XMarkIcon } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import SourceLogo from "./SourceLogo";
import { proxiedImageUrl, type Artwork, type DiscoverSource } from "~/utils/discoverApi";

/** The large picture if there is one, then the tile-sized one, each tried direct and then through the proxy. */
function FullImage({ artwork }: { artwork: Artwork }) {
  const big = artwork.hero_url ?? artwork.thumb_url;
  const candidates = [big, proxiedImageUrl(big), ...(artwork.hero_url ? [artwork.thumb_url, proxiedImageUrl(artwork.thumb_url)] : [])];
  const [attempt, setAttempt] = useState(0);
  if (attempt >= candidates.length) {
    return <span className="text-sm text-neutral-400">Preview unavailable</span>;
  }
  return (
    <img
      key={attempt}
      src={candidates[attempt]}
      alt={`${artwork.title}${artwork.artist ? ` by ${artwork.artist}` : ""}`}
      referrerPolicy="no-referrer"
      onError={() => setAttempt((n) => n + 1)}
      className="h-full w-full object-contain"
    />
  );
}

interface ArtworkViewerProps {
  artwork: Artwork | null;
  source: DiscoverSource | null;
  added: boolean;
  onAdd: (artwork: Artwork) => void;
  onClose: () => void;
}

/** A full-screen look at one picture, whole, with where it came from underneath. */
export default function ArtworkViewer({ artwork, source, added, onAdd, onClose }: ArtworkViewerProps) {
  if (!artwork) return null;

  const aspect = artwork.aspect ?? (artwork.width && artwork.height ? artwork.width / artwork.height : null);
  const shape = !aspect ? null : aspect > 1.05 ? "Landscape" : aspect < 0.95 ? "Portrait" : "Square";
  let domain = "";
  try {
    domain = new URL(artwork.page_url).hostname.replace(/^www\./, "");
  } catch {
    // No usable page address.
  }
  const by = [artwork.artist, artwork.date].filter(Boolean).join(" · ");
  const facts = [
    artwork.width && artwork.height ? `${artwork.width} × ${artwork.height} px` : "",
    shape ?? "",
    artwork.license,
  ].filter(Boolean);

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            // Focus the dialog, not its close button, which would open with a focus ring on it.
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className="fixed inset-0 z-50 flex flex-col text-white focus:outline-none">
          {/* The picture takes everything the bar leaves; clicking the empty space around it closes. */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6"
            onClick={(event) => event.target === event.currentTarget && onClose()}
          >
            <FullImage key={`${artwork.source}:${artwork.id}`} artwork={artwork} />
          </div>

          {/* Close sits alone in the top-right corner, clear of the picture's details. */}
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 z-10 inline-flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none sm:right-5 sm:top-5"
            style={{ marginTop: "env(safe-area-inset-top)" }}
          >
            <XMarkIcon weight="regular" className="size-5" aria-hidden="true" />
          </Dialog.Close>

          {/* The source's icon on the left and the add button on the right are the same size and sit on one line. */}
          <div className="flex items-center gap-3 border-t border-white/15 bg-black/70 px-4 py-3 backdrop-blur sm:px-6">
            {source && <SourceLogo source={source} className="size-9" />}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold sm:text-base">{artwork.title}</Dialog.Title>
              <Dialog.Description className="truncate text-xs text-white/75">
                {[by, source?.name].filter(Boolean).join(" · ")}
              </Dialog.Description>
              <p className="truncate text-xs text-white/75">
                {facts.join(" · ")}
                {domain && (
                  <>
                    {facts.length > 0 && " · "}
                    <a
                      href={artwork.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                    >
                      {domain}
                      <ArrowTopRightOnSquareIcon className="size-3" aria-hidden="true" />
                    </a>
                  </>
                )}
              </p>
            </div>

            <Button
              size="icon"
              className="size-9 shrink-0 rounded-full bg-white text-neutral-950 hover:bg-white/90"
              disabled={added}
              onClick={() => onAdd(artwork)}
              aria-label={added ? "Added to your gallery" : "Add to gallery"}
              title={added ? "Added" : "Add to gallery"}
            >
              {added ? <CheckIcon className="size-5" aria-hidden="true" /> : <PlusIcon weight="regular" className="size-5" aria-hidden="true" />}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
