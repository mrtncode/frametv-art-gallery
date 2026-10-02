import { useState } from "react";
import { Popover } from "radix-ui";
import { CheckIcon, ChevronUpDownIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import SourceLogo from "./SourceLogo";
import type { DiscoverSource } from "~/utils/discoverApi";

export const ALL_SOURCES = "all";

function minutes(seconds: number) {
  return seconds < 90 ? `${Math.max(1, Math.round(seconds))} s` : `${Math.round(seconds / 60)} min`;
}

function StatusNote({ source }: { source: DiscoverSource }) {
  const { state, retry_after } = source.status;
  if (state === "ok") return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning">
      {state === "resting" ? "Resting" : "Busy"}, back in about {minutes(retry_after)}
    </span>
  );
}

interface SourcePickerProps {
  sources: DiscoverSource[];
  scope: string;
  onSelect: (scope: string) => void;
  /** Called when the picker opens, so the page can refresh each source's status */
  onOpen?: () => void;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Says what is being searched ("All sources" or one), and opens a grid of every source to
 * choose from. A grid scales to many sources far better than a row of buttons.
 */
export default function SourcePicker({ sources, scope, onSelect, onOpen, onOpenChange }: SourcePickerProps) {
  const [open, setOpen] = useState(false);
  const current = sources.find((s) => s.id === scope) ?? null;

  const choose = (next: string) => {
    onSelect(next);
    setOpen(false);
    onOpenChange?.(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
        if (next) onOpen?.();
      }}
    >
      <Popover.Trigger
        aria-label={`Searching ${current ? current.name : "all sources"}. Change source`}
        // The left segment of the search bar: it shares the bar's border and height, and is
        // divided from the text field by a rule of its own.
        className="inline-flex h-full shrink-0 items-center gap-2 rounded-l-md border-r border-border bg-muted/50 pl-3 pr-2.5 text-sm transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="hidden text-muted-foreground sm:inline">Searching</span>
        {current ? (
          <span className="flex items-center gap-1.5 font-medium">
            <SourceLogo source={current} className="size-5" />
            <span className="max-w-28 truncate sm:max-w-40">{current.name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 font-medium">
            <span className="flex -space-x-1.5" aria-hidden="true">
              {sources.slice(0, 4).map((s) => (
                <SourceLogo key={s.id} source={s} className="size-5 ring-2 ring-card" />
              ))}
            </span>
            All sources
          </span>
        )}
        <ChevronUpDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={12}
          collisionPadding={12}
          className="z-50 max-h-[min(34rem,calc(100dvh-8rem))] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg focus:outline-none"
        >
          <button
            type="button"
            aria-pressed={scope === ALL_SOURCES}
            onClick={() => choose(ALL_SOURCES)}
            className={`mb-2 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
              scope === ALL_SOURCES ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent"
            }`}
          >
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Squares2X2Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">All sources</span>
              <span className="block text-xs text-muted-foreground">
                Search every source at once, a few results from each. Slower sources, like The Met, wait until you stop
                typing.
              </span>
            </span>
            {scope === ALL_SOURCES && <CheckIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />}
          </button>

          <div role="group" aria-label="Or pick one source" className="grid gap-2 sm:grid-cols-2">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={scope === s.id}
                onClick={() => choose(s.id)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
                  scope === s.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent"
                }`}
              >
                <SourceLogo source={s} className="mt-0.5 size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{s.tagline}</span>
                  <StatusNote source={s} />
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
