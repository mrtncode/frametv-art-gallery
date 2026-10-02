import type { Route } from "./+types/home";
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchAlbums,
  fetchImageDetails,
  fetchImages,
  fetchImagesAddedByMonth,
  getUploadUrl,
  type ImageProvenance,
  type MonthlyCount,
} from "~/utils/galleryApi";
import HomeHero, { type HeroSlide } from "~/components/HomeHero";
import UpdateStatus from "~/components/update-status";

type AlbumSummary = { id: number; name: string; images: string[] };

const NEWEST_SLIDES = 5;
const RANDOM_SLIDES = 4;
const ALBUM_SLIDES = 2;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FrameTV Art Gallery" },
    { name: "description", content: "Start dashboard for FrameTV Art Gallery" },
  ];
}

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** "starry_night-2.jpg" -> "starry night 2" for images that never had a title of their own. */
function readableName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || filename;
}

function describe(filename: string, details: Record<string, ImageProvenance>) {
  const known = details[filename];
  return {
    title: known?.title || readableName(filename),
    subtitle: known?.artist || (known && known.source_label !== "Uploaded" ? known.source_label : ""),
  };
}

function buildSlides(images: string[], albums: AlbumSummary[], details: Record<string, ImageProvenance>): HeroSlide[] {
  const slides: HeroSlide[] = [];
  const used = new Set<string>();

  // Newest first: /api/images already sorts that way.
  for (const filename of images.slice(0, NEWEST_SLIDES)) {
    used.add(filename);
    slides.push({
      key: `latest:${filename}`,
      topic: "Latest added",
      filename,
      ...describe(filename, details),
      to: "/gallery",
      action: "Open gallery",
    });
  }

  for (const filename of shuffled(images.filter((f) => !used.has(f))).slice(0, RANDOM_SLIDES)) {
    used.add(filename);
    slides.push({
      key: `random:${filename}`,
      topic: "Random picks",
      filename,
      ...describe(filename, details),
      to: "/gallery",
      action: "Open gallery",
    });
  }

  for (const album of shuffled(albums.filter((a) => a.images.length > 0)).slice(0, ALBUM_SLIDES)) {
    const cover = shuffled(album.images)[0];
    slides.push({
      key: `album:${album.id}`,
      topic: "From your albums",
      filename: cover,
      title: album.name,
      subtitle: `Album · ${album.images.length} image${album.images.length === 1 ? "" : "s"}`,
      to: `/album/${album.id}`,
      action: "Open album",
    });
  }

  return slides;
}

// --- Stat cards ----------------------------------------------------------------------------

/** A few real pictures from the library, fanned like a small stack of prints. */
function PrintStack({ filenames }: { filenames: string[] }) {
  const tilt = ["-rotate-6 -translate-x-3", "rotate-0 z-10", "rotate-6 translate-x-3"];
  const shown = filenames.slice(0, 3);
  if (shown.length === 0) return <FrameGlyph />;
  return (
    <div className="relative flex h-20 w-28 items-center justify-center" aria-hidden="true">
      {shown.map((name, i) => (
        <img
          key={name}
          src={getUploadUrl(name, 160)}
          alt=""
          draggable={false}
          className={`absolute h-14 w-20 rounded-md border-2 border-white object-cover shadow-md dark:border-neutral-800 ${tilt[(i + (3 - shown.length)) % 3]}`}
        />
      ))}
    </div>
  );
}

/** Stands in for a missing picture: a clean line drawing of a frame. */
function FrameGlyph() {
  return (
    <svg viewBox="0 0 112 80" className="h-20 w-28 text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="14" y="10" width="84" height="60" rx="5" />
      <rect x="24" y="20" width="64" height="40" rx="2" opacity="0.5" />
      <path d="M30 54l14-14 10 10 8-8 14 12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="68" cy="31" r="4" />
    </svg>
  );
}

/** Album covers: the first picture from up to three albums, fanned out. */
function AlbumFan({ albums }: { albums: AlbumSummary[] }) {
  const covers = albums.filter((a) => a.images.length > 0).slice(0, 3);
  if (covers.length === 0) {
    return (
      <svg viewBox="0 0 112 80" className="h-20 w-28 text-muted-foreground/60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 22a5 5 0 0 1 5-5h22l8 9h44a5 5 0 0 1 5 5v31a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z" strokeLinejoin="round" />
        <path d="M14 36h84" opacity="0.5" />
      </svg>
    );
  }
  const place = ["-translate-x-8 -rotate-6", "z-10", "translate-x-8 rotate-6"];
  return (
    <div className="relative flex h-20 w-28 items-center justify-center" aria-hidden="true">
      {covers.map((album, i) => (
        <div
          key={album.id}
          className={`absolute h-16 w-14 overflow-hidden rounded-lg border-2 border-white shadow-md dark:border-neutral-800 ${place[(i + (3 - covers.length)) % 3]}`}
        >
          <img src={getUploadUrl(album.images[0], 160)} alt="" draggable={false} className="size-full object-cover" />
        </div>
      ))}
    </div>
  );
}

