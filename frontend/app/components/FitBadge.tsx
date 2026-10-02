import { useRef, useState } from "react";
import { Popover } from "radix-ui";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { assessFit, type Criterion, type FitStatus } from "~/lib/fit";
import type { Artwork } from "~/utils/discoverApi";

const ICONS: Record<FitStatus, typeof CheckIcon> = {
  ok: CheckIcon,
  warn: ExclamationTriangleIcon,
  bad: XMarkIcon,
  unknown: QuestionMarkCircleIcon,
};

const DISC: Record<FitStatus, string> = {
  ok: "bg-green-700 text-white",
  warn: "bg-amber-400 text-amber-950",
  bad: "bg-red-600 text-white",
  unknown: "bg-neutral-600 text-white",
};

const GLYPH: Record<FitStatus, string> = {
  ok: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
  unknown: "text-muted-foreground",
};

const STATUS_WORD: Record<FitStatus, string> = {
  ok: "OK",
  warn: "Warning",
  bad: "Problem",
  unknown: "Unknown",
};

/** The criteria, one per row, each with its own check, warning or cross. */
export function FitCriteriaList({ artwork, className = "" }: { artwork: Artwork; className?: string }) {
  const { criteria } = assessFit(artwork);
  return (
    <ul className={`space-y-2 ${className}`}>
      {criteria.map((criterion: Criterion) => {
        const Icon = ICONS[criterion.status];
        return (
          <li key={criterion.id} className="flex items-start gap-2 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${GLYPH[criterion.status]}`} strokeWidth={2.5} aria-hidden="true" />
            <span>
              <span className="font-medium">{criterion.label}</span>
              <span className="sr-only"> ({STATUS_WORD[criterion.status]})</span>
              <span className="block text-xs text-muted-foreground">{criterion.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One icon on the tile that says at a glance whether a picture suits the Frame, and opens a
 * small panel listing why. Mouse hovers open it; keyboard focus and taps open it too.
 */
export default function FitBadge({ artwork }: { artwork: Artwork }) {
  const fit = assessFit(artwork);
  const Icon = ICONS[fit.status];
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          aria-label={`${fit.headline}. Show details`}
          className={`absolute bottom-2 left-2 inline-flex size-7 items-center justify-center rounded-full shadow-md ring-2 ring-black/30 transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none ${DISC[fit.status]}`}
        >
          <Icon className="size-4" strokeWidth={3} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg focus:outline-none"
        >
          <p className="mb-3 flex items-start gap-2 text-sm font-semibold">
            <span className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${DISC[fit.status]}`}>
              <Icon className="size-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
            {fit.headline}
          </p>
          <FitCriteriaList artwork={artwork} />
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
