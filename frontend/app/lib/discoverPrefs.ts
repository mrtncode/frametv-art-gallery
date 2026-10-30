// Discover preferences: search order in localStorage; enabled art sources in the backend.

type SourceLike = {
  id: string;
  enabled?: boolean;
  credentials?: { configured: boolean } | null;
};

/** Whether a source needs credentials (API key) to work. */
export function isOptional(source: { credentials?: { configured: boolean } | null }): boolean {
  return Boolean(source.credentials);
}

/**
 * The sources to show: enabled sources (persisted in the backend database),
 * and for keyed sources only if their credentials are saved.
 */
export function visibleSources<T extends SourceLike>(all: T[]): T[] {
  return all.filter((s) => {
    if (s.enabled === false) return false;
    if (isOptional(s)) {
      return Boolean(s.enabled && s.credentials?.configured);
    }
    return Boolean(s.enabled ?? true);
  });
}

// The order sources are searched and shown in. Kept as one list of ids across every source,
// free and keyed alike, so a single reorder covers them all. A source missing from the list
// (new, or never placed) goes after the placed ones, in the server's own order.
const ORDER_KEY = "discover.sourceOrder";

export function getSourceOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function setSourceOrder(order: string[]) {
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // Remembering is a convenience only.
  }
}

/** `all` in the person's chosen order. */
export function orderSources<T extends { id: string }>(all: T[]): T[] {
  const rank = new Map(getSourceOrder().map((id, i) => [id, i]));
  // Array.sort is stable, so sources with no place keep the server's order.
  return [...all].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || 0);
}
