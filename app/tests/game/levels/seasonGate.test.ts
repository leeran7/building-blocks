/**
 * The season gate through the real stepMatch (design doc §3 winnability gate).
 * Every negative guard here is proven against a row it must reject. The full
 * 300-level re-check of the committed manifest is `pnpm season:verify 1`,
 * run by CI's season job.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEASON_1, LEVELS_PER_SEASON } from "../../../src/game/levels/season";
import {
  GATE,
  buildManifest,
  manifestShapeProblems,
  measureLevel,
  neverEasierProblems,
  serializeManifest,
  verifyLevelRow,
  type ManifestLevel,
  type SeasonManifest,
} from "../../../src/game/levels/seasonGate";
import { levelSpec } from "../../../src/game/levels/levelSpec";
import { runLevel, NO_LAVA } from "../../../src/game/levels/levelRun";

const committed = JSON.parse(
  readFileSync(join(__dirname, "../../../src/game/levels/seasons/season-1.json"), "utf8")
) as SeasonManifest;

function measured(level: number, rev: number): ManifestLevel {
  const m = measureLevel(SEASON_1, level, rev);
  if ("failure" in m) throw new Error(m.failure);
  return m.row;
}

describe("route bot", () => {
  // Seeds where the greedy test bot loops forever: an island between two
  // gaps, and a gap right after a crate pyramid.
  it.each(["s1:level:232:0", "s1:level:120:0"])("clears %s", (seed) => {
    const [, , level, rev] = seed.split(":");
    const spec = { ...levelSpec(SEASON_1, Number(level), Number(rev)), goalFt: 200 };
    expect(runLevel(spec, { hazard: NO_LAVA }).outcome).toBe("cleared");
  });

  it("is slowed by the idle share", () => {
    const spec = levelSpec(SEASON_1, 10, 0);
    const fast = runLevel(spec, { hazard: NO_LAVA });
    const slow = runLevel(spec, { hazard: NO_LAVA, idleShare: 0.2 });
    expect(fast.outcome).toBe("cleared");
    expect(slow.outcome).toBe("cleared");
    expect(slow.ticks / fast.ticks).toBeGreaterThan(1.15);
  });
});

describe("level gate", () => {
  // A prove-red level: the gate runs every check on it.
  const row = committed.levels[GATE.proveRedFromLevel - 1];

  it("passes the committed rows it re-measures", () => {
    expect(row.level).toBe(GATE.proveRedFromLevel);
    expect(verifyLevelRow(SEASON_1, row)).toEqual([]);
    expect(verifyLevelRow(SEASON_1, committed.levels[0])).toEqual([]);
  });

  it("re-measures a committed row exactly", () => {
    expect(measured(row.level, row.rev)).toEqual(row);
  }, 60_000);

  it("fails a level whose lava catches the route bot", () => {
    const tooFast = { ...row, catchMeanFrac: row.catchMeanFrac * 1.25 };
    tooFast.lavaMeanFrac = levelSpec(SEASON_1, row.level, row.rev).tightness * tooFast.catchMeanFrac;
    expect(verifyLevelRow(SEASON_1, tooFast).join()).toMatch(/caught by the level's lava/);
  });

  it("fails a level the slower bot can still clear", () => {
    const tooSlow = { ...row, catchMeanFrac: row.catchMeanFrac * 0.6 };
    tooSlow.lavaMeanFrac = levelSpec(SEASON_1, row.level, row.rev).tightness * tooSlow.catchMeanFrac;
    expect(verifyLevelRow(SEASON_1, tooSlow).join()).toMatch(/prove-red bot .* was cleared/);
  });

  it("fails a late level no lava can catch", () => {
    expect(verifyLevelRow(SEASON_1, { ...row, catchCapped: true }).join()).toMatch(/cannot be proven loseable/);
  });

  it("fails rows whose derived values were edited", () => {
    expect(verifyLevelRow(SEASON_1, { ...row, lavaMeanFrac: row.lavaMeanFrac * 0.9 }).join()).toMatch(
      /tightness × catch point/
    );
    expect(verifyLevelRow(SEASON_1, { ...row, routeTicks: row.routeTicks + 30 }).join()).toMatch(/ramp|pars/);
    const pars = { ...row.pars, threeStarTicks: row.pars.threeStarTicks + 1 };
    expect(verifyLevelRow(SEASON_1, { ...row, pars }).join()).toMatch(/pars/);
  });
});

describe("season manifest", () => {
  it("is a whole, valid, never-easier season 1", () => {
    expect(committed.levels).toHaveLength(LEVELS_PER_SEASON);
    expect(manifestShapeProblems(committed, SEASON_1)).toEqual([]);
  });

  it("flags a level that is easier than the one before", () => {
    const rows = committed.levels.slice(59, 62).map((r) => ({ ...r }));
    expect(neverEasierProblems(SEASON_1, rows)).toEqual([]);
    rows[2].lavaMeanFrac = rows[2].catchMeanFrac * 0.5;
    expect(neverEasierProblems(SEASON_1, rows).join()).toMatch(/L61 → L62: measured lava tightness/);
  });

  it("refuses a manifest for another spec or with missing levels", () => {
    const other = { ...committed, season: { ...SEASON_1, seedSalt: "x" } };
    expect(manifestShapeProblems(other, SEASON_1).join()).toMatch(/does not match/);
    const short = { ...committed, levels: committed.levels.slice(0, 299) };
    expect(manifestShapeProblems(short, SEASON_1).join()).toMatch(/299 levels/);
    const stale = { ...committed, specVersion: 0 };
    expect(manifestShapeProblems(stale, SEASON_1).join()).toMatch(/spec v0/);
  });

  it("serializes to the committed file byte for byte", () => {
    const file = readFileSync(join(__dirname, "../../../src/game/levels/seasons/season-1.json"), "utf8");
    expect(serializeManifest(buildManifest(SEASON_1, committed.levels))).toBe(file);
  });
});
