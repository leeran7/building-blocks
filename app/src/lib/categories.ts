/**
 * Single source of truth for Tower categories.
 *
 * Previously the category list (slug, label, accent) was duplicated across
 * CategoryTabBar, CategoryGrid, the /tower/[category] page, and the dashboard.
 * That drift is why the tower chrome was hardcoded to cyan regardless of
 * category. Everything now reads from here.
 *
 * Accent colors are chosen to pass WCAG 2.1 AA (>= 4.5:1) as TEXT on the void
 * background (#0a0a0f). Bright colors on near-black are high-contrast — the old
 * "decorative only" annotations were computed against white and were incorrect.
 * `creative` was brightened from #9b59b6 (4.2:1) to #b07cd6 (~5:1) so it is
 * safe as text; all others already pass comfortably.
 *
 * `rgb` is the space-separated form consumed by `rgb(var(--accent-rgb) / <a>)`
 * in tailwind.config.ts, which is what makes `text-accent`, `bg-accent/10`,
 * `border-accent/40`, etc. resolve to the active tower's color.
 */

import type { CSSProperties } from "react";

export interface Category {
  slug: string;
  label: string;
  /** Canonical accent hex — safe as text on the void background. */
  hex: string;
  /** Space-separated RGB channels for `rgb(var(--accent-rgb) / <alpha>)`. */
  rgb: string;
  /** One-line description used on the landing category grid. */
  blurb: string;
}

// ASCENT-harmonized wayfinding hues — AA-legible on warm obsidian. Only one
// category shows at a time (dot + chart line), so these read as functional
// wayfinding, never a rainbow. Brand chrome stays signal-lime; tech is the
// flagship and owns the signal hue.
export const CATEGORIES: Category[] = [
  { slug: "tech", label: "Tech", hex: "#cbf24d", rgb: "203 242 77", blurb: "Tools, apps, and infrastructure." },
  { slug: "design", label: "Design", hex: "#ff8da3", rgb: "255 141 163", blurb: "Portfolios, products, and studios." },
  { slug: "business", label: "Business", hex: "#f2c14e", rgb: "242 193 78", blurb: "Startups, stores, and services." },
  { slug: "creative", label: "Creative", hex: "#c39bff", rgb: "195 155 255", blurb: "Art, writing, music, and film." },
  { slug: "gaming", label: "Gaming", hex: "#5be0b0", rgb: "91 224 176", blurb: "Games, servers, and streamers." },
  { slug: "science", label: "Science", hex: "#6bb8ff", rgb: "107 184 255", blurb: "Research, labs, and open data." },
];

export const CATEGORY_BY_SLUG: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c])
);

/**
 * The curated six are "featured" (they seed the landing grid and have hand-
 * picked colors), but the system is designed so categories are theoretically
 * infinite: any slug that isn't curated gets a deterministic accent + label so
 * it themes correctly everywhere. Adding a new category is then just a matter of
 * the data layer accepting it — the UI needs no changes.
 */
export const FEATURED_CATEGORIES = CATEGORIES;

/** Deterministic hash → hue, so a given slug always gets the same color. */
function hashHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) % 360;
  }
  return h;
}

function hslToRgbString(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255);
  return `${to(r1)} ${to(g1)} ${to(b1)}`;
}

function rgbToHex(rgb: string): string {
  return (
    "#" +
    rgb
      .split(" ")
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Synthesize a themed Category for any slug not in the curated set. Lightness is
 * held high (65%) so the derived accent stays >= 4.5:1 as text on the void bg.
 */
export function deriveCategory(slug: string): Category {
  const key = slug.toLowerCase();
  // Bright, saturated hue that reads as text/accent on the dark canvas.
  const rgb = hslToRgbString(hashHue(key), 0.72, 0.65);
  return {
    slug: key,
    label: titleCase(key),
    hex: rgbToHex(rgb),
    rgb,
    blurb: `The ${titleCase(key)} leaderboard.`,
  };
}

/**
 * Resolve any slug or display label (e.g. "TECH", "Tech", "tech", "web3") to a
 * themed Category — curated when known, deterministically synthesized otherwise.
 * Never returns undefined, so the UI can theme arbitrary categories.
 */
export function getCategory(value: string | null | undefined): Category {
  if (!value) return CATEGORIES[0];
  const key = value.toLowerCase();
  return CATEGORY_BY_SLUG[key] ?? deriveCategory(key);
}

/** Accepts a slug or a display label; undefined only for unknown + no-fallback. */
export function resolveCategory(value: string | null | undefined): Category | undefined {
  if (!value) return undefined;
  return CATEGORY_BY_SLUG[value.toLowerCase()];
}

/**
 * Cyan is the app's single accent, so this intentionally does NOT override
 * --accent-rgb — every tower's accent stays cyan. Category identity is conveyed
 * by the small dot + label only. Kept as a themed seam: to re-enable per-tower
 * accents, return `{ "--accent-rgb": (category ?? CATEGORIES[0]).rgb }`.
 */
export function categoryTheme(_category: Category | undefined): CSSProperties {
  return {} as CSSProperties;
}
