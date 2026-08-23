/**
 * URL-safe slug generation from display name.
 */

/**
 * Generate a URL-safe slug from a display name.
 * Falls back to a random suffix if the name produces an empty slug.
 */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens

  if (!base) {
    // Fallback: random slug
    return "block-" + Math.random().toString(36).slice(2, 8);
  }

  // Truncate to 60 chars
  return base.slice(0, 60);
}

/**
 * Generate a unique slug by appending a random suffix.
 * Used when the base slug already exists in the DB.
 */
export function uniqueSlug(name: string): string {
  const base = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base.slice(0, 55)}-${suffix}`;
}
