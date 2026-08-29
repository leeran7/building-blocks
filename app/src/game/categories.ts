/**
 * Tower v3 "The Climb" — data-driven category taxonomy (74 towers).
 *
 * spec-next.md "Category Taxonomy": categories are DATA, not a Postgres enum, so
 * new towers ship without a migration (AC-19). This module is the seed dataset;
 * at runtime it is loaded into a `Category` table. Each row maps a category to a
 * themed climb track (archetype + palette + hazard types + music) and a
 * per-category leaderboard.
 *
 * Unknown / non-seeded slugs fall back to a deterministic accent + label exactly
 * like v2's deriveCategory (AC-21), keeping the taxonomy open-ended.
 */

export type Family =
  | "Tech & Software"
  | "Design & Creative Tools"
  | "Business & Work"
  | "Media & Arts"
  | "Gaming & Interactive"
  | "Science & Research"
  | "Life & Community";

/** Reusable track archetypes — categories skin these, not bespoke geometry (R-7). */
export type TrackArchetype =
  | "ladder-climb"
  | "platform-gauntlet"
  | "crumble-stairs"
  | "wall-jump-chimney";

export type RisingHazardType = "lava" | "flood" | "collapse";
export type FallingHazardType = "barrel" | "rock" | "debris";

export interface GameCategory {
  slug: string;
  label: string;
  family: Family;
  themeArchetype: TrackArchetype;
  risingHazardType: RisingHazardType;
  fallingHazardType: FallingHazardType;
  music: string;
}

/** Deterministic assignment of theme fields from a slug — keeps the seed terse
 *  and guarantees the same slug always themes identically (portable, no RNG). */
function hash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

const ARCHETYPES: TrackArchetype[] = [
  "ladder-climb",
  "platform-gauntlet",
  "crumble-stairs",
  "wall-jump-chimney",
];
const RISING: RisingHazardType[] = ["lava", "flood", "collapse"];
const FALLING: FallingHazardType[] = ["barrel", "rock", "debris"];

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build a themed category row deterministically from slug + family. */
function make(slug: string, label: string, family: Family): GameCategory {
  const h = hash(slug);
  return {
    slug,
    label,
    family,
    // Unsigned shifts: `h` (a >>>0 hash) can exceed 2^31, so a signed `>>`
    // would yield a negative index → undefined. `>>>` keeps it non-negative.
    themeArchetype: ARCHETYPES[h % ARCHETYPES.length],
    risingHazardType: RISING[(h >>> 2) % RISING.length],
    fallingHazardType: FALLING[(h >>> 4) % FALLING.length],
    music: `${slug}-theme`,
  };
}

/** The full 74-category seed, grouped by family (spec Category Taxonomy). */
const RAW: Record<Family, string[]> = {
  "Tech & Software": [
    "AI & ML Tools", "Developer Tools", "Cybersecurity", "DevOps & Infrastructure",
    "Web3 & Crypto", "Fintech", "No-Code & Automation", "APIs & Integrations",
    "Databases", "Cloud & Hosting", "Data & Analytics", "Hardware & IoT",
    "Browser Extensions", "Open Source",
  ],
  "Design & Creative Tools": [
    "UI/UX Design", "Product Design", "Branding & Identity", "Illustration",
    "Motion & Animation", "3D & Rendering", "Typography", "Design Systems",
  ],
  "Business & Work": [
    "Startups", "E-commerce & Stores", "Marketing & Growth", "Sales & CRM",
    "Productivity", "Finance & Investing", "Real Estate", "HR & Recruiting",
    "Legal Tech", "Newsletters", "Agencies & Studios", "Customer Support",
  ],
  "Media & Arts": [
    "Writing & Blogging", "Music Production", "Film & Video", "Photography",
    "Podcasts", "Digital Art", "Comics & Webtoons", "Fashion",
    "Crafts & DIY", "Animation Studios",
  ],
  "Gaming & Interactive": [
    "Indie Games", "Mobile Games", "Game Servers", "Esports Teams",
    "Streamers & Creators", "Game Mods", "Tabletop & TTRPG", "VR & AR Games",
    "Speedrunning", "Game Jams",
  ],
  "Science & Research": [
    "Biotech & Genomics", "Space & Astronomy", "Climate & Energy", "Neuroscience",
    "Robotics", "Chemistry & Materials", "Open Data", "Academic Research",
    "Health & Medicine", "Mathematics",
  ],
  "Life & Community": [
    "Food & Cooking", "Fitness & Wellness", "Travel", "Education & Courses",
    "Nonprofits & Causes", "Online Communities", "Pets & Animals", "Home & Garden",
    "Sports & Outdoors", "Books & Reading",
  ],
};

