import { ArrowSquareOut as ArrowTopRightOnSquareIcon, Check as CheckIcon, Plus as PlusIcon } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import ArtworkImage from "./ArtworkImage";
import FitBadge from "./FitBadge";
import type { Artwork, DiscoverSource } from "~/utils/discoverApi";

interface ArtworkCardProps {
  artwork: Artwork;
  source: DiscoverSource;
  /** already added during this visit */
  added: boolean;
  onAdd: (artwork: Artwork) => void;
  onView: (artwork: Artwork) => void;
}

export default function ArtworkCard({ artwork, source, added, onAdd, onView }: ArtworkCardProps) {
  const by = [artwork.artist, artwork.date].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {/* The tile is the shape of the TV, so it previews the picture as it would fill the screen. */}
      <div className="relative aspect-video overflow-hidden bg-neutral-900">
        <ArtworkImage artwork={artwork} />
        <button
          type="button"
          onClick={() => onView(artwork)}
          aria-label={`View ${artwork.title} full size`}
          className="absolute inset-0 cursor-zoom-in focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70 focus-visible:outline-none"
        />
        <FitBadge artwork={artwork} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug" title={artwork.title}>
          {artwork.title}
        </h3>
        {by && <p className="line-clamp-1 text-xs text-muted-foreground">{by}</p>}
        <p className="text-xs text-muted-foreground">
          {artwork.width && artwork.height ? `${artwork.width} × ${artwork.height} px · ` : ""}
          {artwork.license}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={added}
            onClick={() => onAdd(artwork)}
            aria-label={`${added ? "Added" : "Add to gallery"}: ${artwork.title}`}
          >
            {added ? <CheckIcon aria-hidden="true" /> : <PlusIcon weight="regular" aria-hidden="true" />}
            {added ? "Added" : "Add to gallery"}
          </Button>
          <Button asChild size="icon-sm" variant="outline">
            <a
              href={artwork.page_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${artwork.title} at ${source.short_name}`}
              title={`View at ${source.short_name}`}
            >
              <ArrowTopRightOnSquareIcon aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
