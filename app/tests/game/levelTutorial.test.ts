/**
 * Level tutorials (src/game/levels/tutorial.ts): every demo must show what its
 * caption says, played through the real engine.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_DEMO_TICKS,
  createTutorialDemo,
  tutorialInfo,
  tutorialTopicsFor,
  type TutorialDemo,
  type TutorialTopic,
} from "../../src/game/levels/tutorial";
import { levelSpec } from "../../src/game/levels/levelSpec";
import { SEASON_1 } from "../../src/game/levels/season";
import { CONCRETE_POWER_UP_TYPES, POWER_UP_TYPES } from "../../src/game/powerups";
import { floorHeight } from "../../src/game/towers";
import type { PowerUpType } from "../../src/game/types";

interface Trace {
  ticks: number;
  wrapTick: number | null;
  firstLadderTick: number | null;
  stepAt: Map<number, number>;
  maxY: number;
  everOnLadder: boolean;
  thrusted: boolean;
  pickupTick: number | null;
  /** hazardY per tick, from GO. */
  lava: number[];
  demo: TutorialDemo;
}

function play(topic: TutorialTopic): Trace {
  const demo = createTutorialDemo(topic);
  const p0 = demo.state.players[0];
  const t: Trace = {
    ticks: 0,
    wrapTick: null,
    firstLadderTick: null,
    stepAt: new Map([[0, 0]]),
    maxY: p0.y,
    everOnLadder: false,
    thrusted: false,
    pickupTick: null,
    lava: [demo.state.hazardY],
    demo,
  };
  let lastX = p0.x;
  const width = demo.state.tower.widthM;
  // The done predicate must not already hold at the start.
  expect(demo.done).toBe(false);
  expect(demo.stepIndex).toBe(0);
  while (!demo.done) {
    demo.step();
    t.ticks += 1;
    const p = demo.state.players[0];
    if (t.wrapTick === null && Math.abs(p.x - lastX) > width / 2) t.wrapTick = t.ticks;
    lastX = p.x;
    if (p.onLadder && t.firstLadderTick === null) t.firstLadderTick = t.ticks;
    t.everOnLadder ||= p.onLadder;
    t.thrusted ||= p.jetpackThrusting;
    if (t.pickupTick === null && p.lastPickupTick !== null) t.pickupTick = t.ticks;
    if (!t.stepAt.has(demo.stepIndex)) t.stepAt.set(demo.stepIndex, t.ticks);
    t.maxY = Math.max(t.maxY, p.y);
    t.lava.push(demo.state.hazardY);
    if (t.ticks > MAX_DEMO_TICKS + 10) throw new Error(`${topic} never ended`);
  }
  expect(demo.state.players[0].status).toBe("climbing");
  expect(t.ticks).toBeLessThan(MAX_DEMO_TICKS);
  return t;
}

describe("tutorialTopicsFor", () => {
  it("plays the basics before level 1 only", () => {
    expect(tutorialTopicsFor(1, null)).toEqual(["basics"]);
    expect(tutorialTopicsFor(2, null)).toEqual([]);
    expect(tutorialTopicsFor(9, null)).toEqual([]);
  });

  it("plays each season 1 power-up demo on the level that introduces it", () => {
    let checked = 0;
    for (const unlock of SEASON_1.powerUpUnlocks) {
      const spec = levelSpec(SEASON_1, unlock.level);
      expect(spec.introPowerUp).toBe(unlock.type);
      expect(tutorialTopicsFor(unlock.level, spec.introPowerUp)).toEqual([unlock.type]);
      checked += 1;
    }
    expect(checked).toBe(POWER_UP_TYPES.length);
    // A level with no new power-up has nothing to show.
    expect(tutorialTopicsFor(5, levelSpec(SEASON_1, 5).introPowerUp)).toEqual([]);
  });
});

describe("basics demo", () => {
  const t = play("basics");

  it("walks off one edge and comes back on the other before climbing", () => {
    expect(t.wrapTick).not.toBeNull();
    expect(t.firstLadderTick).not.toBeNull();
    expect(t.wrapTick!).toBeLessThan(t.firstLadderTick!);
  });

  it("captions crossing sides until the first ladder, then climbing", () => {
    expect(tutorialInfo("basics").steps.map((s) => s.title)).toEqual(["Cross sides", "Climb ladders"]);
    // The caption moves on the tick after the grab it describes.
    expect(t.stepAt.get(1)).toBe(t.firstLadderTick! + 1);
  });

  it("climbs two floors", () => {
    expect(t.maxY).toBeGreaterThanOrEqual(floorHeight(t.demo.state.tower, 2));
  });

  it("has no orbs and no lava", () => {
    expect(t.demo.state.powerUps).toEqual([]);
    // The lava never leaves its start below the base.
    expect(Math.max(...t.lava.slice(1))).toBeLessThan(0);
  });
});

describe.each(POWER_UP_TYPES)("%s demo", (type: PowerUpType) => {
  const t = play(type);
  const p = t.demo.state.players[0];

  it("grabs its one orb, then captions the power-up", () => {
    expect(t.demo.state.powerUps.map((o) => [o.type, o.collected])).toEqual([[type, true]]);
    expect(t.pickupTick).not.toBeNull();
    // The caption moves on the tick after the pickup it describes.
    expect(t.stepAt.get(1)).toBe(t.pickupTick! + 1);
    expect(tutorialInfo(type).heading).toMatch(/^New power-up: /);
  });

  it("uses the power-up it grabbed", () => {
    if (type === "random") {
      expect(CONCRETE_POWER_UP_TYPES).toContain(p.lastPickupType);
      expect(p.lastPickupType).not.toBe("random");
    } else {
      expect(p.lastPickupType).toBe(type);
    }
  });
});

describe("power-up demos show the effect", () => {
  it("super-jump rises a floor without a ladder", () => {
    const t = play("super-jump");
    expect(t.everOnLadder).toBe(false);
    expect(t.maxY).toBeGreaterThan(floorHeight(t.demo.state.tower, 1));
  });

  it("jetpack thrusts up a floor without a ladder", () => {
    const t = play("jetpack");
    expect(t.thrusted).toBe(true);
    expect(t.everOnLadder).toBe(false);
    expect(t.maxY).toBeGreaterThan(floorHeight(t.demo.state.tower, 1));
  });

  it.each(["rapid-climb", "sprint-burst", "giant"] as const)("%s climbs a ladder with it", (type) => {
    const t = play(type);
    expect(t.firstLadderTick).not.toBeNull();
    expect(t.firstLadderTick!).toBeGreaterThan(t.pickupTick!);
  });

  it("slow-lava slows the rising lava", () => {
    const t = play("slow-lava");
    const k = t.pickupTick!;
    const before = t.lava[k] - t.lava[k - 10];
    const after = t.lava[k + 20] - t.lava[k + 10];
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before * 0.8);
  });

  it("harden-lava stops the lava", () => {
    const t = play("harden-lava");
    const k = t.pickupTick!;
    expect(t.lava[k] - t.lava[k - 10]).toBeGreaterThan(0);
    expect(t.lava[k + 30]).toBe(t.lava[k + 5]);
  });

  it("random rolls the same power-up every time", () => {
    const a = play("random").demo.state.players[0].lastPickupType;
    const b = play("random").demo.state.players[0].lastPickupType;
    expect(a).toBe(b);
  });
});
