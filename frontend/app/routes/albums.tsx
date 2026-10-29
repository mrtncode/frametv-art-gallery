import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowLeft as ArrowLeftIcon, MagnifyingGlass as MagnifyingGlassIcon, Plus as PlusIcon, XCircle as XCircleIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AlbumNameDialog, AlbumTile, type Album } from "~/components/AlbumStrip";
import { createAlbum, deleteAlbum, fetchAlbums, renameAlbum } from "~/utils/galleryApi";

/** Every album, empty ones included, for finding, renaming and deleting when there are too many for the gallery. */
export default function Albums() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [query, setQuery] = useState("");
  const [nameTarget, setNameTarget] = useState<Album | "new" | null>(null);

  useEffect(() => {
    fetchAlbums()
      .then(setAlbums)
      .catch((e: any) => {
        setAlbums([]);
        toast.error(e.message || "Failed to load albums", { position: "top-center" });
      });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(albums ?? [])]
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [albums, query]);

  async function handleName(name: string) {
    if (nameTarget === "new") {
      setAlbums(await createAlbum(name));
      toast.success(`Created ${name}`, { position: "top-center" });
    } else if (nameTarget) {
      setAlbums(await renameAlbum(nameTarget.id, name));
      toast.success(`Renamed to ${name}`, { position: "top-center" });
    }
  }

  async function handleDelete(album: Album) {
    if (!window.confirm(`Delete the album "${album.name}"? Its images stay in the gallery.`)) return;
    try {
      setAlbums(await deleteAlbum(album.name));
      toast.success(`Deleted ${album.name}`, { position: "top-center" });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete album", { position: "top-center" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28">
      <h1 className="sr-only">Albums</h1>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/gallery" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Gallery
        </Link>
        <Button type="button" variant="outline" size="sm" onClick={() => setNameTarget("new")}>
          <PlusIcon weight="regular" aria-hidden="true" />
          New album
        </Button>
      </div>

      <div className="relative mb-3">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an album"
          aria-label="Find an album"
          className="h-11 pl-9 pr-9 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <XCircleIcon weight="regular" className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="mb-3 px-1 text-sm text-muted-foreground" aria-live="polite">
        {albums === null ? "Loading…" : `${shown.length} album${shown.length === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}`}
      </p>

      {albums === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="block aspect-square animate-pulse rounded-xl bg-accent" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {query ? `No album matches “${query}”.` : "No albums yet."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((album) => (
            <AlbumTile
              key={album.id}
              album={album}
              active={false}
              className="aspect-square"
              onSelect={() => navigate(`/gallery?album=${encodeURIComponent(album.id)}`)}
              onRename={() => setNameTarget(album)}
              onDelete={() => handleDelete(album)}
            />
          ))}
        </div>
      )}

      <AlbumNameDialog target={nameTarget} onClose={() => setNameTarget(null)} onSubmit={handleName} />
    </div>
  );
}
