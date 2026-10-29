import { useState } from "react";
import { proxiedImageUrl, type Artwork } from "~/utils/discoverApi";

/**
 * An artwork's preview. It tries the source directly (as the museum prefers), then this
 * app's image proxy for sources that block the browser, then shows a plain placeholder.
 */
export default function ArtworkImage({
  artwork,
  fit = "cover",
  lazy = true,
}: {
  artwork: Artwork;
  fit?: "cover" | "contain";
  lazy?: boolean;
}) {
  const [stage, setStage] = useState<"direct" | "proxy" | "failed">("direct");

  return (
    <>
      {stage === "failed" && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
          Preview unavailable
        </span>
      )}
      <img
        key={stage}
        src={stage === "direct" ? artwork.thumb_url : proxiedImageUrl(artwork.thumb_url)}
        onError={() => setStage(stage === "direct" ? "proxy" : "failed")}
        alt={`${artwork.title}${artwork.artist ? ` by ${artwork.artist}` : ""}`}
        loading={lazy ? "lazy" : "eager"}
        referrerPolicy="no-referrer"
        className={`absolute inset-0 size-full ${fit === "contain" ? "object-contain" : "object-cover"} ${
          stage === "failed" ? "hidden" : ""
        }`}
      />
    </>
  );
}
