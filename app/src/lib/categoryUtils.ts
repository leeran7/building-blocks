/**
 * categoryUtils — Category parsing and accent color utilities.
 *
 * Architecture doc §4.6: parseCategory, categoryToSlug, getCategoryAccent.
 * Used by: API routes (backend), CategoryTabBar, category tower page (frontend).
 */

export type CategorySlug =
  | "tech"
  | "design"
  | "business"
  | "creative"
  | "gaming"
  | "science";

export type CategoryLabel =
  | "Tech"
  | "Design"
  | "Business"
  | "Creative"
  | "Gaming"
  | "Science";

const SLUG_TO_LABEL: Record<CategorySlug, CategoryLabel> = {
  tech: "Tech",
  design: "Design",
  business: "Business",
  creative: "Creative",
  gaming: "Gaming",
  science: "Science",
};

// ASCENT-harmonized wayfinding hues (kept in sync with lib/categories.ts).
const SLUG_TO_ACCENT: Record<CategorySlug, string> = {
  tech: "#cbf24d",
  design: "#ff8da3",
  business: "#f2c14e",
  creative: "#c39bff",
  gaming: "#5be0b0",
  science: "#6bb8ff",
};

/**
 * Parse a URL path segment into a CategorySlug.
 * Returns null for invalid/unrecognized values (triggers 404 in page).
 */
export function parseCategory(slug: string): CategorySlug | null {
  const normalized = slug.toLowerCase();
  if (!Object.hasOwn(SLUG_TO_LABEL, normalized)) return null;
  return normalized as CategorySlug;
}

/**
 * Convert a Prisma Category enum value to its URL slug.
 */
export function categoryToSlug(cat: CategoryLabel): CategorySlug {
  return cat.toLowerCase() as CategorySlug;
}

/**
 * Get the hex accent color for a given category slug.
 * Used for dynamic CSS var injection on category pages.
 */
export function getCategoryAccent(cat: CategorySlug | CategoryLabel): string {
  const slug = cat.toLowerCase() as CategorySlug;
  return SLUG_TO_ACCENT[slug] ?? "#cbf24d";
}

/**
 * Get the display label for a category slug.
 */
export function getCategoryLabel(slug: CategorySlug): CategoryLabel {
  return SLUG_TO_LABEL[slug];
}
