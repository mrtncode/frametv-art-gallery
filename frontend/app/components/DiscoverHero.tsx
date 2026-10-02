import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import SourceLogo from "./SourceLogo";
import { proxiedImageUrl, type Artwork, type DiscoverSource } from "~/utils/discoverApi";

const ROTATE_MS = 7000;
const SWIPE_PX = 40;

/** The slide's picture: the large version first, then the tile-sized one, each tried direct and then through the proxy. */
function HeroImage({ artwork, eager }: { artwork: Artwork; eager: boolean }) {
  const candidates = [
    artwork.hero_url ?? artwork.thumb_url,
    proxiedImageUrl(artwork.hero_url ?? artwork.thumb_url),
    ...(artwork.hero_url ? [artwork.thumb_url, proxiedImageUrl(artwork.thumb_url)] : []),
  ];
  const [attempt, setAttempt] = useState(0);
  const failed = attempt >= candidates.length;

  return (
    <>
      {failed && <span className="absolute inset-0 bg-neutral-800" aria-hidden="true" />}
      {!failed && (
        <img
          key={attempt}
          src={candidates[attempt]}
          alt={`${artwork.title}${artwork.artist ? ` by ${artwork.artist}` : ""}`}
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setAttempt((n) => n + 1)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </>
  );
}

interface DiscoverHeroProps {
  /** null while loading; an empty list hides the hero */
  items: Artwork[] | null;
  sources: DiscoverSource[];
  /** Search has the focus, so the hero scrolls out of the way */
  collapsed: boolean;
  onAdd: (artwork: Artwork) => void;
  onBrowse: (sourceId: string) => void;
}

export default function DiscoverHero({ items, sources, collapsed, onAdd, onBrowse }: DiscoverHeroProps) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const count = items?.length ?? 0;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const rotating = !userPaused && !hovering && !reducedMotion && !collapsed && count > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((current) => (current + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating, count]);

  if (items !== null && items.length === 0) return null;

  const go = (next: number) => setIndex(((next % count) + count) % count);

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity,margin] duration-500 ease-out motion-reduce:transition-none ${
        collapsed ? "mb-0 grid-rows-[0fr] opacity-0" : "mb-6 grid-rows-[1fr] opacity-100"
      }`}
      inert={collapsed}
    >
      <div className="min-h-0 overflow-hidden">
        {items === null ? (
          <Skeleton className="aspect-[4/3] w-full rounded-xl sm:aspect-[16/7]" aria-hidden="true" />
        ) : (
          <section
            role="region"
            aria-roledescription="carousel"
            aria-label="Today's picks"
            className="relative overflow-hidden rounded-xl border border-border bg-neutral-900"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onFocusCapture={() => setHovering(true)}
            onBlurCapture={() => setHovering(false)}
            onTouchStart={(event) => {
              touchStart.current = event.touches[0].clientX;
            }}
            onTouchEnd={(event) => {
              if (touchStart.current === null) return;
              const delta = event.changedTouches[0].clientX - touchStart.current;
              touchStart.current = null;
              if (Math.abs(delta) > SWIPE_PX) go(index + (delta < 0 ? 1 : -1));
            }}
          >
            <div
              className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(-${index * 100}%)` }}
              aria-live={rotating ? "off" : "polite"}
            >
              {items.map((art, position) => {
                const source = sources.find((s) => s.id === art.source);
                return (
                  <div
                    key={`${art.source}:${art.id}`}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${position + 1} of ${count}`}
                    aria-hidden={position !== index}
                    inert={position !== index}
                    className="relative aspect-[4/3] w-full shrink-0 sm:aspect-[16/7]"
                  >
                    <HeroImage artwork={art} eager={position === 0} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-16 text-white sm:px-6 sm:pb-5">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-0 max-w-xl">
                          {source && (
                            <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-white/90">
                              <SourceLogo source={source} className="size-5" />
                              {source.name}
                            </p>
                          )}
                          <h2 className="line-clamp-2 text-xl font-semibold leading-tight text-balance sm:text-3xl">
                            {art.title}
                          </h2>
                          <p className="mt-0.5 line-clamp-1 text-sm text-white/85">
                            {[art.artist, art.date].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-white text-neutral-950 hover:bg-white/90" onClick={() => onAdd(art)}>
                            Add to gallery
                          </Button>
                          {source && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/60 bg-transparent text-white hover:bg-white/15 hover:text-white"
                              onClick={() => onBrowse(source.id)}
                            >
                              More from {source.short_name.replace(/^the /i, "")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  aria-label="Previous picture"
                  className="absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none sm:inline-flex"
                >
                  <ChevronLeftIcon className="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  aria-label="Next picture"
                  className="absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none sm:inline-flex"
                >
                  <ChevronRightIcon className="size-5" aria-hidden="true" />
                </button>

                <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setUserPaused((paused) => !paused)}
                    aria-label={userPaused || reducedMotion ? "Start the slideshow" : "Pause the slideshow"}
                    className="inline-flex size-5 items-center justify-center rounded-full text-white focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none"
                  >
                    {userPaused || reducedMotion ? (
                      <PlayIcon className="size-4" aria-hidden="true" />
                    ) : (
                      <PauseIcon className="size-4" aria-hidden="true" />
                    )}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {items.map((art, position) => (
                      <button
                        key={`${art.source}:${art.id}`}
                        type="button"
                        onClick={() => go(position)}
                        aria-label={`Show picture ${position + 1} of ${count}`}
                        aria-current={position === index}
                        className={`h-1.5 rounded-full transition-all focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none ${
                          position === index ? "w-5 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
