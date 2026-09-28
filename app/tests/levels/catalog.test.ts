/**
 * The level catalog (src/levels/catalog.ts): the committed season manifest
 * the server scores stars against, and its refusal of an unsound one.
 */

import { describe, expect, it } from "vitest";

import { catalogLevel, manifestProblems, seasonManifest, starsForTicks } from "../../src/levels/catalog";
import season1 from "../../src/game/levels/seasons/season-1.json";

const copy = (): typeof season1 => JSON.parse(JSON.stringify(season1));

describe("level catalog", () => {
  it("serves season 1's committed manifest, all 300 levels", () => {
    expect(manifestProblems(1)).toEqual([]);
    const manifest = seasonManifest(1);
    expect(manifest?.levels).toHaveLength(300);
    expect(catalogLevel(1, 1)?.level).toBe(1);
    expect(catalogLevel(1, 300)?.level).toBe(300);
  });

  it("has no level outside 1..300 and no unknown season", () => {
    for (const n of [0, 301, 1.5, -1]) expect(catalogLevel(1, n)).toBeNull();
    expect(seasonManifest(2)).toBeNull();
    expect(catalogLevel(2, 1)).toBeNull();
  });

  it("refuses a manifest with broken pars, a missing level or another season's spec", () => {
    const badPars = copy();
    badPars.levels[9].pars = { twoStarTicks: 100, threeStarTicks: 200, oneStarTicks: 300 };
    expect(manifestProblems(1, badPars)).toContain("L10: bad pars");

    // A clock shorter than the 2-star time, or a row missing its clock field.
    const badClock = copy();
    badClock.levels[9].pars.oneStarTicks = badClock.levels[9].pars.twoStarTicks - 1;
    expect(manifestProblems(1, badClock)).toContain("L10: bad pars");
    const noClock = copy();
    delete (noClock.levels[9].pars as { oneStarTicks?: number | null }).oneStarTicks;
    expect(manifestProblems(1, noClock)).toContain("L10: bad pars");

    const zeroPars = copy();
    zeroPars.levels[0].pars.threeStarTicks = 0;
    expect(manifestProblems(1, zeroPars)).toContain("L1: bad pars");

    const short = copy();
    short.levels.pop();
    expect(manifestProblems(1, short).length).toBeGreaterThan(0);

    const otherSpec = copy();
    otherSpec.season.name = "Season X";
    expect(manifestProblems(1, otherSpec).length).toBeGreaterThan(0);

    expect(manifestProblems(1, null)).toEqual(["no manifest for season 1"]);
    expect(manifestProblems(99, season1)).toEqual(["no season spec for season 99"]);
  });

  it("scores stars at the pars, inclusive", () => {
    const pars = { twoStarTicks: 500, threeStarTicks: 400, oneStarTicks: null };
    expect(starsForTicks(1, pars)).toBe(3);
    expect(starsForTicks(400, pars)).toBe(3);
    expect(starsForTicks(401, pars)).toBe(2);
    expect(starsForTicks(500, pars)).toBe(2);
    expect(starsForTicks(501, pars)).toBe(1);
  });

  it("scores no stars past the level's clock", () => {
    const pars = { twoStarTicks: 500, threeStarTicks: 400, oneStarTicks: 750 };
    expect(starsForTicks(501, pars)).toBe(1);
    expect(starsForTicks(750, pars)).toBe(1);
    expect(starsForTicks(751, pars)).toBe(0);
    expect(starsForTicks(400, pars)).toBe(3);
  });
});
