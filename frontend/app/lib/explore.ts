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
  /** Tailwind classes for the gradient: muted earth tones from the brand palette, dark enough for white text. */
  gradient: string;
};

const TOPICS: ExploreTile[] = [
  {
    id: "landscape",
    label: "Landscapes",
    blurb: "Fields, valleys and open sky",
    query: "landscape",
    emoji: "🏞️",
    gradient: "from-[#7A9573] to-[#44624D]",
  },
  {
    id: "seascape",
    label: "Seascapes",
    blurb: "Harbors, waves and coastlines",
    query: "seascape",
    emoji: "🌊",
    gradient: "from-[#6C8CAA] to-[#3A5573]",
  },
  {
    id: "flowers",
    label: "Flowers",
    blurb: "Gardens and still life blooms",
    query: "flowers",
    emoji: "🌸",
    gradient: "from-[#BB7080] to-[#76404F]",
  },
  {
    id: "mountains",
    label: "Mountains",
    blurb: "Peaks, alpine light and mist",
    query: "mountains",
    emoji: "🏔️",
    gradient: "from-[#6F788C] to-[#3D4457]",
  },
  {
    id: "space",
    label: "Space",
    blurb: "Nebulae and planets, from NASA",
    query: "nebula",
    scope: "nasa",
    emoji: "🪐",
    gradient: "from-[#66537F] to-[#2F2A45]",
  },
  {
    id: "posters",
    label: "Vintage posters",
    blurb: "Retro travel and advertising art",
    query: "travel",
    scope: "posters",
    emoji: "🚂",
    gradient: "from-[#BC6A51] to-[#7C3F36]",
  },
  {
    id: "impressionism",
    label: "Impressionism",
    blurb: "Soft light, loose brushwork",
    query: "Impressionism",
    emoji: "🎨",
    gradient: "from-[#B98A38] to-[#7B5522]",
  },
  {
    id: "japan",
    label: "Japanese prints",
    blurb: "Woodblock waves and mountains",
    query: "Hokusai",
    emoji: "🏯",
    gradient: "from-[#A5524B] to-[#5E2C30]",
  },
  {
    id: "animals",
    label: "Animals",
    blurb: "Birds, horses and company",
    query: "animals",
    emoji: "🦊",
    gradient: "from-[#91914F] to-[#57603A]",
  },
  {
    id: "city",
    label: "Cityscapes",
    blurb: "Streets, bridges and lamplight",
    query: "city street",
    emoji: "🌆",
    gradient: "from-[#5F8A8C] to-[#33555B]",
  },
];

/**
 * How each season the server can name is shown. The server picks which one it is (it works
 * out Easter and Thanksgiving for the year); the holiday postcards source answers all of them.
 */
const SEASONS: Record<string, Omit<ExploreTile, "id">> = {
  winter: season("Winter", "Snow, frost and quiet light", "winter", "❄️", "from-[#7592A8] to-[#3F586D]"),
  valentine: season("Valentine’s Day", "Hearts, roses and vintage valentines", "valentine", "💘", "from-[#C0707F] to-[#78404F]"),
  easter: season("Easter", "Spring, blossom and vintage cards", "easter", "🐣", "from-[#8FA06D] to-[#51684A]"),
  spring: season("Spring", "Blossom, orchards and new green", "spring", "🌷", "from-[#7FA070] to-[#466A4C]"),
  summer: season("Summer", "Beaches, meadows and long days", "summer", "☀️", "from-[#C69A3E] to-[#8A5A26]"),
  autumn: season("Autumn", "Harvest colours and falling leaves", "autumn", "🍂", "from-[#B96F3F] to-[#74402A]"),
  halloween: season("Halloween", "Spooky art and vintage postcards", "halloween", "🎃", "from-[#C37B3D] to-[#53385A]"),
  thanksgiving: season("Thanksgiving", "Harvest scenes and vintage cards", "thanksgiving", "🦃", "from-[#AC7C2E] to-[#7A3F36]"),
  christmas: season("Christmas", "Winter scenes and vintage cards", "christmas", "🎄", "from-[#A5524B] to-[#44624D]"),
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
