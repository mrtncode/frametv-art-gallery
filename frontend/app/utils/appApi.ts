// For fetching general APIs like app status/version.

export interface AppStatusResponse {
  status: string;
  timestamp?: string;
  update_available?: boolean;
  latest_version?: string;
  current_version?: string;
  changelog?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";
const STATUS_CACHE_KEY = "frametv-app-status-cache";
const STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CachedStatus = {
  fetchedAt: number;
  data: AppStatusResponse;
};

function readCachedStatus(): AppStatusResponse | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedStatus;
    if (!parsed?.fetchedAt || !parsed?.data) return null;
    if (Date.now() - parsed.fetchedAt > STATUS_CACHE_TTL_MS) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedStatus(data: AppStatusResponse) {
  if (typeof window === "undefined") return;

  try {
    const payload: CachedStatus = {
      fetchedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

export async function fetchAppStatus(forceRefresh = false): Promise<AppStatusResponse> {
  if (!forceRefresh) {
    const cachedStatus = readCachedStatus();
    if (cachedStatus) return cachedStatus;
  }

  const res = await fetch(`${API_BASE}/api/status`);
  if (!res.ok) throw new Error("Failed to fetch app status");

  const data = (await res.json()) as AppStatusResponse;
  writeCachedStatus(data);
  return data;
}
