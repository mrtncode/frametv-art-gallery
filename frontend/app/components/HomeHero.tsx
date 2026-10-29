import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight as ArrowUpRightIcon, CaretLeft as ChevronLeftIcon, CaretRight as ChevronRightIcon, Pause as PauseIcon, Play as PlayIcon } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Tooltip } from "./ui/tooltip";
import { getUploadUrl } from "~/utils/galleryApi";
import { proxiedImageUrl } from "~/utils/discoverApi";

const ROTATE_MS = 7000;
const SWIPE_PX = 40;

export type HeroSlide = {
  key: string;
  /** Which collection this slide belongs to, e.g. "Latest added" */
  topic: string;
  filename: string;
  /** A picture from elsewhere (Discover), used instead of the library file `filename`. */
  imageUrl?: string;
  title: string;
  subtitle: string;
  to: string;
  action: string;
};

/**
 * A slide's picture. One from Discover is loaded straight from its source, and through this
 * app instead if the browser cannot (some sites refuse cross-site image requests).
 */
function SlidePicture({ slide, eager }: { slide: HeroSlide; eager: boolean }) {
  const [proxied, setProxied] = useState(false);
  const external = slide.imageUrl;
  const src = external ? (proxied ? proxiedImageUrl(external) : external) : getUploadUrl(slide.filename, 800);
  return (
    <img
      key={src}
      src={src}
      alt={slide.title}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      referrerPolicy={external ? "no-referrer" : undefined}
      onError={() => external && !proxied && setProxied(true)}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

interface HomeHeroProps {
  /** null while loading */
  slides: HeroSlide[] | null;
}

/** A slideshow of the library that moves through a few topics: what was added last, a random pick, an album. */
export default function HomeHero({ slides }: HomeHeroProps) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const count = slides?.length ?? 0;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const rotating = !userPaused && !hovering && !reducedMotion && count > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((current) => (current + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating, count]);

  if (slides === null) {
    return <Skeleton className="aspect-[4/3] w-full rounded-2xl sm:aspect-[16/6]" aria-hidden="true" />;
  }
  if (slides.length === 0) return null;

  const go = (next: number) => setIndex(((next % count) + count) % count);
  const topics = slides.reduce<{ name: string; first: number }[]>((all, slide, position) => {
    if (!all.some((t) => t.name === slide.topic)) all.push({ name: slide.topic, first: position });
    return all;
  }, []);
  const currentTopic = slides[index].topic;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="From your library"
      className="relative select-none overflow-hidden rounded-2xl border border-border bg-neutral-900"
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
        {slides.map((slide, position) => (
          <div
            key={slide.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${count}: ${slide.topic}`}
            aria-hidden={position !== index}
            inert={position !== index}
            className="relative aspect-[4/3] w-full shrink-0 sm:aspect-[16/6]"
          >
            <SlidePicture slide={slide} eager={position === 0} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-20 text-white sm:px-6 sm:pb-5">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 max-w-xl">
                  <h2 className="line-clamp-2 text-xl font-semibold leading-tight text-balance sm:text-3xl">{slide.title}</h2>
                  {slide.subtitle && <p className="mt-0.5 line-clamp-1 text-sm text-white/85">{slide.subtitle}</p>}
                </div>
                <Tooltip label={slide.action}>
                  <Button asChild size="icon" className="shrink-0 rounded-full bg-white text-neutral-950 hover:bg-white/90">
                    <Link to={slide.to} aria-label={slide.action}>
                      <ArrowUpRightIcon className="size-5" aria-hidden="true" />
                    </Link>
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Which collection this is, and a way to jump between them */}
      <div
        className="no-scrollbar absolute left-3 top-3 flex h-8 max-w-[calc(100%-5.5rem)] items-center gap-0.5 overflow-x-auto rounded-full bg-black/55 p-0.5 backdrop-blur sm:max-w-[calc(100%-12rem)]"
        role="group"
        aria-label="Collections"
      >
        {topics.map((topic) => (
          <button
            key={topic.name}
            type="button"
            onClick={() => go(topic.first)}
            aria-pressed={topic.name === currentTopic}
            className={`h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-white focus-visible:outline-none ${
              topic.name === currentTopic ? "bg-white text-neutral-950" : "text-white/90 hover:bg-white/15 hover:text-white"
            }`}
          >
            {topic.name}
          </button>
        ))}
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

          <div className="absolute right-3 top-3 flex h-8 items-center gap-2 rounded-full bg-black/55 px-2.5 backdrop-blur">
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
            <div className="hidden items-center gap-1.5 sm:flex">
              {slides.map((slide, position) => (
                <button
                  key={slide.key}
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
  );
}
