/**
 * Picking a booster ahead of a run (mobile/src/lib/levels/boosterPick.ts):
 * the next level a result card may pick for, the free power-up a card's run
 * starts with, and which carried pick a start card may equip.
 */

import { describe, expect, it } from "vitest";

import { carriedBooster, equippable, freeTypeOn, nextStartAfter } from "../../mobile/src/lib/levels/boosterPick";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { SeasonView } from "../../mobile/src/lib/levels/model";

async function season(): Promise<SeasonView> {
  let stored: string | null = null;
  return createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) }).getSeason();
}

describe("nextStartAfter", () => {
  it("gives the next level's allowed power-ups and its free one", async () => {
    const s = { ...(await season()), frontier: 8, nextStartPowerUp: { type: "rapid-climb", source: "streak" } } as const;
    expect(nextStartAfter(s, 7)).toEqual({ level: 8, allowed: s.levels[7].allowedPowerUps, freeType: "rapid-climb" });
    expect(nextStartAfter(s, 6)).toEqual({ level: 7, allowed: s.levels[6].allowedPowerUps, freeType: null });
  });

  it("is null at the end of the season, beyond the frontier, or with no season", async () => {
    const s = await season();
    const last = s.levels.length;
    expect(nextStartAfter({ ...s, frontier: last }, last)).toBeNull();
    expect(nextStartAfter({ ...s, frontier: last }, last - 1)).not.toBeNull();
    // Never reads past the season, even on a frontier the server got wrong.
    expect(nextStartAfter({ ...s, frontier: last + 1 }, last)).toBeNull();
    expect(nextStartAfter({ ...s, frontier: 5 }, 5)).toBeNull();
    expect(nextStartAfter({ ...s, frontier: 5 }, 4)).not.toBeNull();
    expect(nextStartAfter(null, 4)).toBeNull();
    expect(nextStartAfter(s, Number.NaN)).toBeNull();
  });
});

describe("freeTypeOn", () => {
  it("is the preview's type on the frontier only", () => {
    const s = { frontier: 8, nextStartPowerUp: { type: "rapid-climb", source: "streak" } } as const;
    expect(freeTypeOn(s, 8)).toBe("rapid-climb");
    expect(freeTypeOn(s, 7)).toBeNull();
    expect(freeTypeOn({ frontier: 8, nextStartPowerUp: null }, 8)).toBeNull();
  });
});

describe("equippable", () => {
  const allowed = ["rapid-climb", "sprint-burst"];
  it("keeps an owned, allowed pick that is not the run's free type", () => {
    expect(equippable("sprint-burst", { "sprint-burst": 1 }, allowed, "rapid-climb")).toBe("sprint-burst");
  });

  it("drops a pick not owned, not allowed, or free on the run, never swapping it", () => {
    expect(equippable("sprint-burst", { "rapid-climb": 3 }, allowed, null)).toBeNull();
    expect(equippable("sprint-burst", { "sprint-burst": 0 }, allowed, null)).toBeNull();
    expect(equippable("giant", { giant: 1 }, allowed, null)).toBeNull();
    expect(equippable("rapid-climb", { "rapid-climb": 1 }, allowed, "rapid-climb")).toBeNull();
    expect(equippable(null, { "rapid-climb": 1 }, allowed, null)).toBeNull();
  });
});

describe("carriedBooster", () => {
  it("reads a booster type from router state and nothing else", () => {
    expect(carriedBooster({ openLevel: 8, booster: "rapid-climb" })).toBe("rapid-climb");
    for (const state of [null, undefined, "rapid-climb", { openLevel: 8 }, { booster: "random" }, { booster: "toString" }, { booster: 3 }]) {
      expect(carriedBooster(state)).toBeNull();
    }
  });
});
