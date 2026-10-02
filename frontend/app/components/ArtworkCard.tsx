import { useState } from "react";
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { proxiedImageUrl, type Artwork, type DiscoverSource, type Framing } from "~/utils/discoverApi";

interface ArtworkCardProps {
  artwork: Artwork;
  source: DiscoverSource;
  framing: Framing;
  /** already added during this visit */
  added: boolean;
  disabled: boolean;
  onAdd: (artwork: Artwork) => void;
}

function framingBadge(artwork: Artwork, framing: Framing) {
  if (artwork.tv_ready) {
    return { text: "Ready for your Frame", tone: "good" as const };
  }
  const loss = artwork.crop_loss;
  if (loss === null) return { text: "Shape unknown", tone: "neutral" as const };
  if (framing === "whole") {
    return loss > 0.03
      ? { text: "Matte on TV", tone: "neutral" as const }
      : { text: "Fits 16:9", tone: "good" as const };
  }
  if (loss <= 0.03) return { text: "Fits 16:9", tone: "good" as const };
  const text = `Crops ${Math.round(loss * 100)}%`;
  return { text, tone: loss <= 0.1 ? ("good" as const) : loss <= 0.25 ? ("warn" as const) : ("bad" as const) };
}

const TONES = {
  good: "bg-green-100 text-green-900 dark:bg-green-900/60 dark:text-green-100",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  bad: "bg-red-100 text-red-900 dark:bg-red-900/60 dark:text-red-100",
  neutral: "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100",
};

export default function ArtworkCard({ artwork, source, framing, added, disabled, onAdd }: ArtworkCardProps) {
  const [preview, setPreview] = useState<"direct" | "proxy" | "failed">("direct");
  const badge = framingBadge(artwork, framing);
  const by = [artwork.artist, artwork.date].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {/* The tile is the shape of the TV, so it previews exactly what the chosen framing will show. */}
      <div className="relative aspect-video overflow-hidden bg-neutral-900">
        {preview === "failed" && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
            Preview unavailable
          </span>
        )}
        <img
          key={preview}
          src={preview === "direct" ? artwork.thumb_url : proxiedImageUrl(artwork.thumb_url)}
          onError={() => setPreview(preview === "direct" ? "proxy" : "failed")}
          alt={`${artwork.title}${artwork.artist ? ` by ${artwork.artist}` : ""}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={`absolute inset-0 size-full ${preview === "failed" ? "hidden" : ""} ${framing === "whole" && !artwork.tv_ready ? "object-contain" : "object-cover"}`}
        />
        <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${TONES[badge.tone]}`}>
          {badge.text}
        </span>
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
            disabled={disabled || added}
            onClick={() => onAdd(artwork)}
            aria-label={`${added ? "Added" : "Add to gallery"}: ${artwork.title}`}
          >
            {added ? <CheckIcon aria-hidden="true" /> : <ArrowDownTrayIcon aria-hidden="true" />}
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
