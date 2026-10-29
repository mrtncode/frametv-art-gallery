import { Warning as ExclamationTriangleIcon } from "@phosphor-icons/react";
import ArtworkCard from "./ArtworkCard";
import SourceLogo from "./SourceLogo";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import type { Artwork, DiscoverSource } from "~/utils/discoverApi";

export type Group = {
  /** pending: about to search. waiting: held back until typing stops. */
  status: "pending" | "waiting" | "loading" | "done" | "error" | "resting";
  results: Artwork[];
  hidden: number;
  hasMore: boolean;
  total: number | null;
  error?: string;
  retryAfter?: number;
};

const keyOf = (art: Artwork) => `${art.source}:${art.id}`;

const minutes = (seconds: number) =>
  seconds < 90 ? `${Math.max(1, Math.round(seconds))} seconds` : `${Math.round(seconds / 60)} minutes`;

interface AllResultsProps {
  sources: DiscoverSource[];
  groups: Record<string, Group>;
  added: Set<string>;
  onAdd: (artwork: Artwork) => void;
  onView: (artwork: Artwork) => void;
  /** Open one source with the same search */
  onSeeAll: (sourceId: string) => void;
  onRetry: (sourceId: string) => void;
}

/** Results from every source, a few from each, filling in as each source answers. */
export default function AllResults({ sources, groups, added, onAdd, onView, onSeeAll, onRetry }: AllResultsProps) {
  const visible = sources.filter((s) => groups[s.id]);
  const quiet = visible.filter((s) => {
    const group = groups[s.id];
    return group.status === "done" && group.results.length === 0;
  });
  const active = visible.filter((s) => !quiet.includes(s));

  return (
    <div className="space-y-8">
      {active.map((source) => {
        const group = groups[source.id];
        return (
          <section key={source.id} aria-labelledby={`all-${source.id}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id={`all-${source.id}`} className="flex min-w-0 items-center gap-2 text-base font-semibold">
                <SourceLogo source={source} className="size-7" />
                <span className="truncate">{source.name}</span>
                {group.status === "done" && (
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {group.total ? `${group.total.toLocaleString()} matches` : `${group.results.length} shown`}
                    {group.hidden > 0 ? `, ${group.hidden} hidden by filters` : ""}
                  </span>
                )}
              </h2>
              {group.status === "done" && group.hasMore && (
                <Button variant="ghost" size="sm" onClick={() => onSeeAll(source.id)}>
                  See all
                </Button>
              )}
            </div>

            {/* Earlier results stay on screen, dimmed, while a source searches again. */}
            {group.status === "waiting" && group.results.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Waiting until you stop typing, so {source.short_name} is only asked once.
              </p>
            )}

            {(group.status === "pending" || group.status === "loading") && group.results.length === 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-lg border border-border">
                    <Skeleton className="aspect-video rounded-none" />
                    <div className="space-y-2 p-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(group.status === "error" || group.status === "resting") && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-surface p-4 text-sm text-foreground"
              >
                <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p>
                    {group.status === "resting" && group.retryAfter
                      ? `${source.name} asked us to slow down, so it is resting. Try again in about ${minutes(group.retryAfter)}.`
                      : group.error || `${source.name} did not answer.`}
                  </p>
                  {group.status === "error" && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => onRetry(source.id)}>
                      Try again
                    </Button>
                  )}
                </div>
              </div>
            )}

            {group.results.length > 0 && group.status !== "error" && group.status !== "resting" && (
              <div
                className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
                  group.status === "done" ? "" : "opacity-60"
                }`}
              >
                {group.results.map((art) => (
                  <ArtworkCard key={keyOf(art)} artwork={art} source={source} added={added.has(keyOf(art))} onAdd={onAdd} onView={onView} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {quiet.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing matched at {quiet.map((s) => s.name).join(", ")}.
        </p>
      )}
    </div>
  );
}
