// API service for Discover: searching free art sources and importing from them

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export type DiscoverSource = {
  id: string;
  name: string;
  short_name: string;
  tagline: string;
  site_url: string;
  support_url: string;
  support_label: string;
  icon_url: string;
  /** Who to thank (and the logo to show) when that is not the museum itself, as with Wikimedia Commons. */
  support_name: string;
  support_icon_url: string;
  license: string;
  default_query: string;
  /** Files come pre-cropped to 3840x2160, so there is nothing to choose about framing. */
  tv_ready: boolean;
  has_type_filter: boolean;
  /** "heavy" sources cost the most to ask, so they wait until typing has settled. */
  weight: "light" | "heavy";
  /** How long to wait after the last keystroke before searching this source. */
  search_delay_ms: number;
  status: SourceStatus;
};

export type SourceStatus = {
  state: "ok" | "busy" | "resting";
  /** Seconds until it can be asked again, when busy or resting */
  retry_after: number;
  used: number;
  max: number;
};

export type Artwork = {
  source: string;
  id: string;
  title: string;
  artist: string;
  date: string;
  thumb_url: string;
  page_url: string;
  license: string;
  width: number | null;
  height: number | null;
  aspect: number | null;
  /** Share (0-1) of the picture lost when cropped to 16:9; null when the shape is unknown. */
  crop_loss: number | null;
  tv_ready: boolean;
  /** A larger picture, on highlights only */
  hero_url?: string;
};

export type SearchPage = {
  source: string;
  query: string;
  results: Artwork[];
  page: number;
  hidden: number;
  has_more: boolean;
  total: number | null;
  /** True when the page came from the server's 24-hour search cache */
  cached: boolean;
};

export type Framing = "fill" | "whole";

/** Which shapes to show: everything, wider than tall, close to 16:9, or already 16:9 (no matte). */
export type Shape = "any" | "landscape" | "wide" | "fits";

export type ImportResult = {
  filename: string;
  duplicate_of: string | null;
  album_id: number | null;
  width: number;
  height: number;
  quality: "tv_ready" | "soft" | "low";
};

export type ImportJob = {
  id: string;
  state: "queued" | "running" | "done" | "error";
  stage: string;
  /** null while the size of the download is not known */
  percent: number | null;
  received_bytes: number;
  total_bytes: number | null;
  message: string;
  title: string | null;
  artist: string | null;
  result: ImportResult | null;
  error: string | null;
};

/** Same image, fetched through this app, for when the browser cannot load it directly. */
export function proxiedImageUrl(url: string) {
  return `${API_BASE}/api/discover/thumb?url=${encodeURIComponent(url)}`;
}

/** A failed request. retryAfter (seconds) is set when a source is resting or busy. */
export class DiscoverApiError extends Error {
  retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DiscoverApiError(data.error || `Request failed (${res.status})`, data.retry_after);
  return data;
}

export async function fetchSources(): Promise<DiscoverSource[]> {
  return (await readJson(await fetch(`${API_BASE}/api/discover/sources`))).sources;
}

export async function searchArt(options: {
  source: string;
  q: string;
  page: number;
  shape: Shape;
  paintings: boolean;
  sharp: boolean;
  /** Trim the page, when only a taste of this source is wanted */
  limit?: number;
}): Promise<SearchPage> {
  const params = new URLSearchParams({
    source: options.source,
    q: options.q,
    page: String(options.page),
    shape: options.shape,
    paintings: options.paintings ? "1" : "0",
    sharp: options.sharp ? "1" : "0",
  });
  if (options.limit) params.set("limit", String(options.limit));
  return readJson(await fetch(`${API_BASE}/api/discover/search?${params}`));
}

export type Highlights = { mood: string; items: Artwork[] };

/** A few wide, sharp pictures from different sources, picked fresh each day. */
export async function fetchHighlights(): Promise<Highlights> {
  return readJson(await fetch(`${API_BASE}/api/discover/highlights`));
}

export async function resolveLink(url: string): Promise<{ source: string; id: string; artwork: Artwork }> {
  return readJson(
    await fetch(`${API_BASE}/api/discover/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
  );
}

export async function startImport(options: {
  source: string;
  id: string;
  fit: Framing;
  albumId?: string | number;
}): Promise<string> {
  const data = await readJson(
    await fetch(`${API_BASE}/api/discover/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: options.source,
        id: options.id,
        fit: options.fit,
        album_id: options.albumId || undefined,
      }),
    })
  );
  return data.job_id;
}

export async function fetchImportJob(jobId: string): Promise<ImportJob> {
  return readJson(await fetch(`${API_BASE}/api/discover/jobs/${encodeURIComponent(jobId)}`));
}
