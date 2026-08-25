/**
 * Tower v3 "The Climb" — tower builder tests.
 * Towers are deterministic per (slug, options) so re-simulation holds (AC-11).
 */

import { describe, it, expect } from "vitest";
import { buildTower, MVP_TOWER } from "../../src/game/towers";

describe("buildTower", () => {
  it("is deterministic for the same slug + options", () => {
    const a = buildTower("indie-games", { heightM: 300, segments: 6 });
    const b = buildTower("indie-games", { heightM: 300, segments: 6 });
    expect(a).toEqual(b);
  });

  it("places the flag at the tower height and checkpoints below it", () => {
    const t = buildTower("developer-tools", { heightM: 200, segments: 4 });
    expect(t.flagY).toBe(200);
    expect(t.checkpoints[0]).toBe(0); // base
    expect(t.checkpoints.length).toBe(4);
    for (const cp of t.checkpoints) expect(cp).toBeLessThan(t.flagY);
  });

  it("resolves an unknown slug into a playable tower (open-ended)", () => {
    const t = buildTower("underwater-basket-weaving");
    expect(t.flagY).toBeGreaterThan(0);
    expect(t.maxClimbSpeed).toBeGreaterThan(0);
  });

  it("exposes an MVP tower for Phase 1 solo play", () => {
    expect(MVP_TOWER.categorySlug).toBe("indie-games");
    expect(MVP_TOWER.flagY).toBe(MVP_TOWER.heightM);
  });
});
