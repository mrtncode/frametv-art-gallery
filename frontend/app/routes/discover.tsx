import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import {
  BookmarkIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import ArtworkCard from "~/components/ArtworkCard";
import DownloadProgressModal from "~/components/DownloadProgressModal";
import SourceLogo from "~/components/SourceLogo";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { createAlbum, fetchAlbums } from "~/utils/galleryApi";
import {
  fetchImportJob,
  fetchSources,
  resolveLink,
  searchArt,
  startImport,
  type Artwork,
  type DiscoverSource,
  type Framing,
  type ImportJob,
  type Shape,
} from "~/utils/discoverApi";

const QUICK_PICKS = ["Landscape", "Seascape", "Winter", "Flowers", "Mountains", "Impressionism"];
const SHAPE_OPTIONS: { value: Shape; label: string; hint: string }[] = [
  { value: "any", label: "Any shape", hint: "Everything, including portraits and squares." },
  { value: "landscape", label: "Landscape", hint: "Wider than tall." },
  { value: "wide", label: "Wide", hint: "Close to 16:9, so a crop to fill the screen loses little." },
  {
    value: "fits",
    label: "No matte needed",
    hint: "Already 16:9 (within 3%): fills the whole screen with nothing cropped or padded.",
  },
];
const NEW_ALBUM = "__new__";
// Some sources hide a lot of works (the shape filter), so a "page" can come back nearly empty.
// Keep fetching a few pages until there is something to look at.
const WANT_AT_LEAST = 8;
const MAX_PAGES_PER_LOAD = 4;
const POLL_MS = 400;
const POLL_FAILURES_BEFORE_GIVING_UP = 15;

type AlbumOption = { id: string; name: string };

type ActiveImport = {
  artwork: Artwork;
  jobId: string | null;
  job: ImportJob | null;
  startError: string;
  open: boolean;
};

const keyOf = (art: Artwork) => `${art.source}:${art.id}`;

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [sources, setSources] = useState<DiscoverSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState<Shape>("wide");
  const [paintings, setPaintings] = useState(true);
  const [framing, setFraming] = useState<Framing>("fill");

  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [albumId, setAlbumId] = useState("");
  const [newAlbumName, setNewAlbumName] = useState("");

  const [results, setResults] = useState<Artwork[]>([]);
  const [lastPage, setLastPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const latestSearch = useRef(0);

  const [active, setActive] = useState<ActiveImport | null>(null);
  const activeRef = useRef<ActiveImport | null>(null);
  activeRef.current = active;
  const modalOpen = useRef(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const [linkInput, setLinkInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linked, setLinked] = useState<Artwork | null>(null);
  const bookmarklet = useRef<HTMLAnchorElement>(null);

  const source = sources.find((s) => s.id === sourceId) ?? null;

  // --- Loading the sources and albums -------------------------------------------

  const loadAlbums = useCallback(async () => {
    try {
      const list = await fetchAlbums();
      setAlbums(list.map((a: any) => ({ id: String(a.id), name: a.name })));
    } catch {
      // Albums are optional here; the picker just stays on "No album".
    }
  }, []);

  useEffect(() => {
    fetchSources()
      .then((list) => {
        setSources(list);
        setSourceId((current) => current || list[0]?.id || "");
      })
      .catch((e) => {
        setError(e.message || "Could not load the art sources");
        setLoading(false);
      });
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

  // --- Searching ----------------------------------------------------------------

  const collect = useCallback(
    async (src: string, q: string, firstPage: number, token: number) => {
      let found: Artwork[] = [];
      let hiddenCount = 0;
      let more = true;
      let page = firstPage;
      for (let i = 0; i < MAX_PAGES_PER_LOAD && more && found.length < WANT_AT_LEAST; i++) {
        const data = await searchArt({ source: src, q, page, shape, paintings });
        if (token !== latestSearch.current) return null;
        found = found.concat(data.results);
        hiddenCount += data.hidden;
        more = data.has_more;
        page += 1;
      }
      return { found, hiddenCount, more, lastPage: page - 1 };
    },
    [shape, paintings]
  );

  useEffect(() => {
    if (!sourceId) return;
    const token = ++latestSearch.current;
    setLoading(true);
    setError("");
    setResults([]);
    collect(sourceId, query, 1, token)
      .then((outcome) => {
        if (!outcome) return;
        setResults(outcome.found);
        setHidden(outcome.hiddenCount);
        setHasMore(outcome.more);
        setLastPage(outcome.lastPage);
      })
      .catch((e) => token === latestSearch.current && setError(e.message || "Search failed"))
      .finally(() => token === latestSearch.current && setLoading(false));
  }, [sourceId, query, collect]);

  async function loadMore() {
    const token = latestSearch.current;
    setLoadingMore(true);
    try {
      const outcome = await collect(sourceId, query, lastPage + 1, token);
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

  function runSearch(text: string) {
    setQueryInput(text);
    setQuery(text.trim());
  }

  // --- Importing ----------------------------------------------------------------

  async function resolveAlbumId(): Promise<string | undefined> {
    if (albumId !== NEW_ALBUM) return albumId || undefined;
    const name = newAlbumName.trim();
    if (!name) throw new Error("Enter a name for the new album");
    const existing = albums.find((a) => a.name === name);
    if (existing) return existing.id;
    const updated = await createAlbum(name);
    const created = updated.find((a: any) => a.name === name);
    if (!created) throw new Error("Could not create the album");
    setAlbumId(String(created.id));
    return String(created.id);
  }

  async function addToGallery(art: Artwork) {
    modalOpen.current = true;
    setActive({ artwork: art, jobId: null, job: null, startError: "", open: true });
    try {
      const targetAlbum = await resolveAlbumId();
      const jobId = await startImport({ source: art.source, id: art.id, fit: framing, albumId: targetAlbum });
      setActive((current) => (current && current.artwork === art ? { ...current, jobId } : current));
    } catch (e: any) {
      setActive((current) =>
        current && current.artwork === art ? { ...current, startError: e.message || "Could not start the import" } : current
      );
    }
  }

  function closeModal() {
    modalOpen.current = false;
    setActive((current) => (current ? { ...current, open: false } : current));
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
    // If the pop-up was hidden while this ran, say how it ended.
    if (!modalOpen.current) {
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

  // --- Importing from a link (the page or a bookmarklet from the source's own site) ---

  const lookUpLink = useCallback(async (url: string) => {
    setLinkBusy(true);
    setLinkError("");
    try {
      const found = await resolveLink(url.trim());
      setLinked(found.artwork);
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

  const activeSource = active ? (sources.find((s) => s.id === active.artwork.source) ?? null) : null;
  const linkedSource = linked ? (sources.find((s) => s.id === linked.source) ?? null) : null;
  const busy = active !== null && active.open && !active.startError && active.job?.state !== "done" && active.job?.state !== "error";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <h1 className="mb-1 mt-3 text-center text-2xl font-bold text-foreground">Discover</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Free, high-resolution art, imported at the right size for your Frame.
      </p>

      {/* Sources */}
      <div role="group" aria-label="Art sources" className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === sourceId}
            onClick={() => setSourceId(s.id)}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
              s.id === sourceId
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            <SourceLogo source={s} className="size-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{s.name}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{s.tagline}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <form
        role="search"
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(queryInput);
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
            placeholder={source ? `Search ${source.name} (an artist, a place, a mood)` : "Search"}
            aria-label="Search for art"
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick}
            type="button"
            onClick={() => runSearch(pick)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
              query.toLowerCase() === pick.toLowerCase()
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            {pick}
          </button>
        ))}
        {query && (
          <button
            type="button"
            onClick={() => runSearch("")}
            className="rounded-full px-3 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear search
          </button>
        )}
      </div>

      {/* Shape */}
      <fieldset className="mb-4">
        <legend className="sr-only">Shape of the artwork</legend>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            Shape
          </span>
          {SHAPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 ${
                shape === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              <input
                type="radio"
                name="shape"
                value={option.value}
                checked={shape === option.value}
                onChange={() => setShape(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {SHAPE_OPTIONS.find((option) => option.value === shape)?.hint}
          {shape === "fits" && source && !source.tv_ready && (
            <>
              {" "}
              Very few museum works are exactly 16:9, so expect a short list. Everything on Reframed Gallery is made
              for it.{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => setSourceId(sources.find((s) => s.tv_ready)?.id ?? sourceId)}
              >
                Switch to Reframed
              </button>
            </>
          )}
        </p>
      </fieldset>

      {/* How things are imported */}
      <div
        className={`mb-6 grid gap-4 rounded-lg border border-border bg-card p-4 ${
          source?.has_type_filter ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Framing</legend>
          {source?.tv_ready ? (
            <p className="text-sm">Already cropped to 3840 × 2160 by {source.short_name}.</p>
          ) : (
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border text-sm">
              {(
                [
                  ["fill", "Fill the screen"],
                  ["whole", "Whole artwork"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer px-3 py-2 text-center transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 ${
                    framing === value ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="framing"
                    value={value}
                    checked={framing === value}
                    onChange={() => setFraming(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          {!source?.tv_ready && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {framing === "fill"
                ? "Crops to 16:9 so it fills the TV. Tiles preview the crop."
                : "Keeps every edge; the TV shows it with a matte."}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="discover-album" className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Add to album
          </label>
          <select
            id="discover-album"
            value={albumId}
            onChange={(e) => setAlbumId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <option value="">No album</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}
              </option>
            ))}
            <option value={NEW_ALBUM}>+ New album…</option>
          </select>
          {albumId === NEW_ALBUM && (
            <Input
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="New album name"
              aria-label="New album name"
              className="mt-2"
            />
          )}
        </div>

        {source?.has_type_filter && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Show</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={paintings}
                onChange={(e) => setPaintings(e.target.checked)}
                className="size-4"
              />
              Paintings only
            </label>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave off to include prints, drawings and photographs.
            </p>
          </fieldset>
        )}
      </div>

      {/* Results */}
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => runSearch(queryInput)}>
            Try again
          </Button>
        </div>
      )}

      {source && !error && (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          {loading
            ? "Searching…"
            : `${results.length} work${results.length === 1 ? "" : "s"} shown`}
          {!loading && hidden > 0 && shape !== "any" && (
            <>
              {" · "}
              {hidden} hidden by the shape filter.{" "}
              <button type="button" className="text-primary underline underline-offset-2" onClick={() => setShape("any")}>
                Show them
              </button>
            </>
          )}
        </p>
      )}

      {loading ? (
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
              <p className="mt-1">Try another word{shape !== "any" ? ", or show every shape" : ""}.</p>
              {shape !== "any" && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShape("any")}>
                  Show every shape
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
                  framing={framing}
                  added={added.has(keyOf(art))}
                  disabled={busy}
                  onAdd={addToGallery}
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
      )}

      {/* From a link */}
      <section className="mt-10 rounded-lg border border-border bg-card p-4" aria-labelledby="discover-link-heading">
        <h2 id="discover-link-heading" className="mb-1 flex items-center gap-2 text-base font-semibold">
          <LinkIcon className="size-5 text-primary" aria-hidden="true" />
          Found something on another site?
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Paste a link to an artwork page from Reframed, the Met, the Art Institute of Chicago or the Cleveland
          Museum of Art.
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
              Drag this button to your bookmarks bar. On any artwork page from the sites above, click it and the
              artwork opens here, ready to add.
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
        Artwork comes from museums and galleries that share it openly. Please check each source&apos;s terms before
        using it beyond your own home.
      </p>

      {/* Confirm an artwork that arrived by link */}
      <Dialog.Root open={linked !== null} onOpenChange={(open) => !open && setLinked(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 shadow-xl focus:outline-none">
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="font-semibold">Add this artwork?</Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <XMarkIcon className="size-5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Confirm adding this artwork from its link to your gallery.
            </Dialog.Description>
            {linked && linkedSource && (
              <ArtworkCard
                artwork={linked}
                source={linkedSource}
                framing={framing}
                added={added.has(keyOf(linked))}
                disabled={busy}
                onAdd={(art) => {
                  setLinked(null);
                  addToGallery(art);
                }}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DownloadProgressModal
        open={Boolean(active?.open)}
        artwork={active?.artwork ?? null}
        source={activeSource}
        job={active?.job ?? null}
        startError={active?.startError ?? ""}
        onClose={closeModal}
        onRetry={() => active && addToGallery(active.artwork)}
      />
    </div>
  );
}
