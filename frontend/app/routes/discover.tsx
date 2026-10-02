import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  BookmarkIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import AddToGalleryDialog, { NEW_ALBUM, type AddChoice } from "~/components/AddToGalleryDialog";
import AllResults, { type Group } from "~/components/AllResults";
import ArtworkCard from "~/components/ArtworkCard";
import DiscoverFilters, { DEFAULT_FILTERS, NO_FILTERS, type Filters } from "~/components/DiscoverFilters";
import DiscoverHero from "~/components/DiscoverHero";
import SourcePicker, { ALL_SOURCES } from "~/components/SourcePicker";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { createAlbum, fetchAlbums } from "~/utils/galleryApi";
import {
  DiscoverApiError,
  fetchHighlights,
  fetchImportJob,
  fetchSources,
  resolveLink,
  searchArt,
  startImport,
  type Artwork,
  type DiscoverSource,
  type Framing,
  type ImportJob,
  type SourceStatus,
} from "~/utils/discoverApi";

const QUICK_PICKS = ["Landscape", "Seascape", "Winter", "Flowers", "Mountains", "Impressionism"];
// Some filters hide a lot of works, so a "page" can come back nearly empty. Keep fetching a
// few pages until there is something to look at.
const WANT_AT_LEAST = 8;
const MAX_PAGES_PER_LOAD = 4;
// Searching all sources shows a taste of each.
const ALL_PER_SOURCE = 6;
const DEFAULT_DELAY_MS = 350;
const POLL_MS = 400;
const POLL_FAILURES_BEFORE_GIVING_UP = 15;
const FRAMING_KEY = "discover.framing";
const ALBUM_KEY = "discover.album";

type AlbumOption = { id: string; name: string };

type ActiveImport = {
  artwork: Artwork;
  jobId: string | null;
  job: ImportJob | null;
  startError: string;
};

const keyOf = (art: Artwork) => `${art.source}:${art.id}`;

