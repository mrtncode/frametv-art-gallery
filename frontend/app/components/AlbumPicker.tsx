import { useState } from "react";
import { Popover } from "radix-ui";
import { CheckIcon, ChevronDownIcon, InboxIcon, MagnifyingGlassIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { AlbumCover, type Album } from "./AlbumStrip";

export const ALL_ALBUMS = "all";
/** Images that are in no album */
export const UNSORTED = "unsorted";

/** Long lists get a filter of their own. */
const FILTER_FROM = 8;

interface AlbumPickerProps {
  albums: Album[];
  scope: string;
  onSelect: (scope: string) => void;
  /** Images in no album, shown on that choice */
  unsortedCount: number;
}

/**
 * The left segment of the gallery's search bar: says which album is searched ("All albums"
 * or one), and opens the list to choose from. The gallery counterpart of Discover's SourcePicker.
 */
export default function AlbumPicker({ albums, scope, onSelect, unsortedCount }: AlbumPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const current = albums.find((a) => String(a.id) === scope) ?? null;
  const label = current ? current.name : scope === UNSORTED ? "Not in an album" : "All albums";
  const shown = albums.filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const choose = (next: string) => {
    onSelect(next);
    setOpen(false);
  };

  const option = (value: string, icon: React.ReactNode, title: string, detail: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={scope === value}
      onClick={() => choose(value)}
      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
        scope === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-transparent hover:bg-accent"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      {scope === value && <CheckIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );

  const iconTile = (icon: React.ReactNode) => (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFilter("");
      }}
    >
      <Popover.Trigger
        aria-label={`Searching ${label}. Change album`}
        title={label}
        className="inline-flex h-full shrink-0 items-center gap-1 rounded-l-md border-r border-border bg-muted/50 pl-3 pr-2 transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {/* Just an icon: the album in use shows as its cover (or an inbox), and the rest of the page says which. */}
        {current ? (
          <AlbumCover album={current} className="size-6" />
        ) : scope === UNSORTED ? (
          <InboxIcon className="size-5 text-primary" aria-hidden="true" />
        ) : (
          <Squares2X2Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={12}
          collisionPadding={12}
          className="z-50 flex max-h-[min(30rem,calc(100dvh-8rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg focus:outline-none"
        >
          <div className="space-y-1">
            {option(
              ALL_ALBUMS,
              iconTile(<Squares2X2Icon className="size-5" aria-hidden="true" />),
              "All albums",
              "Every image in the gallery"
            )}
            {option(
              UNSORTED,
              iconTile(<InboxIcon className="size-5" aria-hidden="true" />),
              "Not in an album",
              `${unsortedCount} image${unsortedCount === 1 ? "" : "s"} waiting for a home`
            )}
          </div>

          {albums.length > 0 && (
            <>
              <div className="my-2 border-t border-border" />
              {albums.length > FILTER_FROM && (
                <div className="relative mb-1.5">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Find an album"
                    aria-label="Find an album"
                    className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  />
                </div>
              )}
              <div role="group" aria-label="Albums" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {shown.map((album) =>
                  option(
                    String(album.id),
                    <AlbumCover album={album} />,
                    album.name,
                    `${album.images.length} image${album.images.length === 1 ? "" : "s"}`
                  )
                )}
                {shown.length === 0 && <p className="p-2 text-sm text-muted-foreground">No album matches “{filter}”.</p>}
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
