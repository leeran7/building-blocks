/**
 * Landing #towers directory preview.
 *
 * Collapsed All shows DEFAULT_VISIBLE_STACKS (9) stacks. Expanding reveals
 * every stack grouped by family. A family chip always shows that family
 * in full. These tests invoke the production helpers — they do not grep
 * TowerDirectory.tsx.
 */

import { describe, it, expect } from "vitest";
import {
  GAME_CATEGORIES,
  FAMILIES,
  type Family,
  type GameCategory,
} from "../../src/game/categories";
import {
  directorySections,
  hiddenDirectoryCount,
  directoryToggleVisible,
  DEFAULT_VISIBLE_STACKS,
} from "../../src/components/LandingPage/towerDirectoryPreview";

function groupedFromSeed(): Record<Family, GameCategory[]> {
  const out = {} as Record<Family, GameCategory[]>;
  for (const f of FAMILIES) out[f] = [];
  for (const c of GAME_CATEGORIES) out[c.family].push(c);
  return out;
}

const GROUPED = groupedFromSeed();

function flatten(grouped: Record<Family, GameCategory[]>): GameCategory[] {
  return FAMILIES.flatMap((f) => grouped[f] ?? []);
}

describe("DEFAULT_VISIBLE_STACKS", () => {
  it("shows at least 9 stacks in the collapsed All preview", () => {
    expect(DEFAULT_VISIBLE_STACKS).toBeGreaterThanOrEqual(9);
  });
});

describe("directorySections: collapsed All is a 9-stack preview", () => {
  it("returns the first 9 stacks in family order, enough to fill three desktop rows", () => {
    const sections = directorySections({
      family: "all",
      expanded: false,
      grouped: GROUPED,
    });
    const stacks = sections.flatMap((s) => s.stacks);
    expect(stacks).toHaveLength(DEFAULT_VISIBLE_STACKS);
    expect(stacks).toEqual(flatten(GROUPED).slice(0, DEFAULT_VISIBLE_STACKS));
    expect(sections[0].family).toBe(FAMILIES[0]);
  });

  it("does not include a stack past the preview limit while collapsed", () => {
    const previewSlugs = new Set(
      flatten(GROUPED).slice(0, DEFAULT_VISIBLE_STACKS).map((c) => c.slug)
    );
    const leftover = flatten(GROUPED).find((c) => !previewSlugs.has(c.slug));
    expect(leftover).toBeDefined();
    const visible = directorySections({
      family: "all",
      expanded: false,
      grouped: GROUPED,
    }).flatMap((s) => s.stacks.map((c) => c.slug));
    expect(visible).not.toContain(leftover!.slug);
    expect(visible).toHaveLength(DEFAULT_VISIBLE_STACKS);
  });

  it("spills into the next family when the first family is shorter than the preview", () => {
    const tech = GROUPED["Tech & Software"].slice(0, 2);
    const design = GROUPED["Design & Creative Tools"];
    const grouped = {
      ...GROUPED,
      "Tech & Software": tech,
    };
    const sections = directorySections({
      family: "all",
      expanded: false,
      grouped,
      previewCount: 9,
    });
    expect(sections.map((s) => s.family)).toEqual([
      "Tech & Software",
      "Design & Creative Tools",
    ]);
    expect(sections[0].stacks).toEqual(tech);
    expect(sections[1].stacks).toEqual(design.slice(0, 7));
    expect(sections.flatMap((s) => s.stacks)).toHaveLength(9);
  });
});

describe("directorySections: expanded All is the full family accordion", () => {
  it("returns one section per family covering every seeded stack exactly once", () => {
    const sections = directorySections({
      family: "all",
      expanded: true,
      grouped: GROUPED,
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
    });
    expect(sections).toEqual([{ family: "Science & Research", stacks: [] }]);
  });
});

describe("hiddenDirectoryCount", () => {
  it("counts stacks beyond the collapsed preview on All", () => {
    expect(
      hiddenDirectoryCount(
        GAME_CATEGORIES.length,
        DEFAULT_VISIBLE_STACKS,
        false,
        "all"
      )
    ).toBe(GAME_CATEGORIES.length - DEFAULT_VISIBLE_STACKS);
    expect(GAME_CATEGORIES.length - DEFAULT_VISIBLE_STACKS).toBeGreaterThan(0);
  });

  it("is zero once expanded, when a family is selected, or when preview covers all", () => {
    expect(
      hiddenDirectoryCount(GAME_CATEGORIES.length, DEFAULT_VISIBLE_STACKS, true, "all")
    ).toBe(0);
    expect(
      hiddenDirectoryCount(
        GAME_CATEGORIES.length,
        DEFAULT_VISIBLE_STACKS,
        false,
        "Tech & Software"
      )
    ).toBe(0);
    expect(hiddenDirectoryCount(7, 7, false, "all")).toBe(0);
    expect(hiddenDirectoryCount(5, 9, false, "all")).toBe(0);
    expect(hiddenDirectoryCount(0, 9, false, "all")).toBe(0);
  });
});

describe("directoryToggleVisible", () => {
  it("shows the control on collapsed All when stacks are hidden", () => {
    expect(
      directoryToggleVisible({ family: "all", expanded: false, hiddenCount: 65 })
    ).toBe(true);
  });

  it("keeps the control on expanded All even though hiddenCount is 0", () => {
    expect(
      directoryToggleVisible({ family: "all", expanded: true, hiddenCount: 0 })
    ).toBe(true);
  });

  it("hides the control on a family chip and when the preview already covers all", () => {
    expect(
      directoryToggleVisible({
        family: "Tech & Software",
        expanded: false,
        hiddenCount: 65,
      })
    ).toBe(false);
    expect(
      directoryToggleVisible({ family: "all", expanded: false, hiddenCount: 0 })
    ).toBe(false);
  });
});
