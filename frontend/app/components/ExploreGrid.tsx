import { LinkSimple as LinkIcon } from "@phosphor-icons/react";
import type { ExploreTile } from "~/lib/explore";

interface ExploreGridProps {
  tiles: ExploreTile[];
  onPick: (tile: ExploreTile) => void;
  /** Opens the paste-a-link dialog */
  onPasteLink: () => void;
}

// Tailwind only generates classes it can see written out, so the spans are looked up, not built.
const SM_SPAN = ["", "sm:col-span-1", "sm:col-span-2", "sm:col-span-3"];
const LG_SPAN = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4"];

/** How many columns the paste tile takes so the last row of `count` tiles (the first double width) ends flush. */
function fillSpan(count: number, columns: number) {
  const used = count + (count > 0 ? 1 : 0);
  return 1 + ((columns - ((used + 1) % columns)) % columns);
}

/**
 * On a phone, how tile `i` of `count` sits in a two-column list: every fifth is a wide one,
 * the pairs between alternate tall and short, and a tile left alone in its row is widened.
 * Different sizes keep a long list from reading as a wall of identical boxes.
 */
function phoneShape(i: number, count: number) {
  const slot = i % 5;
  const wide = slot === 0 || (i === count - 1 && (slot === 1 || slot === 3));
  if (wide) return i === 0 ? "col-span-2 h-28" : "col-span-2 h-24";
  return slot <= 2 ? "h-36" : "h-28";
}

/**
 * Topics to start from. A phone gets a list of chips running down the page, in a few sizes;
 * from tablet width up they fill the page evenly. The first tile is what is in season, and
 * is twice as wide.
 */
export default function ExploreGrid({ tiles, onPick, onPasteLink }: ExploreGridProps) {
  // The paste tile is one more chip in the list, and stretches to finish the last row.
  const pasteClass = `${phoneShape(tiles.length, tiles.length + 1)} ${SM_SPAN[fillSpan(tiles.length, 3)]} ${LG_SPAN[fillSpan(tiles.length, 4)]} sm:h-32`;
  return (
    <section aria-labelledby="explore-heading" className="mb-6">
      <h2 id="explore-heading" className="mb-2 text-sm font-medium text-muted-foreground">
        Explore
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile, i) => {
          const Icon = tile.icon;
          return (
            <li key={tile.id} className={`${phoneShape(i, tiles.length)} ${i === 0 ? "sm:col-span-2" : "sm:col-span-1"} sm:h-32`}>
              <button
                type="button"
                onClick={() => onPick(tile)}
                className={`group relative flex size-full flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br p-3 text-left text-white shadow-xs transition-transform hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${tile.gradient}`}
              >
                {/* Duotone line art in the chip's own white: the second tone is the same colour, faded. */}
                <Icon
                  aria-hidden="true"
                  weight="duotone"
                  className="pointer-events-none absolute right-3 top-3 size-12 text-white/90 transition-transform duration-300 group-hover:scale-110 sm:size-14"
                />
                {i === 0 && (
                  <span className="mb-auto inline-flex w-fit rounded-full bg-black/25 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide">
                    In season
                  </span>
                )}
                <span className="relative text-base font-semibold leading-tight">{tile.label}</span>
                <span className="relative line-clamp-2 text-xs leading-snug text-white/85">{tile.blurb}</span>
              </button>
            </li>
          );
        })}
        <li className={pasteClass}>
          <button
            type="button"
            onClick={onPasteLink}
            className="group flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-card/50 p-3 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-selection/40 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
              <LinkIcon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium">Paste a link</span>
            <span className="text-xs">From any source’s site</span>
          </button>
        </li>
      </ul>
    </section>
  );
}
