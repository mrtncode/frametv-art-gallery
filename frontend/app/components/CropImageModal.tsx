import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Popover } from "radix-ui";
import {
  ArrowCounterClockwise as ResetIcon,
  ArrowsOut as FillIcon,
  CaretDown as ChevronDownIcon,
  Check as CheckIcon,
  Crosshair as CenterIcon,
  MagnifyingGlassMinus as ZoomOutIcon,
  MagnifyingGlassPlus as ZoomInIcon,
  X as XMarkIcon,
} from "@phosphor-icons/react";
import { cropImage } from "../utils/galleryApi";
import { Tooltip } from "./ui/tooltip";

interface CropImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  filename: string;
  onClose: () => void;
  onCropSuccess: (newUrl: string) => void;
}

/** A crop in the picture's own pixels. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ShapeId = "tv" | "3:2" | "4:3" | "1:1" | "original" | "free";

/**
 * Shapes rather than pixel sizes: the crop keeps every pixel inside it and the TV scales
 * the result, so what matters is the shape. The Frame's panel is 16:9; anything else is
 * shown inside a matte (or with bars), so the other shapes suit pictures meant for one.
 */
const SHAPES: { id: ShapeId; label: string; ratio: string; detail: string }[] = [
  { id: "tv", label: "Frame TV", ratio: "16:9", detail: "Fills the screen, no matte needed" },
  { id: "3:2", label: "Photo", ratio: "3:2", detail: "Camera shape, sits inside a matte" },
  { id: "4:3", label: "Classic", ratio: "4:3", detail: "Paintings and prints, inside a matte" },
  { id: "1:1", label: "Square", ratio: "1:1", detail: "For the Squares matte" },
  { id: "original", label: "Original", ratio: "", detail: "The picture's own shape" },
  { id: "free", label: "Free", ratio: "", detail: "Any shape" },
];

const LANDSCAPE_RATIOS: Record<string, number> = { tv: 16 / 9, "3:2": 3 / 2, "4:3": 4 / 3, "1:1": 1 };

// Below this on its long side a crop looks soft on a 4K panel.
const SOFT_BELOW = 1920;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Drag =
  | { kind: "move"; startX: number; startY: number; start: Rect }
  | { kind: "resize"; handle: Handle; startX: number; startY: number; start: Rect }
  | { kind: "pinch"; startDist: number; start: Rect };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The biggest crop of this shape that fits the picture, centred on (cx, cy) as far as it can be. */
function largestRect(ratio: number | null, nw: number, nh: number, cx = nw / 2, cy = nh / 2): Rect {
  let w = nw;
  let h = nh;
  if (ratio) {
    w = Math.min(nw, nh * ratio);
    h = w / ratio;
  }
  return { w, h, x: clamp(cx - w / 2, 0, nw - w), y: clamp(cy - h / 2, 0, nh - h) };
}

