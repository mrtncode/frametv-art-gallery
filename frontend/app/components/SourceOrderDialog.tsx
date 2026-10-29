import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { DotsSixVertical as GripIcon } from "@phosphor-icons/react";
import SourceLogo from "./SourceLogo";
import { Button } from "./ui/button";
import type { DiscoverSource } from "~/utils/discoverApi";

interface SourceOrderDialogProps {
  open: boolean;
  /** The sources in use now, free and keyed together, in their current order */
  sources: DiscoverSource[];
  onClose: () => void;
  onSave: (orderedIds: string[]) => void;
}

/**
 * One list for every source in use, whichever section of Settings it is switched on in.
 * Grab the handle and drag a source to where it should go; this works with a mouse or a
 * finger. With the handle focused, the arrow keys move it too.
 */
export default function SourceOrderDialog({ open, sources, onClose, onSave }: SourceOrderDialogProps) {
  const [list, setList] = useState<DiscoverSource[]>(sources);

  useEffect(() => {
    if (open) setList(sources);
    // Start from the saved order each time it opens, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A drag in progress: the row held, how far the pointer has moved, and the row height.
  const [drag, setDrag] = useState<{ from: number; dy: number; rowHeight: number } | null>(null);
  const startY = useRef(0);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const target = drag ? Math.max(0, Math.min(list.length - 1, drag.from + Math.round(drag.dy / drag.rowHeight))) : -1;

  const startDrag = (e: React.PointerEvent, from: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    const first = rows.current[0];
    const second = rows.current[1];
    const rowHeight = first && second ? second.offsetTop - first.offsetTop : (first?.offsetHeight ?? 48);
    setDrag({ from, dy: 0, rowHeight });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, dy: e.clientY - startY.current });
  };
  const endDrag = (commit: boolean) => {
    if (drag && commit) move(drag.from, target);
    setDrag(null);
  };
  /** How far row `i` shifts to make room while another is dragged over it. */
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (i > drag.from && i <= target) return -drag.rowHeight;
    if (i < drag.from && i >= target) return drag.rowHeight;
    return 0;
  };

  const move = (from: number, to: number) =>
    setList((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-3rem)] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg focus:outline-none">
          <Dialog.Title className="mb-1 text-base font-semibold">Search order</Dialog.Title>
          <Dialog.Description className="mb-3 text-sm text-muted-foreground">
            Results from “All sources” appear in this order, and so do the sources in the picker.
          </Dialog.Description>
          <ol className="-mx-1 flex-1 select-none divide-y divide-border overflow-y-auto px-1">
            {list.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => {
                  rows.current[i] = el;
                }}
                className={`relative flex items-center gap-3 bg-card py-2 ${
                  drag?.from === i ? "z-10 rounded-lg shadow-lg ring-1 ring-border" : drag ? "transition-transform duration-150" : ""
                }`}
                style={{ transform: drag ? `translateY(${drag.from === i ? drag.dy : shift(i)}px)` : undefined }}
              >
                <button
                  type="button"
                  onPointerDown={(e) => startDrag(e, i)}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(true)}
                  onPointerCancel={() => endDrag(false)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const to = i + (e.key === "ArrowUp" ? -1 : 1);
                      move(i, to);
                      // The row keeps focus as it moves, so the next key press carries on.
                      requestAnimationFrame(() => rows.current[to]?.querySelector("button")?.focus());
                    }
                  }}
                  aria-label={`Reorder ${s.name}, position ${i + 1} of ${list.length}. Drag, or use the arrow keys.`}
                  className={`-ml-1 inline-flex size-8 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
                    drag?.from === i ? "cursor-grabbing" : "cursor-grab"
                  }`}
                >
                  <GripIcon weight="bold" className="size-5" aria-hidden="true" />
                </button>
                <SourceLogo source={s} className="size-8" />
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="w-5 text-right text-sm tabular-nums text-muted-foreground" aria-hidden="true">
                  {i + 1}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(list.map((s) => s.id));
                onClose();
              }}
            >
              Save order
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
