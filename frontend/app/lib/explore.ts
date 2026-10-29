import {
  Bird,
  Buildings,
  Egg,
  Fish,
  FlowerLotus,
  FlowerTulip,
  ForkKnife,
  Ghost,
  Heart,
  Leaf,
  Mountains,
  Palette,
  Park,
  Planet,
  Smiley,
  Sparkle,
  Snowflake,
  Sun,
  Train,
  TreeEvergreen,
  Waves,
  type Icon,
} from "@phosphor-icons/react";

/** The topics offered under the search bar on Discover. */
export type ExploreTile = {
  id: string;
  label: string;
  blurb: string;
  /** What to search for, and what the search box shows. */
  query: string;
  /**
   * More words for the same theme. A theme is broader than one word (a seascape is often
   * titled "harbor" or "fishing boats"), so sources that can take several words get these too.
   * One word each: Commons would read a two-word term as two required words.
   */
  terms?: string[];
  /** Search one source instead of all of them, where a topic really lives in one place. */
  scope?: string;
  /** A duotone line icon, drawn in the chip's own text colour so it takes the gradient's mood. */
  icon: Icon;
  /** Tailwind classes for the gradient: muted earth tones from the brand palette, dark enough for white text. */
  gradient: string;
};

const TOPICS: ExploreTile[] = [
  {
    id: "landscape",
    label: "Landscapes",
    blurb: "Fields, valleys and open sky",
    query: "landscape",
    terms: ["countryside", "valley", "meadow", "fields", "hills"],
    icon: Park,
    gradient: "from-[#7A9573] to-[#44624D]",
  },
  {
    id: "seascape",
    label: "Seascapes",
    blurb: "Harbors, waves and coastlines",
    query: "seascape",
    terms: ["harbor", "waves", "coast", "beach", "ships"],
    icon: Waves,
    gradient: "from-[#6C8CAA] to-[#3A5573]",
  },
  {
    id: "flowers",
    label: "Flowers",
    blurb: "Gardens and still life blooms",
    query: "flowers",
    terms: ["bouquet", "roses", "blossom", "lilies", "peonies"],
    icon: FlowerLotus,
    gradient: "from-[#BB7080] to-[#76404F]",
  },
  {
    id: "mountains",
    label: "Mountains",
    blurb: "Peaks, alpine light and mist",
    query: "mountains",
    terms: ["alps", "peaks", "glacier", "alpine"],
    icon: Mountains,
    gradient: "from-[#6F788C] to-[#3D4457]",
  },
  {
    id: "space",
    label: "Space",
    blurb: "Nebulae and planets, from NASA",
    query: "nebula",
    scope: "nasa",
    icon: Planet,
    gradient: "from-[#66537F] to-[#2F2A45]",
  },
  {
    id: "posters",
    label: "Vintage posters",
    blurb: "Retro travel and advertising art",
    query: "travel",
    scope: "posters",
    icon: Train,
    gradient: "from-[#BC6A51] to-[#7C3F36]",
  },
  {
    id: "popart",
    label: "Pop & digital art",
    blurb: "Bold colour, neon and contemporary work",
    query: "pop art",
    scope: "popart",
    icon: Sparkle,
    gradient: "from-[#B4607E] to-[#5E3A6B]",
  },
  {
    id: "cute",
    label: "Cute illustration",
    blurb: "Playful animals, characters and patterns",
    query: "cute",
    scope: "illustrations",
    icon: Smiley,
    gradient: "from-[#C68A6A] to-[#8A5A55]",
  },
  {
    id: "impressionism",
    label: "Impressionism",
    blurb: "Soft light, loose brushwork",
    query: "Impressionism",
    terms: ["Monet", "Renoir", "Pissarro", "Sisley", "Morisot"],
    icon: Palette,
    gradient: "from-[#B98A38] to-[#7B5522]",
  },
  {
    id: "japan",
    label: "Japanese prints",
    blurb: "Woodblock waves and mountains",
    query: "Hokusai",
    terms: ["Hiroshige", "Kuniyoshi", "Utamaro", "woodblock"],
    icon: Fish,
    gradient: "from-[#A5524B] to-[#5E2C30]",
  },
  {
    id: "animals",
    label: "Animals",
    blurb: "Birds, horses and company",
    query: "animals",
    terms: ["birds", "horse", "dog", "cat", "deer"],
    icon: Bird,
    gradient: "from-[#91914F] to-[#57603A]",
  },
  {
    id: "city",
    label: "Cityscapes",
    blurb: "Streets, bridges and lamplight",
    query: "city street",
    terms: ["cityscape", "street", "bridge", "boulevard", "skyline"],
    icon: Buildings,
    gradient: "from-[#5F8A8C] to-[#33555B]",
  },
];

/**
 * How each season the server can name is shown. The server picks which one it is (it works
 * out Easter and Thanksgiving for the year); the holiday postcards source answers all of them.
 */
const SEASONS: Record<string, Omit<ExploreTile, "id">> = {
  winter: season("Winter", "Snow, frost and quiet light", "winter", Snowflake, "from-[#7592A8] to-[#3F586D]", ["snow", "frost", "skating", "sleigh"]),
  valentine: season("Valentine’s Day", "Hearts, roses and vintage valentines", "valentine", Heart, "from-[#C0707F] to-[#78404F]", ["hearts", "cupid", "roses"]),
  easter: season("Easter", "Spring, blossom and vintage cards", "easter", Egg, "from-[#8FA06D] to-[#51684A]", ["eggs", "rabbit", "lilies"]),
  spring: season("Spring", "Blossom, orchards and new green", "spring", FlowerTulip, "from-[#7FA070] to-[#466A4C]", ["blossom", "orchard", "tulips"]),
  summer: season("Summer", "Beaches, meadows and long days", "summer", Sun, "from-[#C69A3E] to-[#8A5A26]", ["beach", "meadow", "sunshine", "bathers"]),
  autumn: season("Autumn", "Harvest colours and falling leaves", "autumn", Leaf, "from-[#B96F3F] to-[#74402A]", ["harvest", "leaves", "foliage"]),
  halloween: season("Halloween", "Spooky art and vintage postcards", "halloween", Ghost, "from-[#C37B3D] to-[#53385A]", ["pumpkin", "witch", "skeleton", "ghost"]),
  thanksgiving: season("Thanksgiving", "Harvest scenes and vintage cards", "thanksgiving", ForkKnife, "from-[#AC7C2E] to-[#7A3F36]", ["harvest", "turkey", "pumpkin"]),
  christmas: season("Christmas", "Winter scenes and vintage cards", "christmas", TreeEvergreen, "from-[#A5524B] to-[#44624D]", ["nativity", "santa", "mistletoe"]),
};

function season(label: string, blurb: string, query: string, icon: Icon, gradient: string, terms: string[]) {
  return { label, blurb, query, icon, gradient, terms };
}

/** A theme's extra words, for a search that came from a tile or chip showing `query`. */
export function themeTerms(query: string): string[] | undefined {
  const wanted = query.trim().toLowerCase();
  return [...TOPICS, ...Object.values(SEASONS)].find((tile) => tile.query.toLowerCase() === wanted)?.terms;
}

/** Every tile to show, the seasonal one first. Tiles for a source that is not running are left out. */
export function exploreTiles(sourceIds: string[], currentSeason: string): ExploreTile[] {
  const has = (tile: ExploreTile) => !tile.scope || sourceIds.includes(tile.scope);
  const lead = SEASONS[currentSeason];
  return [...(lead ? [{ id: "season", ...lead }] : []), ...TOPICS].filter(has);
}
