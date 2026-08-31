/**
 * Fair first-surge proximity — the opening lava miss is solved per tower so
 * every archetype (and every user) gets the same first-surge scare in floor
 * units, not a lucky 9 m constant.
 *
 * Invokes the production units (firstSurgeProximity, resolveHazardConfig,
 * stepMatch) and asserts their output. The equality across archetypes is the
 * fairness contract.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAZARD_CONFIG,
  firstSurgeEndSeconds,
  hazardHasReached,
  hazardHeightAt,
  hazardRiseDistance,
} from "../../src/game/hazard";
import {
  FIRST_RUN_TRAVERSE_FRAC,
  MAX_HEAD_START_FLOORS,
  MIN_HEAD_START_M,
  fairFirstClimberHeight,
  firstSurgeProximity,
  resolveHazardConfig,
} from "../../src/game/firstSurge";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { NO_INPUT, TowerSpec } from "../../src/game/types";
import {
  GAME_CATEGORIES,
  TrackArchetype,
} from "../../src/game/categories";
import { applyRunSeed, buildTower, ladderKeepInM } from "../../src/game/towers";

const CFG = DEFAULT_HAZARD_CONFIG;
const ARCHETYPES: TrackArchetype[] = [
  "ladder-climb",
  "platform-gauntlet",
  "crumble-stairs",
  "wall-jump-chimney",
];

describe("firstSurgeEndSeconds / hazardRiseDistance", () => {
  it("ends the first surge when the first stumble begins", () => {
    expect(firstSurgeEndSeconds(CFG)).toBe(
      CFG.graceSeconds + (CFG.stumblePeriodSeconds - CFG.stumbleDurationSeconds)
    );
    expect(firstSurgeEndSeconds(CFG)).toBe(13);
  });

  it("rise distance is height with a zero head-start", () => {
    const t = 10;
    const climb = 9;
    expect(hazardRiseDistance(t, climb, CFG)).toBeCloseTo(
      hazardHeightAt(t, climb, { ...CFG, headStartM: 0 }),
      12
    );
  });
});

describe("fair first-surge miss is the same in floor units on every archetype", () => {
  it("does not clamp the default tuning on any live archetype", () => {
    for (const tower of towersForEachArchetype()) {
      const prox = firstSurgeProximity(tower, CFG);
      expect(prox.clamped).toBe(false);
      expect(prox.headStartM).toBeGreaterThanOrEqual(MIN_HEAD_START_M);
      expect(prox.headStartM).toBeLessThanOrEqual(
        MAX_HEAD_START_FLOORS * tower.floorGap
      );
    }
  });

  it("misses a fair first-time climber by firstSurgeMissFloors of a floor", () => {
    const misses: number[] = [];
    for (const tower of towersForEachArchetype()) {
      const prox = firstSurgeProximity(tower, CFG);
      expect(prox.missFloors).toBeCloseTo(CFG.firstSurgeMissFloors, 6);
      expect(prox.missM).toBeCloseTo(CFG.firstSurgeMissFloors * tower.floorGap, 6);
      misses.push(prox.missFloors);
    }
    const spread = Math.max(...misses) - Math.min(...misses);
    expect(spread).toBeLessThan(1e-6);
  });

  it("solves a different head-start per archetype (the 9 m constant was the bug)", () => {
    const starts = towersForEachArchetype().map(
      (tower) => firstSurgeProximity(tower, CFG).headStartM
    );
    const unique = new Set(starts.map((s) => s.toFixed(4)));
    expect(unique.size).toBeGreaterThan(1);
    expect(starts.every((s) => Math.abs(s - 9) < 0.05)).toBe(false);
  });
});

describe("fairness is physics, not seed and not this player", () => {
  it("same slug, different layout seeds → identical head-start", () => {
    const a = applyRunSeed(buildTower("indie-games"), "seed-a");
    const b = applyRunSeed(buildTower("indie-games"), "seed-b");
    expect(a.seed).not.toBe(b.seed);
    expect(firstSurgeProximity(a, CFG).headStartM).toBe(
      firstSurgeProximity(b, CFG).headStartM
    );
  });

  it("two slugs of the same archetype share a head-start", () => {
    const pairs = slugsByArchetype();
    for (const slugs of Object.values(pairs)) {
      if (slugs.length < 2) continue;
      const a = firstSurgeProximity(buildTower(slugs[0]!), CFG).headStartM;
      const b = firstSurgeProximity(buildTower(slugs[1]!), CFG).headStartM;
      expect(a).toBeCloseTo(b, 9);
    }
  });

  it("traverse is a fraction of the playable width, independent of seed", () => {
    const tower = buildTower("indie-games");
    const playable = tower.widthM - 2 * ladderKeepInM(tower);
    const tFloor =
      CFG.firstRunHesitation *
      ((playable * FIRST_RUN_TRAVERSE_FRAC) / tower.moveSpeed +
        tower.floorGap / tower.maxClimbSpeed);
    const t = firstSurgeEndSeconds(CFG);
    expect(fairFirstClimberHeight(tower, t, CFG)).toBeCloseTo(
      (t / tFloor) * tower.floorGap,
      9
    );
  });
});

describe("the solved opening is survivable for a fair run, lethal if you idle", () => {
  it("a climber on the base is safe at GO and through the grace", () => {
    for (const tower of towersForEachArchetype()) {
      const cfg = resolveHazardConfig(tower, CFG);
      const climb = tower.maxClimbSpeed;
      expect(hazardHasReached(0, 0, climb, cfg)).toBe(false);
      expect(hazardHasReached(0, cfg.graceSeconds, climb, cfg)).toBe(false);
      expect(hazardHeightAt(0, climb, cfg)).toBeCloseTo(-cfg.headStartM, 9);
      expect(cfg.headStartM).toBeGreaterThan(0);
    }
  });

  it("the fair first-time climber is still above the lava when the first surge ends", () => {
    for (const tower of towersForEachArchetype()) {
      const prox = firstSurgeProximity(tower, CFG);
      const cfg = resolveHazardConfig(tower, CFG);
      expect(
        hazardHasReached(
          prox.fairHeightM,
          prox.endSeconds,
          tower.maxClimbSpeed,
          cfg
        )
      ).toBe(false);
      expect(prox.fairHeightM).toBeGreaterThan(prox.lavaHeightM);
    }
  });

  it("an idle climber has been caught by the end of the first surge", () => {
    for (const tower of towersForEachArchetype()) {
      const prox = firstSurgeProximity(tower, CFG);
      const cfg = resolveHazardConfig(tower, CFG);
      expect(
        hazardHasReached(0, prox.endSeconds, tower.maxClimbSpeed, cfg)
      ).toBe(true);
    }
  });
});

describe("resolveHazardConfig is what the live sim uses", () => {
  it("stepMatch opens at the solved head-start, not the 9 m fallback", () => {
    const tower = buildTower("indie-games");
    const solved = resolveHazardConfig(tower, CFG);
    const m = createMatch({
      seed: "fair-surge",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    expect(m.hazardY).toBeCloseTo(-solved.headStartM, 9);
    m.phase = "climb";
    m.tick = 0;
    stepMatch(m, { p1: NO_INPUT });
    expect(m.hazardY).toBeCloseTo(-solved.headStartM, 9);
    expect(Math.abs(m.hazardY + 9)).toBeGreaterThan(0.05);
  });

  it("fairFirstSurge: false keeps the numeric head-start", () => {
    const tower = buildTower("indie-games");
    const frozen = {
      ...CFG,
      fairFirstSurge: false,
      headStartM: 9,
    };
    expect(resolveHazardConfig(tower, frozen).headStartM).toBe(9);
    const prox = firstSurgeProximity(tower, frozen);
    expect(prox.headStartM).toBe(9);
    expect(prox.clamped).toBe(false);
    expect(prox.lavaHeightM).toBeCloseTo(
      hazardHeightAt(prox.endSeconds, tower.maxClimbSpeed, frozen),
      9
    );
    expect(Math.abs(prox.missFloors - CFG.firstSurgeMissFloors)).toBeGreaterThan(
      0.05
    );
    const m = createMatch({
      seed: "fixed-surge",
      mode: "solo",
      tower,
      playerIds: ["p1"],
      hazard: frozen,
    });
    expect(m.hazardY).toBeCloseTo(-9, 9);
    m.phase = "climb";
    m.tick = 0;
    stepMatch(m, { p1: NO_INPUT }, { hazard: frozen });
    expect(m.hazardY).toBeCloseTo(-9, 9);
  });
});

describe("clamp and degenerate towers stay finite", () => {
  it("a huge miss target clamps to MAX_HEAD_START_FLOORS and reports clamped", () => {
    const tower = buildTower("indie-games");
    const prox = firstSurgeProximity(tower, {
      ...CFG,
      firstSurgeMissFloors: 50,
    });
    expect(prox.clamped).toBe(true);
    expect(prox.headStartM).toBeCloseTo(
      MAX_HEAD_START_FLOORS * tower.floorGap,
      9
    );
  });

  it("zero speeds and a zero gap still produce a finite positive head-start", () => {
    const base = buildTower("indie-games");
    const weird: TowerSpec = {
      ...base,
      maxClimbSpeed: 0,
      moveSpeed: 0,
      floorGap: 0,
    };
    const prox = firstSurgeProximity(weird, CFG);
    expect(Number.isFinite(prox.headStartM)).toBe(true);
    expect(Number.isFinite(prox.fairHeightM)).toBe(true);
    expect(Number.isFinite(prox.missM)).toBe(true);
    expect(prox.headStartM).toBe(MIN_HEAD_START_M);
  });
});

function towersForEachArchetype(): TowerSpec[] {
  return ARCHETYPES.map((archetype) => {
    const cat = GAME_CATEGORIES.find((c) => c.themeArchetype === archetype);
    expect(cat, `no seeded category for ${archetype}`).toBeTruthy();
    return buildTower(cat!.slug);
  });
}

function slugsByArchetype(): Record<TrackArchetype, string[]> {
  const out: Record<TrackArchetype, string[]> = {
    "ladder-climb": [],
    "platform-gauntlet": [],
    "crumble-stairs": [],
    "wall-jump-chimney": [],
  };
  for (const c of GAME_CATEGORIES) out[c.themeArchetype].push(c.slug);
  return out;
}