/** Slugify a display label the way the seed + routes expect. */
export function slugifyCategory(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const GAME_CATEGORIES: GameCategory[] = Object.entries(RAW).flatMap(
  ([family, labels]) =>
    labels.map((label) => make(slugifyCategory(label), label, family as Family))
);

export const GAME_CATEGORY_BY_SLUG: Record<string, GameCategory> =
  Object.fromEntries(GAME_CATEGORIES.map((c) => [c.slug, c]));

/** Own-property allowlist — never `in` (prototype keys would pass). */
const GAME_CATEGORY_SLUGS = new Set(GAME_CATEGORIES.map((c) => c.slug));

export const FAMILIES: Family[] = Object.keys(RAW) as Family[];

/** True if a slug is one of the known subcategories (the only things that get towers). */
export function isGameCategory(slug: string): boolean {
  return GAME_CATEGORY_SLUGS.has(slug.toLowerCase());
}

/**
 * Resolve any slug to a themed category. Seeded slugs return their curated row;
 * unknown slugs are synthesized deterministically (AC-21) so arbitrary towers
 * still theme and play — the taxonomy is open-ended.
 *
 * Look up via the Set, not `obj[key] ??` — a prototype key like "constructor"
 * is truthy on a normal Record and would skip the synthesizer.
 */
export function resolveGameCategory(slug: string): GameCategory {
  const key = slug.toLowerCase();
  if (GAME_CATEGORY_SLUGS.has(key)) return GAME_CATEGORY_BY_SLUG[key];
  return make(key, titleFromSlug(key), "Gaming & Interactive");
}

/**
 * Default paid stack when a flow has no valid category. MUST be a curated
 * subcategory — never a legacy broad slug like "tech", which has no /stack
 * page and would swallow a payment into an invisible season.
 */
export const DEFAULT_STACK_SLUG = GAME_CATEGORIES[0].slug;

/** A paid-stack slug, or null if the value is missing / not a real stack. */
export function parsePaidStackSlug(
  raw: string | undefined | null
): string | null {
  if (!raw) return null;
  const slug = raw.toLowerCase();
  return isGameCategory(slug) ? slug : null;
}

/**
 * Shape-valid season slug, including leftover legacy rows like "tech".
 * Use parsePaidStackSlug for new money; this only gates format so an
 * existing block can still credit the season it already lives in.
 */
const SEASON_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OBJECT_PROTO_KEYS = new Set(
  Object.getOwnPropertyNames(Object.prototype).map((k) => k.toLowerCase())
);
OBJECT_PROTO_KEYS.add("__proto__");

export function parseSeasonSlug(
  raw: string | undefined | null
): string | null {
  if (!raw) return null;
  const slug = raw.toLowerCase();
  if (!SEASON_SLUG_RE.test(slug) || OBJECT_PROTO_KEYS.has(slug)) return null;
  return slug;
}

/** One representative subcategory per family — used for the landing "featured" grid. */
export const FEATURED_GAME_CATEGORIES: GameCategory[] = FAMILIES.map(
  (f) => GAME_CATEGORIES.find((c) => c.family === f) as GameCategory
);

