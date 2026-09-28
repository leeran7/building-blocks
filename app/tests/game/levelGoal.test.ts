/**
 * A level tower has a goal height (`tower.goalM`). The tower is capped by a
 * solid summit floor, the first floor at or above the goal, with nothing on or
 * above it, and stepMatch finishes a climber whose feet reach the goal, before
 * the death line on the same tick. Endless towers have no goalM and are pinned
 * bit-identical by freeStackGolden.test.ts.
 */

import { describe, expect, it } from "vitest";

import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "../../src/game/simulation";
import {
  applyRunSeed,
  floorHeight,
  laddersForFloor,
  platformsForFloor,
  platformsNearY,
  summitFloor,
} from "../../src/game/towers";
import { obstaclesForFloor } from "../../src/game/obstacles";
import { powerUpForFloor } from "../../src/game/powerups";
import { buildFreeTower } from "../../src/game/freeStack";
import type { MatchState, TowerSpec } from "../../src/game/types";
import { botInput } from "./greedyBot";

function level(seed: string, fields: Partial<TowerSpec>): TowerSpec {
  return { ...applyRunSeed(buildFreeTower(), seed), ...fields };
}

function floorGeometry(tower: TowerSpec, i: number) {
  return {
    platforms: platformsForFloor(tower, i),
    ladders: laddersForFloor(tower, i),
    obstacles: obstaclesForFloor(tower, i),
    orb: powerUpForFloor(tower, i),
  };
}

describe("summitFloor", () => {
  it("is null on an endless tower", () => {
    expect(summitFloor(buildFreeTower())).toBeNull();
  });

  it("is the first floor at or above the goal", () => {
    const base = level("summit-edge", {});
    const y7 = floorHeight(base, 7);
    expect(summitFloor({ ...base, goalM: y7 })).toBe(7);
    expect(summitFloor({ ...base, goalM: y7 + 0.001 })).toBe(8);
    expect(summitFloor({ ...base, goalM: y7 - 0.001 })).toBe(7);
    expect(summitFloor({ ...base, goalM: 0.001 })).toBe(1);
  });

  it("rejects a goal that is not a positive finite height", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const t = level(`bad-goal-${bad}`, { goalM: bad });
      expect(() => summitFloor(t)).toThrow(RangeError);
      expect(() => platformsForFloor(t, 3)).toThrow(RangeError);
    }
  });
});

describe("a level tower is capped at its summit", () => {
  const seed = "summit-cap";
  // Every floor carries an orb, so the orb guard is tested against real orbs.
  const endless = level(seed, { difficulty: 0.6, powerUpChance: 1 });
  const goalM = floorHeight(endless, 12) + 3;
  const capped = { ...endless, goalM };
  const summit = summitFloor(capped)!;

  it("puts the summit at the first floor over the goal", () => {
    expect(summit).toBe(13);
    expect(floorHeight(capped, summit)).toBeGreaterThanOrEqual(goalM);
    expect(floorHeight(capped, summit - 1)).toBeLessThan(goalM);
  });

  it("leaves every floor below the summit exactly as the endless tower has it", () => {
    for (let i = 0; i < summit; i++) {
      expect(floorGeometry(capped, i)).toEqual(floorGeometry(endless, i));
    }
    // The last climb still leads up onto the summit.
    const last = laddersForFloor(capped, summit - 1);
    expect(last.length).toBeGreaterThan(0);
    for (const l of last) expect(l.y1).toBe(floorHeight(capped, summit));
  });

  it("makes the summit one solid floor with no ladder, crate or orb", () => {
    // Positive fixture: the endless tower has every kind of geometry there.
    const open = floorGeometry(endless, summit);
    expect(open.ladders.length).toBeGreaterThan(0);
    expect(open.orb).not.toBeNull();

    const top = floorGeometry(capped, summit);
    expect(top.platforms).toEqual([
      { x0: 0, x1: capped.widthM, y: floorHeight(capped, summit) },
    ]);
    expect(top.ladders).toEqual([]);
    expect(top.obstacles).toEqual([]);
    expect(top.orb).toBeNull();
  });

  it("generates nothing above the summit", () => {
    const endlessKinds = { platforms: 0, ladders: 0, obstacles: 0, orbs: 0 };
    for (let i = summit + 1; i <= summit + 30; i++) {
      const open = floorGeometry(endless, i);
      endlessKinds.platforms += open.platforms.length;
      endlessKinds.ladders += open.ladders.length;
      endlessKinds.obstacles += open.obstacles.length;
      endlessKinds.orbs += open.orb ? 1 : 0;
      expect(floorGeometry(capped, i)).toEqual({ platforms: [], ladders: [], obstacles: [], orb: null });
    }
    // Positive fixture: every guard had something real to remove.
    for (const n of Object.values(endlessKinds)) expect(n).toBeGreaterThan(0);

    const high = platformsNearY(capped, floorHeight(capped, summit), floorHeight(capped, summit + 10));
    expect(high.every((p) => p.y <= floorHeight(capped, summit))).toBe(true);
  });
});

describe("stepMatch finishes a climber at the goal", () => {
  it("a bot climbing a level tower finishes on the first tick its feet reach the goal", () => {
    const tower = level("finish-run", { difficulty: 0.2, powerUpChance: 0.1 });
    const goalM = floorHeight(tower, 6) + 2;
    const t = { ...tower, goalM };
    const live = createMatch({ seed: "finish-run", mode: "solo", tower: t, playerIds: ["bot"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);

    const ys: number[] = [];
    while (live.phase === "climb" && live.tick < 20_000) {
      stepMatch(live, { bot: botInput(live.players[0], t, live.tick) }, DEFAULT_SIM_CONFIG);
      ys.push(live.players[0].y);
    }
    const p = live.players[0];
    expect(p.status).toBe("finished");
    expect(live.phase).toBe("finished");
    expect(live.winnerId).toBe("bot");
    // Climb ticks are 1-based: ys[k] is the position after tick k + 1.
    const firstAtGoal = ys.findIndex((y) => y >= goalM) + 1;
    expect(firstAtGoal).toBeGreaterThan(30);
    expect(p.finishedTick).toBe(firstAtGoal);
    expect(live.tick).toBe(firstAtGoal);
  });

  /** A climber in the air above the goal whose fall-death line is above them. */
  function doomedAboveGoal(goalM: number | undefined): MatchState {
    const tower = level("finish-first", { goalM, fallDeathBelowPeakM: 5 });
    const live = createMatch({ seed: "finish-first", mode: "solo", tower, playerIds: ["p"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    const p = live.players[0];
    p.y = 41;
    p.peakY = 60;
    p.vy = 0;
    p.onGround = false;
    stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    return live;
  }

  it("decides the finish before the death line on the same tick", () => {
    // Positive fixture: without a goal this exact state is eliminated.
    const endless = doomedAboveGoal(undefined);
    expect(endless.players[0].status).toBe("eliminated");

    const lvl = doomedAboveGoal(40);
    expect(lvl.players[0].status).toBe("finished");
    expect(lvl.players[0].finishedTick).toBe(lvl.tick);
    expect(lvl.winnerId).toBe("p");
  });

  it("does not finish a climber below the goal", () => {
    const live = doomedAboveGoal(45);
    expect(live.players[0].status).toBe("eliminated");
  });
});
