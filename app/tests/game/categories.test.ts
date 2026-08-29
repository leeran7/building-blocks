/**
 * Tower v3 "The Climb" — category taxonomy tests.
 *
 * Covers:
 *   AC-19: data-driven set (a table's seed, not an enum) — adding a slug needs
 *          no migration; resolveGameCategory accepts any slug.
 *   AC-21: non-seeded slugs resolve to a deterministic themed category.
 *   AC-22: every category belongs to exactly one family; the full set is 74.
 */

import { describe, it, expect } from "vitest";
import {
  GAME_CATEGORIES,
  GAME_CATEGORY_BY_SLUG,
  FAMILIES,
  resolveGameCategory,
  slugifyCategory,
  isGameCategory,
  parseSeasonSlug,
} from "../../src/game/categories";

describe("AC-22: full taxonomy grouped by family", () => {
  it("seeds exactly 74 categories across 7 families", () => {
    expect(GAME_CATEGORIES.length).toBe(74);
    expect(FAMILIES.length).toBe(7);
  });

  it("assigns every category to exactly one known family", () => {
    for (const c of GAME_CATEGORIES) {
      expect(FAMILIES).toContain(c.family);
    }
    // No duplicate slugs (unique key — basis for AC-20 conflict rejection).
    const slugs = GAME_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives each category a themed archetype + hazards + music", () => {
    for (const c of GAME_CATEGORIES) {
      expect(c.themeArchetype).toBeTruthy();
      expect(c.risingHazardType).toBeTruthy();
      expect(c.fallingHazardType).toBeTruthy();
      expect(c.music).toContain(c.slug);
    }
  });
});

describe("AC-19 / AC-21: open-ended, data-driven resolution", () => {
  it("resolves a seeded slug to its curated row", () => {
    const indie = GAME_CATEGORY_BY_SLUG["indie-games"];
    expect(indie).toBeDefined();
    expect(resolveGameCategory("indie-games")).toEqual(indie);
  });

  it("synthesizes a deterministic category for an unknown slug", () => {
    const a = resolveGameCategory("quantum-basket-weaving");
    const b = resolveGameCategory("quantum-basket-weaving");
    expect(a).toEqual(b); // deterministic
    expect(a.label).toBe("Quantum Basket Weaving");
    expect(a.themeArchetype).toBeTruthy();
  });

  it("slugifies display labels consistently", () => {
    expect(slugifyCategory("AI & ML Tools")).toBe("ai-and-ml-tools");
    expect(slugifyCategory("UI/UX Design")).toBe("ui-ux-design");
    expect(slugifyCategory("E-commerce & Stores")).toBe("e-commerce-and-stores");
  });

  it("does not treat Object.prototype keys as seeded categories", () => {
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(isGameCategory(key)).toBe(false);
      const resolved = resolveGameCategory(key);
      expect(resolved.slug).toBe(key.toLowerCase());
      expect(resolved.themeArchetype).toBeTruthy();
      expect(typeof resolved).not.toBe("function");
    }
  });
});

describe("parseSeasonSlug", () => {
  it("accepts leftover legacy slugs but rejects junk", () => {
    expect(parseSeasonSlug("tech")).toBe("tech");
    expect(parseSeasonSlug("indie-games")).toBe("indie-games");
    expect(parseSeasonSlug("__proto__")).toBeNull();
    expect(parseSeasonSlug("constructor")).toBeNull();
    expect(parseSeasonSlug("toString")).toBeNull();
    expect(parseSeasonSlug("")).toBeNull();
  });
});
