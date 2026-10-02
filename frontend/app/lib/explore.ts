/** The topics offered under the search bar on Discover. */
export type ExploreTile = {
  id: string;
  label: string;
  blurb: string;
  /** What to search for. */
  query: string;
  /** Search one source instead of all of them, where a topic really lives in one place. */
  scope?: string;
  emoji: string;
  /** Tailwind classes for the gradient; dark enough for white text. */
  gradient: string;
};

const TOPICS: ExploreTile[] = [
  {
    id: "landscape",
    label: "Landscapes",
    blurb: "Fields, valleys and open sky",
    query: "landscape",
    emoji: "🏞️",
    gradient: "from-emerald-600 to-teal-800",
  },
  {
    id: "seascape",
    label: "Seascapes",
    blurb: "Harbors, waves and coastlines",
    query: "seascape",
    emoji: "🌊",
    gradient: "from-sky-600 to-blue-800",
  },
  {
    id: "flowers",
    label: "Flowers",
    blurb: "Gardens and still life blooms",
    query: "flowers",
    emoji: "🌸",
    gradient: "from-pink-600 to-rose-800",
  },
  {
    id: "mountains",
    label: "Mountains",
    blurb: "Peaks, alpine light and mist",
    query: "mountains",
    emoji: "🏔️",
    gradient: "from-slate-600 to-indigo-900",
  },
  {
    id: "space",
    label: "Space",
    blurb: "Nebulae and planets, from NASA",
    query: "nebula",
    scope: "nasa",
    emoji: "🪐",
    gradient: "from-violet-700 to-indigo-950",
  },
  {
    id: "posters",
    label: "Vintage posters",
    blurb: "Retro travel and advertising art",
    query: "travel",
    scope: "posters",
    emoji: "🚂",
    gradient: "from-orange-600 to-red-800",
  },
  {
    id: "impressionism",
    label: "Impressionism",
    blurb: "Soft light, loose brushwork",
    query: "Impressionism",
    emoji: "🎨",
    gradient: "from-amber-600 to-orange-800",
  },
  {
    id: "japan",
    label: "Japanese prints",
    blurb: "Woodblock waves and mountains",
    query: "Hokusai",
    emoji: "🏯",
    gradient: "from-red-600 to-rose-900",
  },
  {
    id: "animals",
    label: "Animals",
    blurb: "Birds, horses and company",
    query: "animals",
    emoji: "🦊",
    gradient: "from-yellow-600 to-amber-800",
  },
  {
    id: "city",
    label: "Cityscapes",
    blurb: "Streets, bridges and lamplight",
    query: "city street",
    emoji: "🌆",
    gradient: "from-fuchsia-600 to-purple-900",
  },
];

/**
 * How each season the server can name is shown. The server picks which one it is (it works
 * out Easter and Thanksgiving for the year); the holiday postcards source answers all of them.
 */
const SEASONS: Record<string, Omit<ExploreTile, "id">> = {
  winter: season("Winter", "Snow, frost and quiet light", "winter", "❄️", "from-cyan-600 to-sky-900"),
  valentine: season("Valentine’s Day", "Hearts, roses and vintage valentines", "valentine", "💘", "from-rose-500 to-pink-900"),
  easter: season("Easter", "Spring, blossom and vintage cards", "easter", "🐣", "from-lime-600 to-emerald-800"),
  spring: season("Spring", "Blossom, orchards and new green", "spring", "🌷", "from-lime-600 to-green-800"),
  summer: season("Summer", "Beaches, meadows and long days", "summer", "☀️", "from-yellow-500 to-orange-700"),
  autumn: season("Autumn", "Harvest colours and falling leaves", "autumn", "🍂", "from-orange-600 to-amber-900"),
  halloween: season("Halloween", "Spooky art and vintage postcards", "halloween", "🎃", "from-orange-500 to-purple-900"),
  thanksgiving: season("Thanksgiving", "Harvest scenes and vintage cards", "thanksgiving", "🦃", "from-amber-600 to-red-900"),
  christmas: season("Christmas", "Winter scenes and vintage cards", "christmas", "🎄", "from-red-600 to-green-900"),
};

function season(label: string, blurb: string, query: string, emoji: string, gradient: string) {
  return { label, blurb, query, emoji, gradient };
}

/** Every tile to show, the seasonal one first. Tiles for a source that is not running are left out. */
export function exploreTiles(sourceIds: string[], currentSeason: string): ExploreTile[] {
  const has = (tile: ExploreTile) => !tile.scope || sourceIds.includes(tile.scope);
  const lead = SEASONS[currentSeason];
  return [...(lead ? [{ id: "season", ...lead }] : []), ...TOPICS].filter(has);
}
