import { Popover } from "radix-ui";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import type { DiscoverSource, Shape } from "~/utils/discoverApi";

export type Filters = { shape: Shape; paintings: boolean; sharp: boolean };

/** Wide works only, paintings only: a sensible start for a Frame. */
export const DEFAULT_FILTERS: Filters = { shape: "wide", paintings: true, sharp: false };
export const NO_FILTERS: Filters = { shape: "any", paintings: false, sharp: false };

const SHAPE_OPTIONS: { value: Shape; label: string; hint: string }[] = [
  { value: "any", label: "Any shape", hint: "Everything, including portraits and squares." },
  { value: "landscape", label: "Landscape", hint: "Wider than tall." },
  { value: "wide", label: "Wide", hint: "Close to 16:9, so a crop to fill the screen loses little." },
  {
    value: "fits",
    label: "No matte needed",
    hint: "Already 16:9 (within 3%): fills the whole screen with nothing cropped or padded.",
  },
];

/** How many filters are narrowing the results. */
export function activeFilterCount(filters: Filters, source: DiscoverSource | null): number {
  return (
    (filters.shape !== "any" ? 1 : 0) +
    (source?.has_type_filter && filters.paintings ? 1 : 0) +
    (filters.sharp ? 1 : 0)
  );
}

interface DiscoverFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  source: DiscoverSource | null;
  /** When the source offers it, a quick route to art that is already 16:9 */
  onSwitchToTvReady?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export default function DiscoverFilters({ filters, onChange, source, onSwitchToTvReady, onOpenChange }: DiscoverFiltersProps) {
  const count = activeFilterCount(filters, source);

  return (
    <Popover.Root onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button type="button" variant="outline" aria-label={`Filters, ${count} active`} className="shrink-0">
          <AdjustmentsHorizontalIcon aria-hidden="true" />
          <span className="hidden sm:inline">Filters</span>
          {count > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg focus:outline-none"
        >
          <fieldset>
            <legend className="mb-2 font-semibold">Shape</legend>
            <div className="space-y-1.5">
              {SHAPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 ${
                    filters.shape === option.value ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="shape"
                    value={option.value}
                    checked={filters.shape === option.value}
                    onChange={() => onChange({ ...filters, shape: option.value })}
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {filters.shape === "fits" && source && !source.tv_ready && onSwitchToTvReady && (
              <p className="mt-2 text-xs text-muted-foreground">
                Very few museum works are exactly 16:9, so expect a short list. Everything on Reframed Gallery is made for
                it.{" "}
                <button type="button" className="text-primary underline underline-offset-2" onClick={onSwitchToTvReady}>
                  Switch to Reframed
                </button>
              </p>
            )}
          </fieldset>

          <fieldset className="mt-4 space-y-2.5 border-t border-border pt-4">
            <legend className="sr-only">Quality and type</legend>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={filters.sharp}
                onChange={(e) => onChange({ ...filters, sharp: e.target.checked })}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                <span className="block font-medium">Sharp on a 4K TV only</span>
                <span className="block text-xs text-muted-foreground">
                  Enough pixels to fill the screen without scaling up. Hides works whose size the source does not list,
                  which includes The Met.
                </span>
              </span>
            </label>
            {source?.has_type_filter && (
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={filters.paintings}
                  onChange={(e) => onChange({ ...filters, paintings: e.target.checked })}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-medium">Paintings only</span>
                  <span className="block text-xs text-muted-foreground">
                    Leave off to include prints, drawings and photographs.
                  </span>
                </span>
              </label>
            )}
          </fieldset>

          <div className="mt-4 flex justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
              Reset
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(NO_FILTERS)}>
              Show everything
            </Button>
          </div>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
