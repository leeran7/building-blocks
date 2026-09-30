/**
 * A level tower has a goal height (`tower.goalM`). The tower is capped by a
 * solid summit floor, the first floor at or above the goal, with nothing on or
 * above it. A glowing diamond sits on the summit floor, and stepMatch finishes
 * a climber who touches it, before the death line on the same tick. Endless
 * towers have no goalM and are pinned bit-identical by freeStackGolden.test.ts.
 */

import { describe, expect, it } from "vitest";

import { createMatch, stepMatch, DEFAULT_SIM_CONFIG, levelTimeLimitTicks } from "../../src/game/simulation";
import {
  applyRunSeed,
  floorHeight,
  laddersForFloor,
  platformsForFloor,
  platformsNearY,
  summitDiamond,
  summitFloor,
  touchesSummitDiamond,
  SUMMIT_DIAMOND_GRAB_X,
  SUMMIT_DIAMOND_WALK_M,
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

describe("stepMatch finishes a climber at the summit diamond", () => {
  it("a bot climbing a level tower finishes on the first tick it touches the diamond", () => {
    const tower = level("finish-run", { difficulty: 0.2, powerUpChance: 0.1 });
    const goalM = floorHeight(tower, 6) + 2;
    const t = { ...tower, goalM };
    const diamond = summitDiamond(t)!;
    const live = createMatch({ seed: "finish-run", mode: "solo", tower: t, playerIds: ["bot"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);

    const at: { x: number; y: number }[] = [];
    while (live.phase === "climb" && live.tick < 20_000) {
      stepMatch(live, { bot: botInput(live.players[0], t, live.tick) }, DEFAULT_SIM_CONFIG);
      at.push({ x: live.players[0].x, y: live.players[0].y });
    }
    const p = live.players[0];
    expect(p.status).toBe("finished");
    expect(live.phase).toBe("finished");
    expect(live.winnerId).toBe("bot");
    // Climb ticks are 1-based: at[k] is the position after tick k + 1.
    const firstTouch = at.findIndex((q) => touchesSummitDiamond(diamond, q.x, q.y, t.widthM)) + 1;
    const firstAtGoal = at.findIndex((q) => q.y >= goalM) + 1;
    expect(firstAtGoal).toBeGreaterThan(30);
    // Reaching the goal height is no longer the finish: the run along the top is.
    expect(firstTouch).toBeGreaterThan(firstAtGoal + 30);
    expect(p.finishedTick).toBe(firstTouch);
    expect(live.tick).toBe(firstTouch);
    expect(p.y).toBeCloseTo(diamond.floorY, 5);
  });

  /** A falling climber whose fall-death line is above them, at `x` just over the summit. */
  function doomedOnSummit(goalM: number | undefined, dx: number): MatchState {
    const base = level("finish-first", { fallDeathBelowPeakM: 5 });
    const tower = goalM === undefined ? base : { ...base, goalM };
    const summitY = goalM === undefined ? 41 : summitDiamond(tower)!.floorY;
    const x = goalM === undefined ? 50 : summitDiamond(tower)!.x + dx;
    const live = createMatch({ seed: "finish-first", mode: "solo", tower, playerIds: ["p"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    const p = live.players[0];
    p.x = x;
    p.y = summitY + 1;
    p.peakY = summitY + 20;
    p.vy = 0;
    p.onGround = false;
    stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    return live;
  }

  it("decides the finish before the death line on the same tick", () => {
    // Positive fixture: without a goal this exact state is eliminated.
    const endless = doomedOnSummit(undefined, 0);
    expect(endless.players[0].status).toBe("eliminated");

    const lvl = doomedOnSummit(40, 0);
    expect(lvl.players[0].status).toBe("finished");
    expect(lvl.players[0].finishedTick).toBe(lvl.tick);
    expect(lvl.winnerId).toBe("p");
  });

  it("does not finish a climber above the goal height who is away from the diamond", () => {
    const live = doomedOnSummit(40, 10);
    expect(live.players[0].status).toBe("eliminated");
  });
});

describe("summitDiamond", () => {
  it("is null on an endless tower", () => {
    expect(summitDiamond(buildFreeTower())).toBeNull();
  });

  it("sits on the summit floor a fixed walk from the ladder that reaches it", () => {
    for (const seed of ["d-1", "d-2", "d-3", "d-4", "d-5", "d-6"]) {
      const t = level(seed, { difficulty: 0.5, goalM: 150 });
      const summit = summitFloor(t)!;
      const d = summitDiamond(t)!;
      expect(d.floorY).toBe(floorHeight(t, summit));
      expect(d.y).toBeGreaterThan(d.floorY);
      const from = laddersForFloor(t, summit - 1)[0].x;
      const gap = Math.abs(d.x - from) % t.widthM;
      expect(Math.min(gap, t.widthM - gap)).toBeCloseTo(SUMMIT_DIAMOND_WALK_M, 6);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThan(t.widthM);
    }
  });

  it("is never touched from the ladder below the summit", () => {
    const t = level("d-below", { difficulty: 0.5, goalM: 150 });
    const d = summitDiamond(t)!;
    expect(touchesSummitDiamond(d, d.x, d.floorY, t.widthM)).toBe(true);
    expect(touchesSummitDiamond(d, d.x, d.floorY - 1, t.widthM)).toBe(false);
    expect(touchesSummitDiamond(d, d.x + SUMMIT_DIAMOND_GRAB_X + 0.01, d.floorY, t.widthM)).toBe(false);
  });
});

describe("a level's clock ends the climb when it runs out", () => {
  const tower = level("clock-run", { difficulty: 0.2, powerUpChance: 0.1 });
  const goalM = floorHeight(tower, 6) + 2;

  function climb(timeLimitTicks?: number): MatchState {
    const t: TowerSpec = { ...tower, goalM, ...(timeLimitTicks === undefined ? {} : { timeLimitTicks }) };
    const live = createMatch({ seed: "clock-run", mode: "solo", tower: t, playerIds: ["bot"] });
    while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    while (live.phase === "climb" && live.tick < 20_000) {
      stepMatch(live, { bot: botInput(live.players[0], t, live.tick) }, DEFAULT_SIM_CONFIG);
    }
    return live;
  }

  const finishTick = climb().players[0].finishedTick!;

  it("still finishes a climber who reaches the goal on the clock's last tick", () => {
    expect(finishTick).toBeGreaterThan(30);
    const live = climb(finishTick);
    expect(live.players[0].status).toBe("finished");
    expect(live.players[0].finishedTick).toBe(finishTick);
  });

  it("puts a climber out on the tick the clock runs out", () => {
    const limit = finishTick - 10;
    const live = climb(limit);
    expect(live.players[0].status).toBe("eliminated");
    expect(live.players[0].finishedTick).toBe(limit);
    expect(live.tick).toBe(limit);
    expect(live.phase).toBe("finished");
  });

  it("refuses a clock that is not a positive whole number of ticks", () => {
    for (const bad of [0, -30, 1.5, Number.NaN]) {
      expect(() => levelTimeLimitTicks({ ...tower, timeLimitTicks: bad })).toThrow(RangeError);
      expect(() => climb(bad)).toThrow(RangeError);
    }
    expect(levelTimeLimitTicks(tower)).toBeNull();
  });
});