const CropImageModal: React.FC<CropImageModalProps> = ({ isOpen, imageUrl, filename, onClose, onCropSuccess }) => {
  // Held in state, not a ref: the dialog portals its content in after the first render.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [shape, setShape] = useState<ShapeId>("tv");
  const [portrait, setPortrait] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const nw = natural?.w ?? 0;
  const nh = natural?.h ?? 0;
  const ratio: number | null =
    shape === "free" ? null : shape === "original" ? (nw && nh ? nw / nh : null) : portrait ? 1 / LANDSCAPE_RATIOS[shape] : LANDSCAPE_RATIOS[shape];
  const minSide = Math.max(16, Math.round(Math.min(nw, nh) * 0.04));
  const minW = ratio ? Math.max(minSide, minSide * ratio) : minSide;
  const minH = ratio ? minW / ratio : minSide;

  // Fit the picture to the stage, whatever the window size.
  useEffect(() => {
    if (!stageEl) return;
    const observer = new ResizeObserver(([entry]) => {
      setStage({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  // Start afresh each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setNatural(null);
    setRect(null);
    setShape("tv");
    setPortrait(false);
    setMessage("");
  }, [isOpen, imageUrl]);

  const scale = natural && stage.w && stage.h ? Math.min(stage.w / nw, stage.h / nh) : 0;

  const applyShape = useCallback(
    (nextShape: ShapeId, nextPortrait: boolean) => {
      if (!natural) return;
      const r =
        nextShape === "free" ? null : nextShape === "original" ? nw / nh : nextPortrait ? 1 / LANDSCAPE_RATIOS[nextShape] : LANDSCAPE_RATIOS[nextShape];
      setShape(nextShape);
      setPortrait(nextPortrait);
      setRect((current) => {
        if (nextShape === "free" && current) return current;
        const cx = current ? current.x + current.w / 2 : nw / 2;
        const cy = current ? current.y + current.h / 2 : nh / 2;
        return largestRect(r, nw, nh, cx, cy);
      });
    },
    [natural, nw, nh],
  );

  /** Grow or shrink the crop about its centre, keeping its shape and staying inside the picture. */
  const scaleRect = useCallback(
    (r: Rect, factor: number): Rect => {
      const maxFactor = Math.min(nw / r.w, nh / r.h);
      const minFactor = Math.max(minW / r.w, minH / r.h);
      const f = clamp(factor, minFactor, maxFactor);
      const w = r.w * f;
      const h = r.h * f;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      return { w, h, x: clamp(cx - w / 2, 0, nw - w), y: clamp(cy - h / 2, 0, nh - h) };
    },
    [nw, nh, minW, minH],
  );

  // Scroll (or trackpad pinch, which arrives as ctrl+wheel) over the stage resizes the crop.
  useEffect(() => {
    const el = stageEl;
    if (!el || !natural) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const speed = event.ctrlKey ? 0.01 : 0.0015;
      setRect((r) => (r ? scaleRect(r, Math.exp(event.deltaY * speed)) : r));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [stageEl, natural, scaleRect]);

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const beginDrag = (event: React.PointerEvent, next: Drag) => {
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stageEl?.setPointerCapture(event.pointerId);
    // A second finger turns a drag into a pinch.
    drag.current = pointers.current.size >= 2 ? { kind: "pinch", startDist: pinchDistance(), start: rect } : next;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const d = drag.current;
    if (!d || !scale) return;

    if (d.kind === "pinch") {
      if (pointers.current.size < 2 || !d.startDist) return;
      setRect(scaleRect(d.start, d.startDist / pinchDistance()));
      return;
    }

    const dx = (event.clientX - d.startX) / scale;
    const dy = (event.clientY - d.startY) / scale;
    const s = d.start;

    if (d.kind === "move") {
      setRect({ ...s, x: clamp(s.x + dx, 0, nw - s.w), y: clamp(s.y + dy, 0, nh - s.h) });
      return;
    }

    // Resize from a handle, holding the opposite side or corner still.
    const h = d.handle;
    const sx = h.includes("e") ? 1 : h.includes("w") ? -1 : 0;
    const sy = h.includes("s") ? 1 : h.includes("n") ? -1 : 0;
    const anchorX = sx >= 0 ? s.x : s.x + s.w;
    const anchorY = sy >= 0 ? s.y : s.y + s.h;
    const roomW = sx > 0 ? nw - anchorX : sx < 0 ? anchorX : nw;
    const roomH = sy > 0 ? nh - anchorY : sy < 0 ? anchorY : nh;

    let w = s.w + dx * sx;
    let hh = s.h + dy * sy;
    if (ratio) {
      // The corner follows whichever way the pointer moved further.
      w = Math.abs(dx) * s.h >= Math.abs(dy) * s.w ? w : hh * ratio;
      w = clamp(w, minW, Math.min(roomW, roomH * ratio));
      hh = w / ratio;
    } else {
      w = sx ? clamp(w, minW, roomW) : s.w;
      hh = sy ? clamp(hh, minH, roomH) : s.h;
    }
    setRect({
      w,
      h: hh,
      x: sx > 0 ? anchorX : sx < 0 ? anchorX - w : s.x,
      y: sy > 0 ? anchorY : sy < 0 ? anchorY - hh : s.y,
    });
  };

  const endDrag = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) drag.current = null;
    else if (rect && pointers.current.size === 1 && drag.current?.kind === "pinch") {
      // One finger lifted from a pinch: carry on as a move from where the other finger is.
      const [p] = [...pointers.current.values()];
      drag.current = { kind: "move", startX: p.x, startY: p.y, start: rect };
    }
  };

  const onBoxKeyDown = (event: React.KeyboardEvent) => {
    if (!rect) return;
    const step = Math.max(1, Math.min(nw, nh) * (event.shiftKey ? 0.1 : 0.01));
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setRect({ ...rect, x: clamp(rect.x + dx, 0, nw - rect.w), y: clamp(rect.y + dy, 0, nh - rect.h) });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setRect(scaleRect(rect, 1 / 1.1));
    } else if (event.key === "-") {
      event.preventDefault();
      setRect(scaleRect(rect, 1.1));
    }
  };

  // The size slider runs from the smallest crop allowed to the largest that fits.
  const maxW = ratio ? Math.min(nw, nh * ratio) : rect ? rect.w * Math.min(nw / rect.w, nh / rect.h) : nw;
  const sizeValue = rect && maxW > minW ? Math.round(((rect.w - minW) / (maxW - minW)) * 100) : 100;
  const setSize = (value: number) => {
    if (!rect) return;
    const target = minW + ((maxW - minW) * value) / 100;
    setRect(scaleRect(rect, target / rect.w));
  };

  const handleApply = async () => {
    if (!rect || !natural) return;
    setSaving(true);
    setMessage("");
    try {
      const x = clamp(Math.round(rect.x), 0, nw - 1);
      const y = clamp(Math.round(rect.y), 0, nh - 1);
      const width = clamp(Math.round(rect.w), 1, nw - x);
      const height = clamp(Math.round(rect.h), 1, nh - y);
      const res = await cropImage(filename, x, y, width, height);
      if (!res.success) throw new Error((res as any).error || "Crop failed");
      onCropSuccess(`${imageUrl}${imageUrl.includes("?") ? "&" : "?"}cb=${Date.now()}`);
    } catch (e: any) {
      setMessage(e.message || "Failed to crop image");
    } finally {
      setSaving(false);
    }
  };

  const current = SHAPES.find((s) => s.id === shape)!;
  const shapeLabel =
    shape === "tv" ? (portrait ? "9:16" : "16:9") : current.ratio ? (portrait ? current.ratio.split(":").reverse().join(":") : current.ratio) : current.label;
  const canRotate = shape !== "free" && shape !== "original" && shape !== "1:1";
  const outW = rect ? Math.round(rect.w) : 0;
  const outH = rect ? Math.round(rect.h) : 0;
  const soft = rect ? Math.max(outW, outH) < SOFT_BELOW : false;

  const displayW = nw * scale;
  const displayH = nh * scale;
  const handles: Handle[] = ratio ? ["nw", "ne", "sw", "se"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handlePosition: Record<Handle, string> = {
    nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
    n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
    s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
    e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
    w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  };

  const toolButton =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40";

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => !next && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs" />
        <Dialog.Content
          // Focus the dialog itself rather than its first button, which would pop that button's tooltip.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className={
            "fixed inset-0 z-50 flex flex-col overflow-hidden bg-card text-card-foreground shadow-2xl focus:outline-none " +
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(52rem,calc(100dvh-2rem))] sm:w-[min(76rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:border-border"
          }
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">Crop</Dialog.Title>
              <Dialog.Description className="truncate text-xs text-muted-foreground" title={filename}>
                {filename}
                <span className="hidden sm:inline"> · drag to move, corners to resize, scroll to zoom</span>
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip label="Cancel" side="bottom">
                <Dialog.Close className={toolButton} aria-label="Cancel" disabled={saving}>
                  <XMarkIcon weight="regular" className="size-5" />
                </Dialog.Close>
              </Tooltip>
              <Tooltip label="Apply crop" side="bottom">
                <button
                  type="button"
                  aria-label="Apply crop"
                  onClick={handleApply}
                  disabled={!rect || saving}
                  className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  {saving ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <CheckIcon className="size-5" weight="bold" />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>

          {/* The stage: the whole picture, dimmed outside the crop */}
          <div className="relative min-h-0 flex-1 overflow-hidden bg-neutral-950 p-4 sm:p-6">
            <div
              ref={setStageEl}
              className="relative size-full touch-none select-none"
              onPointerDown={(event) => {
                // A second finger landing outside the crop still starts a pinch.
                if (rect && pointers.current.size === 1) beginDrag(event, { kind: "pinch", startDist: 0, start: rect });
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ width: displayW || undefined, height: displayH || undefined }}
              >
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className={`size-full ${natural ? "" : "invisible"}`}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                    setRect(largestRect(16 / 9, img.naturalWidth, img.naturalHeight));
                  }}
                  onError={() => setMessage("Could not load the picture.")}
                />

                {rect && scale > 0 && (
                  <div
                    role="group"
                    tabIndex={0}
                    aria-label={`Crop area, ${outW} by ${outH} pixels. Arrow keys move it, plus and minus resize it.`}
                    onKeyDown={onBoxKeyDown}
                    onPointerDown={(event) =>
                      beginDrag(event, { kind: "move", startX: event.clientX, startY: event.clientY, start: rect })
                    }
                    className="absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    style={{
                      left: rect.x * scale,
                      top: rect.y * scale,
                      width: rect.w * scale,
                      height: rect.h * scale,
                      // Everything outside the crop is dimmed by one enormous shadow.
                      boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)",
                    }}
                  >
                    <span className="pointer-events-none absolute inset-0 border border-white/90" />
                    {/* Rule-of-thirds guides */}
                    <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/35" />
                    <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/35" />
                    <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/35" />
                    <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/35" />

                    <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                      {outW} × {outH}
                    </span>

                    {handles.map((h) => (
                      <span
                        key={h}
                        aria-hidden="true"
                        onPointerDown={(event) =>
                          beginDrag(event, { kind: "resize", handle: h, startX: event.clientX, startY: event.clientY, start: rect })
                        }
                        // A generous invisible hit area around a small visible knob.
                        className={`absolute flex size-8 items-center justify-center ${handlePosition[h]}`}
                      >
                        <span
                          className={`block rounded-sm bg-white shadow ring-1 ring-black/30 ${
                            h.length === 2 ? "size-3.5" : h === "n" || h === "s" ? "h-1.5 w-5" : "h-5 w-1.5"
                          }`}
                        />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!natural && !message && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Loading picture…</div>
              )}
            </div>
          </div>

          {/* Tools */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4">
            <Popover.Root open={shapesOpen} onOpenChange={setShapesOpen}>
              <Popover.Trigger
                disabled={!natural}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40"
                aria-label={`Shape: ${current.label}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block border-[1.5px] border-current rounded-[2px]"
                  style={ratio ? (ratio >= 1 ? { width: 18, height: 18 / ratio } : { width: 18 * ratio, height: 18 }) : { width: 16, height: 12, borderStyle: "dashed" }}
                />
                <span className="tabular-nums">{shapeLabel}</span>
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  className="z-50 w-72 rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg focus:outline-none"
                >
                  {SHAPES.map((s) => {
                    const r = s.id === "original" ? (nw && nh ? nw / nh : 1) : LANDSCAPE_RATIOS[s.id];
                    const selected = s.id === shape;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          // Photo and classic shapes follow the picture's own orientation.
                          const nextPortrait = s.id === "tv" ? false : s.id === "3:2" || s.id === "4:3" ? nh > nw : false;
                          applyShape(s.id, nextPortrait);
                          setShapesOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${
                          selected ? "bg-selection text-selection-foreground" : ""
                        }`}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center">
                          <span
                            className="inline-block rounded-[2px] border-[1.5px] border-current"
                            style={
                              s.id === "free"
                                ? { width: 20, height: 14, borderStyle: "dashed" }
                                : r >= 1
                                  ? { width: 22, height: 22 / r }
                                  : { width: 22 * r, height: 22 }
                            }
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            {s.label}
                            {s.ratio && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{s.ratio}</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">{s.detail}</span>
                        </span>
                        {selected && <CheckIcon className="size-4 shrink-0" weight="bold" />}
                      </button>
                    );
                  })}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <Tooltip label={portrait ? "Make landscape" : "Make portrait"}>
              <button
                type="button"
                className={toolButton}
                aria-label={portrait ? "Make landscape" : "Make portrait"}
                aria-pressed={portrait}
                disabled={!canRotate || !natural}
                onClick={() => applyShape(shape, !portrait)}
              >
                {/* The shape it would turn to, with a turning arrow */}
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {portrait ? <rect x="3" y="8" width="13" height="9" rx="1.2" /> : <rect x="6" y="4" width="9" height="15" rx="1.2" />}
                  <path d="M17.5 4.5a4.5 4.5 0 0 1 3 4.2" />
                  <path d="M21.2 6.4l-.7 2.5-2.4-.9" />
                </svg>
              </button>
            </Tooltip>

            {/* Size */}
            <div className="order-last flex w-full min-w-40 items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
              <ZoomOutIcon weight="regular" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={100}
                // The slider grows the crop, which zooms out of the picture: run it the other way.
                value={100 - sizeValue}
                onChange={(e) => setSize(100 - Number(e.target.value))}
                disabled={!rect}
                aria-label="Zoom"
                className="h-1.5 w-full cursor-pointer accent-primary"
              />
              <ZoomInIcon weight="regular" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="flex items-center gap-0.5">
              <Tooltip label="Centre">
                <button
                  type="button"
                  className={toolButton}
                  aria-label="Centre"
                  disabled={!rect}
                  onClick={() => rect && setRect({ ...rect, x: (nw - rect.w) / 2, y: (nh - rect.h) / 2 })}
                >
                  <CenterIcon className="size-5" />
                </button>
              </Tooltip>
              <Tooltip label="Largest crop">
                <button
                  type="button"
                  className={toolButton}
                  aria-label="Largest crop"
                  disabled={!rect}
                  onClick={() => rect && setRect(ratio ? largestRect(ratio, nw, nh, rect.x + rect.w / 2, rect.y + rect.h / 2) : scaleRect(rect, Infinity))}
                >
                  <FillIcon className="size-5" />
                </button>
              </Tooltip>
              <Tooltip label="Reset">
                <button
                  type="button"
                  className={toolButton}
                  aria-label="Reset"
                  disabled={!natural}
                  onClick={() => {
                    setShape("tv");
                    setPortrait(false);
                    setRect(largestRect(16 / 9, nw, nh));
                    setMessage("");
                  }}
                >
                  <ResetIcon className="size-5" />
                </button>
              </Tooltip>
            </div>

            <span
              // On a phone the size is already on the crop itself; only the warning earns the room.
              className={`ml-auto text-xs tabular-nums ${soft ? "text-warning" : "hidden text-muted-foreground sm:inline"}`}
              title={soft ? "Smaller than half the TV's 3840 × 2160 panel, so it will be enlarged and may look soft." : undefined}
            >
              {rect ? `${outW} × ${outH} px${soft ? " · may look soft" : ""}` : ""}
            </span>
          </div>

          {message && (
            <div role="alert" className="border-t border-destructive/30 bg-danger-surface px-4 py-2 text-sm text-destructive">
              {message}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CropImageModal;
