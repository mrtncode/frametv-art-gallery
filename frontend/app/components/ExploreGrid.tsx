import type { ExploreTile } from "~/lib/explore";

interface ExploreGridProps {
  tiles: ExploreTile[];
  onPick: (tile: ExploreTile) => void;
}

/**
 * Topics to start from. On a phone they are a row to swipe through (a grid of twelve would
 * push everything else off the screen); from tablet width up they fill the page. The first
 * tile is what is in season, and is twice as wide.
 */
export default function ExploreGrid({ tiles, onPick }: ExploreGridProps) {
  return (
    <section aria-labelledby="explore-heading" className="mb-6">
      <h2 id="explore-heading" className="mb-2 text-sm font-medium text-muted-foreground">
        Explore
      </h2>
      <ul className="-mx-4 flex snap-x snap-proximity scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:scroll-px-0 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {tiles.map((tile, i) => (
          <li key={tile.id} className={`snap-start ${i === 0 ? "w-60 shrink-0 sm:col-span-2 sm:w-auto" : "w-40 shrink-0 sm:w-auto"}`}>
            <button
              type="button"
              onClick={() => onPick(tile)}
              className={`group relative flex h-28 w-full flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br p-3 text-left text-white shadow-xs transition-transform hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:h-32 ${tile.gradient}`}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-1 -top-1 select-none text-6xl opacity-90 drop-shadow-sm transition-transform group-hover:scale-110 sm:text-7xl"
              >
                {tile.emoji}
              </span>
              {i === 0 && (
                <span className="mb-auto inline-flex w-fit rounded-full bg-black/25 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide">
                  In season
                </span>
              )}
              <span className="relative text-base font-semibold leading-tight">{tile.label}</span>
              <span className="relative line-clamp-2 text-xs leading-snug text-white/85">{tile.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