function remembered(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembering is a convenience only.
  }
}

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [sources, setSources] = useState<DiscoverSource[]>([]);
  // Which sources are resting or busy, kept apart so refreshing it never restarts a search.
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  const [scope, setScope] = useState<string>(ALL_SOURCES);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [focused, setFocused] = useState(false);
  const [popoversOpen, setPopoversOpen] = useState(0);

  const [highlights, setHighlights] = useState<Artwork[] | null>(null);
  const [albums, setAlbums] = useState<AlbumOption[]>([]);

  // One source at a time...
  const [results, setResults] = useState<Artwork[]>([]);
  const [lastPage, setLastPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const latestSearch = useRef(0);

  // ...or every source at once, each filling in as it answers.
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const allTimers = useRef<number[]>([]);
  const allToken = useRef(0);
  const ranQuery = useRef<Record<string, string>>({});
  // Set when a search is a decision (a chip, Enter) and not typing, so nothing is held back.
  const flushNext = useRef(false);

  // The artwork whose dialog is open, and the import that was confirmed (which carries on
  // in the background if the dialog is hidden).
  const [dialogArt, setDialogArt] = useState<Artwork | null>(null);
  const dialogArtRef = useRef<Artwork | null>(null);
  dialogArtRef.current = dialogArt;
  const [active, setActive] = useState<ActiveImport | null>(null);
  const activeRef = useRef<ActiveImport | null>(null);
  activeRef.current = active;
  const [added, setAdded] = useState<Set<string>>(new Set());

  const [linkInput, setLinkInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const bookmarklet = useRef<HTMLAnchorElement>(null);

  const inAll = scope === ALL_SOURCES;
  const source = inAll ? null : (sources.find((s) => s.id === scope) ?? null);
  const trimmed = queryInput.trim();
  const dialogStarted = active !== null && active.artwork === dialogArt;
  const pickerSources = useMemo(
    () => sources.map((s) => ({ ...s, status: statuses[s.id] ?? s.status })),
    [sources, statuses]
  );
  const heroCollapsed = !inAll || focused || trimmed !== "" || popoversOpen > 0;
  const popoverToggled = (open: boolean) => setPopoversOpen((n) => Math.max(0, n + (open ? 1 : -1)));

  // --- Loading the sources, highlights and albums -----------------------------

  const loadAlbums = useCallback(async () => {
    try {
      const list = await fetchAlbums();
      setAlbums(list.map((a: any) => ({ id: String(a.id), name: a.name })));
    } catch {
      // Albums are optional here; the dialog just offers "No album".
    }
  }, []);

  const refreshStatuses = useCallback(() => {
    fetchSources()
      .then((list) => setStatuses(Object.fromEntries(list.map((s) => [s.id, s.status]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSources()
      .then((list) => {
        setSources(list);
        setStatuses(Object.fromEntries(list.map((s) => [s.id, s.status])));
      })
      .catch((e) => {
        setError(e.message || "Could not load the art sources");
        setLoading(false);
      });
    fetchHighlights()
      .then((day) => setHighlights(day.items))
      .catch(() => setHighlights([]));
    loadAlbums();
  }, [loadAlbums]);

  // The bookmarklet is built in the browser so it points at wherever this app is served
  // from. React refuses javascript: URLs in JSX, hence setting it directly.
  useEffect(() => {
    const target = `${window.location.origin}/discover?import=`;
    bookmarklet.current?.setAttribute(
      "href",
      `javascript:(function(){window.open(${JSON.stringify(target)}+encodeURIComponent(location.href),"_blank")})()`
    );
  }, [sources.length]);

  // --- One source: results update as you type, after a pause that depends on the source ---

  useEffect(() => {
    const delay = source?.search_delay_ms ?? DEFAULT_DELAY_MS;
    const timer = setTimeout(() => setQuery(queryInput.trim()), delay);
    return () => clearTimeout(timer);
  }, [queryInput, source?.search_delay_ms]);

  const collect = useCallback(
    async (src: string, q: string, firstPage: number, token: number) => {
      let found: Artwork[] = [];
      let hiddenCount = 0;
      let more = true;
      let page = firstPage;
      for (let i = 0; i < MAX_PAGES_PER_LOAD && more && found.length < WANT_AT_LEAST; i++) {
        const data = await searchArt({
          source: src,
          q,
          page,
          shape: filters.shape,
          paintings: filters.paintings,
          sharp: filters.sharp,
        });
        if (token !== latestSearch.current) return null;
        found = found.concat(data.results);
        hiddenCount += data.hidden;
        more = data.has_more;
        page += 1;
      }
      return { found, hiddenCount, more, lastPage: page - 1 };
    },
    [filters]
  );

  useEffect(() => {
    if (inAll) return;
    const token = ++latestSearch.current;
    setLoading(true);
    setError("");
    setResults([]);
    collect(scope, query, 1, token)
      .then((outcome) => {
        if (!outcome) return;
        setResults(outcome.found);
        setHidden(outcome.hiddenCount);
        setHasMore(outcome.more);
        setLastPage(outcome.lastPage);
      })
      .catch((e) => {
        if (token !== latestSearch.current) return;
        if (e instanceof DiscoverApiError && e.retryAfter) {
          setStatuses((current) => ({
            ...current,
            [scope]: { state: "resting", retry_after: e.retryAfter!, used: 0, max: 0 },
          }));
        }
        setError(e.message || "Search failed");
      })
      .finally(() => token === latestSearch.current && setLoading(false));
  }, [scope, inAll, query, collect]);

  async function loadMore() {
    const token = latestSearch.current;
    setLoadingMore(true);
    try {
      const outcome = await collect(scope, query, lastPage + 1, token);
      if (!outcome) return;
      setResults((current) => {
        const seen = new Set(current.map(keyOf));
        return current.concat(outcome.found.filter((art) => !seen.has(keyOf(art))));
      });
      setHidden((n) => n + outcome.hiddenCount);
      setHasMore(outcome.more);
      setLastPage(outcome.lastPage);
    } catch (e: any) {
      toast.error(e.message || "Could not load more", { position: "top-center" });
    } finally {
      setLoadingMore(false);
    }
  }

  // --- All sources: each searched on its own schedule ---------------------------------

  const runGroup = useCallback(
    async (s: DiscoverSource, q: string, token: number) => {
      ranQuery.current[s.id] = q;
      setGroups((current) => ({
        ...current,
        [s.id]: { ...(current[s.id] ?? { results: [], hidden: 0, hasMore: false, total: null }), status: "loading" },
      }));
      try {
        const data = await searchArt({
          source: s.id,
          q,
          page: 1,
          shape: filters.shape,
          paintings: filters.paintings,
          sharp: filters.sharp,
          limit: ALL_PER_SOURCE,
        });
        if (token !== allToken.current) return;
        setGroups((current) => ({
          ...current,
          [s.id]: { status: "done", results: data.results, hidden: data.hidden, hasMore: data.has_more, total: data.total },
        }));
      } catch (e: any) {
        if (token !== allToken.current) return;
        delete ranQuery.current[s.id];
        const retryAfter = e instanceof DiscoverApiError ? e.retryAfter : undefined;
        if (retryAfter) {
          setStatuses((current) => ({
            ...current,
            [s.id]: { state: "resting", retry_after: retryAfter, used: 0, max: 0 },
          }));
        }
        setGroups((current) => ({
          ...current,
          [s.id]: {
            status: retryAfter ? "resting" : "error",
            results: [],
            hidden: 0,
            hasMore: false,
            total: null,
            error: e.message,
            retryAfter,
          },
        }));
      }
    },
    [filters]
  );

  useEffect(() => {
    if (!inAll) return;
    allTimers.current.forEach(window.clearTimeout);
    allTimers.current = [];
    const q = queryInput.trim();
    const token = ++allToken.current;
    if (!q) {
      setGroups({});
      ranQuery.current = {};
      return;
    }
    // Earlier results stay (dimmed) while typing. A source with none yet shows that it is
    // coming, or, for the slow ones, that it is waiting for you to stop typing.
    setGroups((current) =>
      Object.fromEntries(
        sources.map((s) => [
          s.id,
          current[s.id]
            ? { ...current[s.id], status: s.weight === "heavy" ? "waiting" : "pending" }
            : { status: s.weight === "heavy" ? "waiting" : "pending", results: [], hidden: 0, hasMore: false, total: null },
        ])
      ) as Record<string, Group>
    );
    const decided = flushNext.current;
    flushNext.current = false;
    for (const s of sources) {
      // A filter change on a search this source already answered goes straight to the
      // server's cache, so there is no reason to hold it back.
      const delay = decided || ranQuery.current[s.id] === q ? 0 : s.search_delay_ms;
      allTimers.current.push(window.setTimeout(() => runGroup(s, q, token), delay));
    }
    return () => allTimers.current.forEach(window.clearTimeout);
  }, [inAll, queryInput, sources, runGroup]);

  /** Enter: search every source now, without waiting for the pause. */
  function searchAllNow() {
    const q = queryInput.trim();
    if (!q) return;
    allTimers.current.forEach(window.clearTimeout);
    allTimers.current = [];
    for (const s of sources) runGroup(s, q, allToken.current);
  }

  function runSearch(text: string) {
    // A chip or a clear is a decision, not typing: no need to wait.
    flushNext.current = true;
    setQueryInput(text);
    setQuery(text.trim());
  }

  function chooseScope(next: string) {
    setScope(next);
    // Choosing a source is a decision: search it now, with whatever is typed.
    setQuery(queryInput.trim());
  }

  // --- Adding to the gallery -------------------------------------------------------

  function openAdd(art: Artwork) {
    // A finished or failed import from before should not greet the next one; a running
    // one carries on in the background.
    const previous = activeRef.current;
    if (previous && (previous.startError || previous.job?.state === "done" || previous.job?.state === "error")) {
      setActive(null);
    }
    setDialogArt(art);
  }

  async function resolveAlbumId(choice: AddChoice): Promise<string | undefined> {
    if (choice.albumId !== NEW_ALBUM) return choice.albumId || undefined;
    const name = choice.newAlbumName.trim();
    const existing = albums.find((a) => a.name === name);
    if (existing) return existing.id;
    const updated = await createAlbum(name);
    const created = updated.find((a: any) => a.name === name);
    if (!created) throw new Error("Could not create the album");
    return String(created.id);
  }

  async function confirmAdd(choice: AddChoice) {
    const art = dialogArtRef.current;
    if (!art) return;
    remember(FRAMING_KEY, choice.framing);
    setActive({ artwork: art, jobId: null, job: null, startError: "" });
    try {
      const albumId = await resolveAlbumId(choice);
      remember(ALBUM_KEY, albumId ?? "");
      const jobId = await startImport({ source: art.source, id: art.id, fit: choice.framing, albumId });
      setActive((current) => (current && current.artwork === art ? { ...current, jobId } : current));
    } catch (e: any) {
      setActive((current) =>
        current && current.artwork === art ? { ...current, startError: e.message || "Could not start the import" } : current
      );
    }
  }

  const jobId = active?.jobId ?? null;
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let failures = 0;

    const tick = async () => {
      try {
        const job = await fetchImportJob(jobId);
        if (stopped) return;
        failures = 0;
        setActive((current) => (current && current.jobId === jobId ? { ...current, job } : current));
        if (job.state === "done" || job.state === "error") {
          stopped = true;
          clearInterval(timer);
          onJobFinished(jobId, job);
        }
      } catch {
        if (++failures >= POLL_FAILURES_BEFORE_GIVING_UP && !stopped) {
          stopped = true;
          clearInterval(timer);
          setActive((current) =>
            current && current.jobId === jobId
              ? { ...current, startError: "Lost contact with the server while importing." }
              : current
          );
        }
      }
    };

    const timer = setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function onJobFinished(finishedId: string, job: ImportJob) {
    const current = activeRef.current;
    if (!current || current.jobId !== finishedId) return;
    if (job.state === "done") {
      setAdded((set) => new Set(set).add(keyOf(current.artwork)));
      loadAlbums();
    }
    // If the dialog was hidden while this ran, say how it ended.
    if (dialogArtRef.current !== current.artwork) {
      if (job.state === "done") {
        toast.success(
          job.result?.duplicate_of
            ? `${current.artwork.title} was already in your gallery`
            : `Added “${current.artwork.title}” to your gallery`,
          { position: "top-center" }
        );
      } else {
        toast.error(job.error || `Could not add “${current.artwork.title}”`, { position: "top-center" });
      }
    }
  }

  // --- Adding from a link (typed in, or sent by the bookmarklet from the source's own site) ---

  const lookUpLink = useCallback(async (url: string) => {
    setLinkBusy(true);
    setLinkError("");
    try {
      const found = await resolveLink(url.trim());
      setActive((current) => (current && current.job?.state !== "running" ? null : current));
      setDialogArt(found.artwork);
    } catch (e: any) {
      setLinkError(e.message || "Could not read that link");
    } finally {
      setLinkBusy(false);
    }
  }, []);

  // Arriving from the bookmarklet: look the artwork up and ask before adding, so a link
  // someone else sends cannot quietly fill the gallery.
  const importParam = searchParams.get("import");
  useEffect(() => {
    if (!importParam) return;
    setLinkInput(importParam);
    lookUpLink(importParam);
    setSearchParams({}, { replace: true });
  }, [importParam, lookUpLink, setSearchParams]);

  // --- Rendering ----------------------------------------------------------------

  const dialogSource = dialogArt ? (sources.find((s) => s.id === dialogArt.source) ?? null) : null;
  const defaultFraming: Framing = remembered(FRAMING_KEY) === "whole" ? "whole" : "fill";
  const filtersNarrow = filters.shape !== "any" || filters.sharp || Boolean(source?.has_type_filter && filters.paintings);
  const searchPlaceholder = source
    ? `Search ${source.name}: an artist, a place, a mood`
    : "Search every source: an artist, a place, a mood";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <h1 className="mb-1 mt-3 text-center text-2xl font-bold text-foreground">Discover</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        Free, high-resolution art, imported at the right size for your Frame.
      </p>

      <DiscoverHero
        items={highlights}
        sources={sources}
        collapsed={heroCollapsed}
        onAdd={openAdd}
        onBrowse={chooseScope}
      />

      {/* Search: results update as you type */}
      <form
        role="search"
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (inAll) searchAllNow();
          else runSearch(queryInput);
        }}
      >
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={searchPlaceholder}
            aria-label="Search for art"
            className="h-11 pl-9 pr-9 text-base [&::-webkit-search-cancel-button]:hidden"
          />
          {queryInput && (
            <button
              type="button"
              onClick={() => runSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <XCircleIcon className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <DiscoverFilters
          filters={filters}
          onChange={setFilters}
          source={source}
          onOpenChange={popoverToggled}
          onSwitchToTvReady={() => {
            const ready = sources.find((s) => s.tv_ready);
            if (ready) chooseScope(ready.id);
          }}
        />
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SourcePicker
          sources={pickerSources}
          scope={scope}
          onSelect={chooseScope}
          onOpen={refreshStatuses}
          onOpenChange={popoverToggled}
        />
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick}
            type="button"
            onClick={() => runSearch(pick)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
              query.toLowerCase() === pick.toLowerCase() || trimmed.toLowerCase() === pick.toLowerCase()
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            {pick}
          </button>
        ))}
      </div>
      {source && <p className="mb-4 text-xs text-muted-foreground">{source.tagline}</p>}
      {!source && <div className="mb-4" />}

      {/* All sources */}
      {inAll && trimmed !== "" && (
        <AllResults
          sources={sources}
          groups={groups}
          added={added}
          onAdd={openAdd}
          onSeeAll={chooseScope}
          onRetry={(id) => {
            const s = sources.find((x) => x.id === id);
            if (s) runGroup(s, trimmed, allToken.current);
          }}
        />
      )}

      {/* One source */}
      {error && (!inAll || sources.length === 0) && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => runSearch(queryInput)}>
            Try again
          </Button>
        </div>
      )}

      {!inAll && source && !error && (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          {loading ? "Searching…" : `${results.length} work${results.length === 1 ? "" : "s"} shown`}
          {!loading && hidden > 0 && filtersNarrow && (
            <>
              {" · "}
              {hidden} hidden by your filters.{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => setFilters(NO_FILTERS)}
              >
                Show everything
              </button>
            </>
          )}
        </p>
      )}

      {!inAll &&
        (loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border">
                <Skeleton className="aspect-video rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {!error && results.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <p>Nothing matched{query ? ` “${query}”` : ""}.</p>
                <p className="mt-1">Try another word{filtersNarrow ? ", or loosen the filters" : ""}.</p>
                {filtersNarrow && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilters(NO_FILTERS)}>
                    Show everything
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {source &&
                results.map((art) => (
                  <ArtworkCard
                    key={keyOf(art)}
                    artwork={art}
                    source={source}
                    added={added.has(keyOf(art))}
                    onAdd={openAdd}
                  />
                ))}
            </div>

            {hasMore && (
              <div className="mt-6 text-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        ))}

      {/* From a link */}
      <section className="mt-10 rounded-lg border border-border bg-card p-4" aria-labelledby="discover-link-heading">
        <h2 id="discover-link-heading" className="mb-1 flex items-center gap-2 text-base font-semibold">
          <LinkIcon className="size-5 text-primary" aria-hidden="true" />
          Found something on another site?
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Paste a link to an artwork page from Reframed, the Met, the Art Institute of Chicago, the Cleveland Museum of
          Art, SMK, or a file on Wikimedia Commons.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (linkInput.trim()) lookUpLink(linkInput);
          }}
        >
          <Input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://www.reframed.gallery/claude-monet/…"
            aria-label="Link to an artwork page"
            disabled={linkBusy}
          />
          <Button type="submit" disabled={linkBusy || !linkInput.trim()}>
            {linkBusy ? "Looking…" : "Look up"}
          </Button>
        </form>
        {linkError && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {linkError}
          </p>
        )}

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Skip the copy and paste</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>
              Drag this button to your bookmarks bar. On any artwork page from the sites above, click it and the artwork
              opens here, ready to add.
            </p>
            <a
              ref={bookmarklet}
              draggable
              onClick={(e) => e.preventDefault()}
              className="inline-flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-xs"
            >
              <BookmarkIcon className="size-4" aria-hidden="true" />
              Send to Frame Gallery
            </a>
            <p className="text-xs">If a site blocks bookmarks like this, copy its link and paste it above instead.</p>
          </div>
        </details>
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Artwork comes from museums and galleries that share it openly. Please check each source&apos;s terms before using
        it beyond your own home.
      </p>

      <AddToGalleryDialog
        open={dialogArt !== null}
        artwork={dialogArt}
        source={dialogSource}
        albums={albums}
        defaults={{ framing: defaultFraming, albumId: remembered(ALBUM_KEY) }}
        started={dialogStarted}
        job={dialogStarted ? (active?.job ?? null) : null}
        startError={dialogStarted ? (active?.startError ?? "") : ""}
        onConfirm={confirmAdd}
        onClose={() => setDialogArt(null)}
        onRetry={() => setActive(null)}
      />
    </div>
  );
}
