import { useState } from "react";
import { proxiedImageUrl, type DiscoverSource } from "~/utils/discoverApi";

function initials(name: string) {
  return name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The source's own icon, loaded straight from its website. If it cannot be loaded
 * (blocked, offline, moved) a lettered badge stands in so the layout never breaks.
 */
export default function SourceLogo({
  source,
  className = "size-10",
}: {
  source: DiscoverSource;
  className?: string;
}) {
  const [stage, setStage] = useState<"direct" | "proxy" | "failed">("direct");

  if (stage === "failed") {
    return (
      <span
        aria-hidden="true"
        className={`${className} inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary`}
      >
        {initials(source.short_name)}
      </span>
    );
  }

  return (
    <img
      key={`${source.id}-${stage}`}
      src={stage === "direct" ? source.icon_url : proxiedImageUrl(source.icon_url)}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setStage(stage === "direct" ? "proxy" : "failed")}
      className={`${className} shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-border`}
    />
  );
}
