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

const SLUG_TO_ACCENT: Record<CategorySlug, string> = {
  tech: "#00d4ff",
  design: "#ff6b9d",
  business: "#ffd700",
  creative: "#9b59b6",
  gaming: "#00ff88",
  science: "#ff8c00",
};

/**
 * Parse a URL path segment into a CategorySlug.
 * Returns null for invalid/unrecognized values (triggers 404 in page).
 */
export function parseCategory(slug: string): CategorySlug | null {
  const normalized = slug.toLowerCase() as CategorySlug;
  if (normalized in SLUG_TO_LABEL) return normalized;
  return null;
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
  return SLUG_TO_ACCENT[slug] ?? "#00d4ff";
}

/**
 * Get the display label for a category slug.
 */
export function getCategoryLabel(slug: CategorySlug): CategoryLabel {
  return SLUG_TO_LABEL[slug];
}