/** Additions per month for the last few months, the current one emphasised. */
function MonthBars({ months }: { months: MonthlyCount[] }) {
  const most = Math.max(1, ...months.map((m) => m.count));
  const width = 112;
  const height = 80;
  const gap = 6;
  const bar = (width - gap * (months.length - 1)) / Math.max(1, months.length);
  const label = months.map((m) => `${m.month}: ${m.count}`).join(", ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-28" role="img" aria-label={`Images added per month. ${label}`}>
      <line x1="0" x2={width} y1={height - 10.5} y2={height - 10.5} className="stroke-border" strokeWidth="1" />
      {months.map((m, i) => {
        const h = Math.max(3, (m.count / most) * (height - 24));
        const current = i === months.length - 1;
        return (
          <rect
            key={m.month}
            x={i * (bar + gap)}
            y={height - 11 - h}
            width={bar}
            height={h}
            rx="3"
            className={current ? "fill-emerald-500" : "fill-emerald-500/30"}
          />
        );
      })}
    </svg>
  );
}

function StatCard({
  label,
  value,
  note,
  visual,
  tint,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  visual: React.ReactNode;
  /** Tailwind classes for the soft gradient wash behind the card */
  tint: string;
}) {
  return (
    <div className={`relative flex min-h-36 flex-1 items-center justify-between gap-4 overflow-hidden rounded-2xl border border-border p-5 ${tint}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="shrink-0">{visual}</div>
    </div>
  );
}

export default function Home() {
  const [images, setImages] = useState<string[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [details, setDetails] = useState<Record<string, ImageProvenance>>({});
  const [months, setMonths] = useState<MonthlyCount[]>([]);
  const [loading, setLoading] = useState(true);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    setLoading(true);
    // The details and the monthly counts only decorate the page; it still works without them.
    Promise.all([
      fetchImages(),
      fetchAlbums(),
      fetchImageDetails().catch(() => ({}) as Record<string, ImageProvenance>),
      fetchImagesAddedByMonth(6).catch(() => [] as MonthlyCount[]),
    ])
      .then(([imgs, albms, detail, byMonth]) => {
        setImages(imgs || []);
        setAlbums(albms || []);
        setDetails(detail);
        setMonths(byMonth);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Shuffled once per visit, not on every render.
  const slides = useMemo(() => (loading ? null : buildSlides(images, albums, details)), [loading, images, albums, details]);

  const thisMonth = months.length > 0 ? months[months.length - 1].count : 0;
  const lastMonth = months.length > 1 ? months[months.length - 2].count : 0;
  const monthNote =
    thisMonth === lastMonth
      ? `Same as last month (${lastMonth})`
      : `${thisMonth > lastMonth ? "Up" : "Down"} ${Math.abs(thisMonth - lastMonth)} from last month (${lastMonth})`;
  const filled = albums.filter((a) => a.images.length > 0).length;

  return (
    <div className="relative mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8 lg:p-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{greeting()}</h1>
        <UpdateStatus />
      </div>

      {!loading && images.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No images yet. Upload some art, or find some in Discover.
        </div>
      ) : (
        <HomeHero slides={slides} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Total images"
          value={loading ? "-" : images.length.toString()}
          note={loading ? "Loading..." : `${images.length === 1 ? "Picture" : "Pictures"} in your library`}
          visual={<PrintStack filenames={images} />}
          tint="bg-gradient-to-br from-sky-500/10 via-transparent to-transparent"
        />
        <StatCard
          label="Total albums"
          value={loading ? "-" : albums.length.toString()}
          note={loading ? "Loading..." : albums.length === 0 ? "None yet" : `${filled} with pictures in`}
          visual={<AlbumFan albums={albums} />}
          tint="bg-gradient-to-br from-violet-500/10 via-transparent to-transparent"
        />
        <StatCard
          label="Added this month"
          value={loading ? "-" : thisMonth.toString()}
          note={loading ? "Loading..." : monthNote}
          visual={<MonthBars months={months} />}
          tint="bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent"
        />
      </div>
    </div>
  );
}
