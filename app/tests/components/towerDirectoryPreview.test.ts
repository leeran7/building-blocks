/**
 * Landing #towers directory preview.
 *
 * Collapsed All shows featured stacks (one per family). Expanding reveals
 * every stack grouped by family. A family chip always shows that family
 * in full. These tests invoke the production helpers — they do not grep
 * TowerDirectory.tsx.
 */

import { describe, it, expect } from "vitest";
import {
  GAME_CATEGORIES,
  FAMILIES,
  FEATURED_GAME_CATEGORIES,
  type Family,
  type GameCategory,
} from "../../src/game/categories";
import {
  directorySections,
  hiddenDirectoryCount,
} from "../../src/components/LandingPage/towerDirectoryPreview";

function groupedFromSeed(): Record<Family, GameCategory[]> {
  const out = {} as Record<Family, GameCategory[]>;
  for (const f of FAMILIES) out[f] = [];
  for (const c of GAME_CATEGORIES) out[c.family].push(c);
  return out;
}

const GROUPED = groupedFromSeed();

describe("directorySections: collapsed All is the featured grid", () => {
  it("returns one untitled section whose stacks are the featured set, in order", () => {
    const sections = directorySections({
      family: "all",
      expanded: false,
      grouped: GROUPED,
      featured: FEATURED_GAME_CATEGORIES,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].family).toBeNull();
    expect(sections[0].stacks).toEqual(FEATURED_GAME_CATEGORIES);
    expect(sections[0].stacks).toHaveLength(FAMILIES.length);
  });

  it("does not include a non-featured stack while collapsed", () => {
    const featuredSlugs = new Set(FEATURED_GAME_CATEGORIES.map((c) => c.slug));
    const leftover = GAME_CATEGORIES.find((c) => !featuredSlugs.has(c.slug));
    expect(leftover).toBeDefined();
    const visible = directorySections({
      family: "all",
      expanded: false,
      grouped: GROUPED,
      featured: FEATURED_GAME_CATEGORIES,
    })[0].stacks.map((c) => c.slug);
    expect(visible).not.toContain(leftover!.slug);
  });
});

describe("directorySections: expanded All is the full family accordion", () => {
  it("returns one section per family covering every seeded stack exactly once", () => {
    const sections = directorySections({
      family: "all",
      expanded: true,
      grouped: GROUPED,
      featured: FEATURED_GAME_CATEGORIES,
    });
    expect(sections.map((s) => s.family)).toEqual(FAMILIES);
    const slugs = sections.flatMap((s) => s.stacks.map((c) => c.slug));
    expect(slugs).toHaveLength(GAME_CATEGORIES.length);
    expect(new Set(slugs).size).toBe(GAME_CATEGORIES.length);
    for (const c of GAME_CATEGORIES) {
      expect(slugs).toContain(c.slug);
    }
  });

  it("keeps each family's stacks in the grouped order it was given", () => {
    const reversedTech = [...GROUPED["Tech & Software"]].reverse();
    const grouped = { ...GROUPED, "Tech & Software": reversedTech };
    const tech = directorySections({
      family: "all",
      expanded: true,
      grouped,
      featured: FEATURED_GAME_CATEGORIES,
    }).find((s) => s.family === "Tech & Software");
    expect(tech?.stacks.map((c) => c.slug)).toEqual(
      reversedTech.map((c) => c.slug)
    );
  });
});

describe("directorySections: a family chip shows that family in full", () => {
  it("ignores expanded and returns every stack in the selected family", () => {
    const family: Family = "Gaming & Interactive";
    const expected = GROUPED[family].map((c) => c.slug);
    for (const expanded of [false, true]) {
      const sections = directorySections({
        family,
        expanded,
        grouped: GROUPED,
        featured: FEATURED_GAME_CATEGORIES,
      });
      expect(sections).toHaveLength(1);
      expect(sections[0].family).toBe(family);
      expect(sections[0].stacks.map((c) => c.slug)).toEqual(expected);
      expect(sections[0].stacks.length).toBeGreaterThan(1);
    }
  });

  it("returns an empty stack list when grouped is missing that family", () => {
    const sections = directorySections({
      family: "Science & Research",
      expanded: false,
      grouped: {} as Record<Family, GameCategory[]>,
      featured: FEATURED_GAME_CATEGORIES,
    });
    expect(sections).toEqual([{ family: "Science & Research", stacks: [] }]);
  });
});

describe("hiddenDirectoryCount", () => {
  it("counts stacks beyond the featured preview on collapsed All", () => {
    expect(
      hiddenDirectoryCount(
        GAME_CATEGORIES.length,
        FEATURED_GAME_CATEGORIES.length,
        false,
        "all"
      )
    ).toBe(GAME_CATEGORIES.length - FEATURED_GAME_CATEGORIES.length);
    expect(GAME_CATEGORIES.length - FEATURED_GAME_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("is zero once expanded, when a family is selected, or when preview covers all", () => {
    expect(
      hiddenDirectoryCount(GAME_CATEGORIES.length, FEATURED_GAME_CATEGORIES.length, true, "all")
    ).toBe(0);
    expect(
      hiddenDirectoryCount(
        GAME_CATEGORIES.length,
        FEATURED_GAME_CATEGORIES.length,
        false,
        "Tech & Software"
      )
    ).toBe(0);
    expect(hiddenDirectoryCount(7, 7, false, "all")).toBe(0);
    expect(hiddenDirectoryCount(5, 9, false, "all")).toBe(0);
    expect(hiddenDirectoryCount(0, 7, false, "all")).toBe(0);
  });
});
