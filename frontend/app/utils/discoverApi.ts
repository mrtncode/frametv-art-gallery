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
  /** Set when the usual "wide" starting filter would hide most of what the source has. */
  default_shape: Shape | null;
  /** Files come pre-cropped to 3840x2160, so there is nothing to choose about framing. */
  tv_ready: boolean;
  has_type_filter: boolean;
  /** "heavy" sources cost the most to ask, so they wait until typing has settled. */
  weight: "light" | "heavy";
  /** How long to wait after the last keystroke before searching this source. */
  search_delay_ms: number;
  status: SourceStatus;
  /** Not license-verified (personal use): kept off until the person switches it on in Settings. */
  flagged: boolean;
  /** Set when the source needs a key or app credentials, entered in Settings. */
  credentials: SourceCredentials | null;
  /** Whether this source is enabled (stored on the server in database). */
  enabled: boolean;
};

export type SourceCredentials = {
  service: string;
  label: string;
  help_url: string;
  fields: { name: string; label: string }[];
  /** True once every field is saved. The values themselves never come back from the server. */
  configured: boolean;
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

/** The sources, and what is in season (the server works that out, so Easter and the like are always right). */
export async function fetchSources(): Promise<{ sources: DiscoverSource[]; season: string }> {
  return await readJson(await fetch(`${API_BASE}/api/discover/sources`));
}

export async function setSourceEnabled(id: string, enabled: boolean): Promise<DiscoverSource> {
  return await readJson(
    await fetch(`${API_BASE}/api/discover/sources/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
  );
}

export async function setEnabledSources(enabled: string[]): Promise<{ enabled: string[]; sources: DiscoverSource[] }> {
  return await readJson(
    await fetch(`${API_BASE}/api/discover/sources/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
  );
}

export async function resetSourcesToDefaults(): Promise<{ enabled: string[]; sources: DiscoverSource[] }> {
  return await readJson(
    await fetch(`${API_BASE}/api/discover/sources/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
  );
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
  /** An Explore theme's extra words; each source uses them as far as it can */
  terms?: string[];
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
  if (options.terms?.length) params.set("terms", options.terms.join(","));
  return await readJson(await fetch(`${API_BASE}/api/discover/search?${params.toString()}`));
}

export async function fetchHighlights(): Promise<{ mood: string; items: Artwork[] }> {
  return await readJson(await fetch(`${API_BASE}/api/discover/highlights`));
}

export async function resolveLink(url: string): Promise<{ source: string; id: string; artwork: Artwork }> {
  return await readJson(
    await fetch(`${API_BASE}/api/discover/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
  );
}

export async function saveCredentials(service: string, values: Record<string, string>): Promise<SourceCredentials> {
  return await readJson(
    await fetch(`${API_BASE}/api/discover/credentials/${encodeURIComponent(service)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
  );
}

export async function clearCredentials(service: string): Promise<SourceCredentials> {
  return await readJson(
    await fetch(`${API_BASE}/api/discover/credentials/${encodeURIComponent(service)}`, {
      method: "DELETE",
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
