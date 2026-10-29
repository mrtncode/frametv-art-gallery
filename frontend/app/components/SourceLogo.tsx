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
  src,
  className = "size-10",
}: {
  source: DiscoverSource;
  /** Show this icon instead of the source's own (for example Wikimedia's on a Commons collection). */
  src?: string;
  className?: string;
}) {
  const icon = src ?? source.icon_url;
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
      key={`${icon}-${stage}`}
      src={stage === "direct" ? icon : proxiedImageUrl(icon)}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setStage(stage === "direct" ? "proxy" : "failed")}
      className={`${className} shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-border`}
    />
  );
}
