import { useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { getUploadUrl } from "~/utils/galleryApi";

export type Album = { id: string; name: string; images: string[] };

/** More than this and the desktop row offers the full list, with a filter. */
const ROW_LIMIT = 8;
/** A phone shows a 2×2 grid: four albums, or three and a "more" square. */
const GRID_LIMIT = 4;

const cornerButton =
  "inline-flex size-7 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none";

/** A small square cover, used where an album is listed (the search bar's album picker). */
export function AlbumCover({ album, className = "size-10" }: { album: Album; className?: string }) {
  const cover = album.images[0];
  return cover ? (
    <img
      src={getUploadUrl(cover, 160)}
      alt=""
      loading="lazy"
      className={`${className} shrink-0 rounded-md bg-muted object-cover`}
    />
  ) : (
    <span className={`${className} inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground`}>
      <PhotoIcon className="size-5" aria-hidden="true" />
    </span>
  );
}

function imageCount(album: Album) {
  return `${album.images.length} image${album.images.length === 1 ? "" : "s"}`;
}

/** One of an album's pictures, picked at random once per visit so the tiles feel alive without flickering. */
function useRandomImage(images: string[]) {
  return useMemo(
    () => (images.length ? images[Math.floor(Math.random() * images.length)] : null),
    // Re-pick only when the album's contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images.join("|")]
  );
}

/** A picture filling the tile, darkened at the bottom so white text reads on any image. */
function TileBackdrop({ image }: { image: string | null }) {
  const [loaded, setLoaded] = useState(false);
  if (!image) {
    return (
      <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-accent text-muted-foreground">
        <PhotoIcon className="size-8 opacity-60" aria-hidden="true" />
      </span>
    );
  }
  return (
    <>
      {!loaded && <span className="absolute inset-0 animate-pulse bg-accent" aria-hidden="true" />}
      <img
        src={getUploadUrl(image, 400)}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`absolute inset-0 size-full object-cover transition-[transform,opacity] duration-500 ease-out group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden="true" />
    </>
  );
}

interface AlbumTileProps {
  album: Album;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Size and shape, which differ between the phone grid, the desktop row and the full list */
  className: string;
}

/** One album as a picture tile: tap to show its images below; rename and delete sit in the top-right corner. */
function AlbumTile({ album, active, onSelect, onRename, onDelete, className }: AlbumTileProps) {
  const image = useRandomImage(album.images);
  return (
    <div
      className={`group relative isolate overflow-hidden rounded-xl bg-neutral-900 shadow-xs transition-shadow hover:shadow-lg ${
        active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      } ${className}`}
    >
      <TileBackdrop image={image} />
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className="absolute inset-0 flex flex-col justify-end p-3 text-left focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/70 focus-visible:outline-none"
      >
        <span className={`block truncate text-sm font-semibold leading-tight drop-shadow-sm ${image ? "text-white" : "text-foreground"}`}>
          {album.name}
        </span>
        <span className={`block text-xs ${image ? "text-white/75" : "text-muted-foreground"}`}>{imageCount(album)}</span>
      </button>
      {/* Shown on hover or keyboard focus; always shown where there is no hover (touch). */}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" className={cornerButton} onClick={onRename} aria-label={`Rename ${album.name}`} title="Rename">
          <PencilSquareIcon className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${cornerButton} hover:bg-destructive`}
          onClick={onDelete}
          aria-label={`Delete ${album.name}`}
          title="Delete"
        >
          <TrashIcon className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** The last square of the phone grid (and the end of the desktop row): opens every album. */
function MoreTile({ albums, count, onClick, className }: { albums: Album[]; count: number; onClick: () => void; className: string }) {
  const image = useRandomImage(albums.flatMap((a) => a.images));
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative isolate overflow-hidden rounded-xl bg-neutral-900 text-white shadow-xs transition-shadow hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${className}`}
    >
      <TileBackdrop image={image} />
      {/* Heavier wash than an album tile, so it reads as a button and not another album */}
      <span className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-hidden="true" />
      <span className="relative flex size-full flex-col items-center justify-center gap-1">
        <Squares2X2Icon className="size-6" aria-hidden="true" />
        <span className="text-sm font-semibold">+{count} more</span>
        <span className="text-xs text-white/75">See all albums</span>
      </span>
    </button>
  );
}

interface AlbumStripProps {
  albums: Album[];
  /** The album the gallery is showing, or null for none in particular */
  activeId: string | null;
  /** Called with the album's id, or null when the active album is tapped again */
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onRename: (album: Album) => void;
  onDelete: (album: Album) => void;
  loading?: boolean;
}

/**
 * Albums at the top of the gallery, so they stay in reach however many images there are.
 * A phone gets a compact 2×2 grid; wider screens a single scrolling row. With more albums
 * than fit, a "more" tile (and "See all") opens the full list.
 */
export default function AlbumStrip({ albums, activeId, onSelect, onCreate, onRename, onDelete, loading }: AlbumStripProps) {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!showAll) setFilter("");
  }, [showAll]);

  const toggle = (id: string) => onSelect(activeId === id ? null : id);
  const tile = (album: Album, className: string, afterSelect?: () => void) => (
    <AlbumTile
      key={album.id}
      album={album}
      active={activeId === String(album.id)}
      onSelect={() => {
        toggle(String(album.id));
        afterSelect?.();
      }}
      onRename={() => onRename(album)}
      onDelete={() => onDelete(album)}
      className={className}
    />
  );
  const filtered = albums.filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase()));

  // The phone grid always shows the album being viewed, moving it to the front if it would be hidden.
  const gridOverflows = albums.length > GRID_LIMIT;
  const gridAlbums = useMemo(() => {
    const room = gridOverflows ? GRID_LIMIT - 1 : GRID_LIMIT;
    const first = albums.slice(0, room);
    const active = albums.find((a) => String(a.id) === activeId);
    if (!active || first.includes(active)) return first;
    return [active, ...first.slice(0, room - 1)];
  }, [albums, activeId, gridOverflows]);

  const rowTile = "w-52 shrink-0 snap-start aspect-[16/10]";

  return (
    <section aria-labelledby="albums-heading" className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="albums-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Albums{albums.length > 0 && <span className="ml-1.5 font-normal tabular-nums">{albums.length}</span>}
        </h2>
        <div className="flex items-center gap-1">
          {/* Phones have the "more" square instead */}
          {albums.length > ROW_LIMIT && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)} className="hidden sm:inline-flex">
              See all
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onCreate}>
            <PlusIcon aria-hidden="true" />
            New album
          </Button>
        </div>
      </div>

      {loading ? (
        <div aria-hidden="true">
          <div className="grid grid-cols-2 gap-3 sm:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="block aspect-square animate-pulse rounded-xl bg-accent" />
            ))}
          </div>
          <div className="hidden gap-3 overflow-hidden sm:flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`block animate-pulse rounded-xl bg-accent ${rowTile}`} />
            ))}
          </div>
        </div>
      ) : albums.length === 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className="w-full rounded-xl border border-dashed border-border p-4 text-left text-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          No albums yet. Albums group pictures, so you can filter the gallery or send a whole set to the TV.{" "}
          <span className="font-medium text-primary">Create one</span>
        </button>
      ) : (
        <>
          {/* Phone: a 2×2 grid of squares */}
          <div className="grid grid-cols-2 gap-3 sm:hidden">
            {gridAlbums.map((album) => tile(album, "aspect-square"))}
            {gridOverflows && (
              <MoreTile
                albums={albums.filter((a) => !gridAlbums.includes(a))}
                count={albums.length - gridAlbums.length}
                onClick={() => setShowAll(true)}
                className="aspect-square"
              />
            )}
          </div>

          {/* Tablet and up: one scrolling row; p-1 leaves room for the selected ring */}
          <div className="-m-1 hidden snap-x gap-3 overflow-x-auto p-1 pb-2 [scrollbar-width:thin] sm:flex">
            {albums.slice(0, ROW_LIMIT).map((album) => tile(album, rowTile))}
            {albums.length > ROW_LIMIT && (
              <MoreTile
                albums={albums.slice(ROW_LIMIT)}
                count={albums.length - ROW_LIMIT}
                onClick={() => setShowAll(true)}
                className={`${rowTile} w-40`}
              />
            )}
          </div>
        </>
      )}

      <Dialog.Root open={showAll} onOpenChange={setShowAll}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg focus:outline-none">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Dialog.Title className="text-base font-semibold">All albums ({albums.length})</Dialog.Title>
              <Dialog.Close className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
                <XMarkIcon className="size-5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Pick an album to show its images, or rename or delete one.</Dialog.Description>
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find an album"
                aria-label="Find an album"
                className="pl-9"
              />
            </div>
            <div className="-m-1 grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-1 sm:grid-cols-3">
              {filtered.map((album) => tile(album, "aspect-[4/3]", () => setShowAll(false)))}
              {filtered.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No album matches “{filter}”.</p>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

interface AlbumNameDialogProps {
  /** null when closed; an album to rename it, or "new" to create one */
  target: Album | "new" | null;
  onClose: () => void;
  /** Resolve to close; throw to show the error and stay open */
  onSubmit: (name: string) => Promise<void>;
}

/** Name an album: used for both creating and renaming. */
export function AlbumNameDialog({ target, onClose, onSubmit }: AlbumNameDialogProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isNew = target === "new";

  useEffect(() => {
    setName(target && target !== "new" ? target.name : "");
    setError("");
  }, [target]);

  const unchanged = !isNew && target && name.trim() === target.name;

  return (
    <Dialog.Root open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg focus:outline-none">
          <Dialog.Title className="mb-3 text-base font-semibold">{isNew ? "New album" : "Rename album"}</Dialog.Title>
          <Dialog.Description className="sr-only">{isNew ? "Name the new album." : "Give the album a new name."}</Dialog.Description>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || unchanged) return;
              setBusy(true);
              setError("");
              try {
                await onSubmit(name.trim());
                onClose();
              } catch (err: any) {
                setError(err.message || "Something went wrong");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Album name" aria-label="Album name" autoFocus />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim() || !!unchanged}>
                {busy ? "Saving…" : isNew ? "Create" : "Rename"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
