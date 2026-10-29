import type { Artwork } from "~/utils/discoverApi";

/** How a picture measures up against a 16:9, 3840 x 2160 Frame, criterion by criterion. */

export type FitStatus = "ok" | "warn" | "bad" | "unknown";

export type Criterion = {
  id: "resolution" | "aspect" | "fit" | "license";
  label: string;
  status: FitStatus;
  detail: string;
};

export type Fit = {
  status: FitStatus;
  headline: string;
  criteria: Criterion[];
};

export const PANEL_WIDTH = 3840;
const RATIO = 16 / 9;
/** The same tolerance the backend's "no matte needed" filter uses. */
export const FITS_MAX_LOSS = 0.03;

const COMMON_RATIOS: [string, number][] = [
  ["16:9", 16 / 9],
  ["16:10", 1.6],
  ["3:2", 1.5],
  ["4:3", 4 / 3],
  ["5:4", 1.25],
  ["1:1", 1],
  ["4:5", 0.8],
  ["3:4", 0.75],
  ["2:3", 2 / 3],
  ["9:16", 9 / 16],
];

export function ratioName(aspect: number): string {
  const nearest = COMMON_RATIOS.reduce((best, candidate) =>
    Math.abs(candidate[1] - aspect) < Math.abs(best[1] - aspect) ? candidate : best
  );
  return Math.abs(nearest[1] - aspect) / aspect < 0.04 ? nearest[0] : `${aspect.toFixed(2)}:1`;
}

/** Width of the picture left after a centred 16:9 crop. */
export function cropWidth(width: number, height: number): number {
  return width / height >= RATIO ? Math.round(height * RATIO) : width;
}

const RANK: Record<FitStatus, number> = { ok: 0, unknown: 1, warn: 2, bad: 3 };
const worst = (statuses: FitStatus[]) => statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "ok" as FitStatus);

export function assessFit(art: Artwork): Fit {
  const criteria: Criterion[] = [];
  const loss = art.crop_loss;
  const aspect = art.aspect;

  // Resolution of what would be saved when the picture fills the screen.
  if (art.tv_ready) {
    criteria.push({ id: "resolution", label: "Resolution", status: "ok", detail: "3840 × 2160, made for the TV" });
  } else if (art.width && art.height) {
    const usable = cropWidth(art.width, art.height);
    const size = `${art.width} × ${art.height} px`;
    if (usable >= PANEL_WIDTH) {
      criteria.push({ id: "resolution", label: "Resolution", status: "ok", detail: `${size}, sharp on a 4K TV` });
    } else if (usable >= 2560) {
      // Art is soft-edged and seen from a distance, so a smooth upscale from here looks right.
      criteria.push({
        id: "resolution",
        label: "Resolution",
        status: "ok",
        detail: `${size}, scaled up smoothly to fill a 4K TV`,
      });
    } else {
      criteria.push({
        id: "resolution",
        label: "Resolution",
        status: "bad",
        detail: `${size}, on the small side: it will look soft on the TV`,
      });
    }
  } else {
    criteria.push({
      id: "resolution",
      label: "Resolution",
      status: "unknown",
      detail: "The source does not list the size (usually 3000 to 5000 px)",
    });
  }

  // Shape.
  if (aspect === null || aspect === undefined) {
    criteria.push({ id: "aspect", label: "Aspect ratio", status: "unknown", detail: "Shape not listed by the source" });
  } else if (art.tv_ready || (loss !== null && loss <= FITS_MAX_LOSS)) {
    criteria.push({ id: "aspect", label: "Aspect ratio", status: "ok", detail: "16:9, the same shape as the screen" });
  } else if (aspect >= 1.2) {
    criteria.push({
      id: "aspect",
      label: "Aspect ratio",
      status: "warn",
      detail: `${ratioName(aspect)}, ${aspect < RATIO ? "narrower" : "wider"} than the screen`,
    });
  } else {
    criteria.push({
      id: "aspect",
      label: "Aspect ratio",
      status: "bad",
      detail: `${ratioName(aspect)}, ${aspect < 0.95 ? "a portrait" : "close to square"}: far from the screen's shape`,
    });
  }

  // Cropping and matting.
  if (loss === null) {
    criteria.push({ id: "fit", label: "Matte or crop", status: "unknown", detail: "Depends on the shape, which is not listed" });
  } else if (art.tv_ready || loss <= FITS_MAX_LOSS) {
    criteria.push({ id: "fit", label: "Matte or crop", status: "ok", detail: "No matte and no cropping needed" });
  } else {
    const pct = Math.round(loss * 100);
    criteria.push({
      id: "fit",
      label: "Matte or crop",
      status: loss <= 0.25 ? "warn" : "bad",
      detail: `Filling the screen crops ${pct}% of the picture. Keeping it whole means the TV adds a matte`,
    });
  }

  criteria.push({ id: "license", label: "License", status: "ok", detail: art.license });

  const status = worst(criteria.filter((c) => c.id !== "license").map((c) => c.status));
  const headline =
    status === "ok"
      ? "Frame ready: no matte or resizing needed"
      : status === "unknown"
        ? "Looks fine, but some details are not listed"
        : status === "warn"
          ? "Usable, with a trade-off"
          : "Needs a matte or a heavy crop to work";
  return { status, headline, criteria };
}
