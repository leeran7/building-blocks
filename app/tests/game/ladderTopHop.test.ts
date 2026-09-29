/**
 * Jumping off a ladder near its top (the top hop) and the eased short stop.
 *
 * Leeran 2026-09-29: "ladders should allow you to jump off of it easier & land
 * on the floor, ease up the short stop a little bit." Every case here drives
 * the real stepMatch on real season-1 level towers:
 *   - a jump pressed a beat before a short top's hold still lands on the floor
 *     above (a plain ladder jump dropped the climber a whole floor), and a held
 *     climb never snaps back onto the same ladder on the way;
 *   - a jump off the top with a direction held lands on the floor beside the
 *     ladder (full walk speed in the air carried it into the next gap);
 *   - a jump lower down the ladder is unchanged: plain launch, full air speed;
 *   - the deepest short top of the season stops closer to the floor, so the
 *     plain jump from its hold clears the floor by more.
 */

import { describe, it, expect } from "vitest";
import { createMatch, stepMatch, DEFAULT_SIM_CONFIG, type SimConfig } from "../../src/game/simulation";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import {
  ARCHETYPE_TUNING,
  LADDER_TOP_HOP_WINDOW_M,
  MAX_LADDER_TOP_GAP_FRAC,
  applyRunSeed,
  floorHeight,
  ladderFloorClearanceM,
  ladderJumpSpeed,
  topHopSpeed,
  ladderHangs,
  ladderHasShortTop,
  laddersForFloor,
  summitFloor,
} from "../../src/game/towers";
import { SEASON_1 } from "../../src/game/levels/season";
import { levelSpec, levelTower } from "../../src/game/levels/levelSpec";
import { buildFreeTower } from "../../src/game/freeStack";
import { grantPowerUp } from "../../src/game/powerups";
import { TICK_DT } from "../../src/game/types";
import type { MatchState, PlayerInput, PlayerState, TowerSpec } from "../../src/game/types";

const IDLE: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const UP: PlayerInput = { ...IDLE, climbY: 1 };

/** Lava crawls, so these motion checks are never cut short by the hazard. */
const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};

/** Past short tops' intro (L21) and their full share (L40), up to the cap. */
const LEVELS = [45, 150, 300] as const;
/** Air ticks allowed before a jump counts as never landing. */
const MAX_AIR_TICKS = 240;
/** Climb ticks allowed to get from the floor to a ladder's top. */
const MAX_CLIMB_TICKS = 400;

interface LadderRef {
  tower: TowerSpec;
  level: number;
  floor: number;
  slot: number;
}

function tower(level: number): TowerSpec {
  return levelTower(levelSpec(SEASON_1, level));
}

/** Ladders leaving floors whose next floor is still under the goal. */
function laddersBelowGoal(level: number, pick: (t: TowerSpec, i: number, slot: number) => boolean): LadderRef[] {
  const t = tower(level);
  const summit = summitFloor(t)!;
  const out: LadderRef[] = [];
  for (let floor = 1; floor + 1 < summit; floor++) {
    laddersForFloor(t, floor).forEach((_, slot) => {
      if (pick(t, floor, slot)) out.push({ tower: t, level, floor, slot });
    });
  }
  return out;
}

function match(t: TowerSpec): MatchState {
  const live = createMatch({ seed: t.seed, mode: "solo", tower: t, playerIds: ["p"] });
  live.phase = "climb";
  live.tick = 0;
  return live;
}

function step(live: MatchState, input: PlayerInput): PlayerState {
  stepMatch(live, { p: input }, SLOW);
  return live.players[0];
}

/** A climber attached to ladder `ref` with feet `below` metres under its top rung. */
function onLadder(ref: LadderRef, below: number): MatchState {
  const l = laddersForFloor(ref.tower, ref.floor)[ref.slot]!;
  const live = match(ref.tower);
  const p = live.players[0];
  Object.assign(p, {
    x: l.x,
    y: l.y1 - below,
    onGround: false,
    onLadder: true,
    ladderIx: ref.floor,
    ladderSlot: ref.slot,
    peakY: l.y1 - below,
  });
  return live;
}

/** Hold `input` until the climber lands or grabs a ladder. */
function flyUntilSettled(live: MatchState, input: PlayerInput, onAir?: (p: PlayerState) => void): PlayerState {
  let p = live.players[0];
  for (let t = 0; t < MAX_AIR_TICKS; t++) {
    p = step(live, input);
    if (p.onGround || p.onLadder) break;
    onAir?.(p);
  }
  return p;
}

describe("top hop: a jump pressed just before a short top's hold", () => {
  it("still lands on the floor above, and a held climb never re-grabs that ladder", () => {
    let checked = 0;
    for (const level of LEVELS) {
      for (const ref of laddersBelowGoal(level, ladderHasShortTop)) {
        const t = ref.tower;
        const l = laddersForFloor(t, ref.floor)[ref.slot]!;
        const live = match(t);
        const p = live.players[0];
        // Walk-up start on the floor: the climb's 0.3 m steps land wherever the
        // floor gap puts them, so the press point is off any fixed lattice.
        Object.assign(p, { x: l.x, y: floorHeight(t, ref.floor), onGround: true, peakY: floorHeight(t, ref.floor) });
        // Climb until the next step would put the feet within two steps of
        // the hold: the press lands 0.6-0.9 m under the top rung, a beat early.
        const stepM = t.maxClimbSpeed * TICK_DT;
        for (let k = 0; k < MAX_CLIMB_TICKS && !(p.onLadder && l.y1 - p.y <= 3 * stepM); k++) step(live, UP);
        expect(p.onLadder).toBe(true);
        const early = l.y1 - p.y;
        expect(early).toBeGreaterThan(2 * stepM);
        expect(early).toBeLessThanOrEqual(LADDER_TOP_HOP_WINDOW_M);

        const jumped = step(live, { ...UP, jump: true });
        expect(jumped.onLadder).toBe(false);
        const landed = flyUntilSettled(live, UP, (air) => {
          // Joystick still leaning up: never back on this ladder mid-air.
          expect(air.onLadder).toBe(false);
        });
        expect(landed.onLadder).toBe(false);
        expect(landed.onGround).toBe(true);
        expect(landed.y).toBe(floorHeight(t, ref.floor + 1));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("top hop: jumping off the top with a direction held", () => {
  const cases = (dir: -1 | 1, climbY: 0 | 1) => ({ ...IDLE, moveX: dir, climbY });

  it("detaches sideways and lands on the floor beside the ladder, not in the next gap", () => {
    let checked = 0;
    let shortTops = 0;
    for (const level of LEVELS) {
      const refs = laddersBelowGoal(level, (t, i, slot) => !ladderHangs(t, i, slot));
      for (const ref of refs) {
        const short = ladderHasShortTop(ref.tower, ref.floor, ref.slot);
        // From a short top's hold, or (a full ladder steps off at its top by
        // itself) a jump pressed 0.47 m under the top rung.
        const below = short ? 0 : 0.47;
        for (const dir of [-1, 1] as const) {
          for (const climbY of [0, 1] as const) {
            const live = onLadder(ref, below);
            const l = laddersForFloor(ref.tower, ref.floor)[ref.slot]!;
            step(live, { ...cases(dir, climbY), jump: true });
            const p = flyUntilSettled(live, cases(dir, climbY));
            const where = `L${ref.level} floor ${ref.floor} slot ${ref.slot} dir ${dir} up ${climbY}`;
            expect(p.onGround, where).toBe(true);
            expect(p.y, where).toBeGreaterThanOrEqual(floorHeight(ref.tower, ref.floor + 1));
            // Wrap-safe sideways distance travelled from the ladder.
            const w = ref.tower.widthM;
            const dx = Math.min(Math.abs(p.x - l.x), w - Math.abs(p.x - l.x));
            expect(dx, where).toBeGreaterThan(1);
            // And inside the band platformsForFloor keeps solid either side of
            // an arriving ladder (ladderGrabRadius + 2 m): full walk speed in
            // the air drifted past it.
            expect(dx, where).toBeLessThanOrEqual(ref.tower.ladderGrabRadius + 2);
            checked++;
            if (short) shortTops++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(shortTops).toBeGreaterThan(10);
  });
});

describe("top hop is only for the top of a ladder", () => {
  it("a jump lower down the ladder is the plain ladder jump at full air speed", () => {
    const [ref] = laddersBelowGoal(150, (t, i, slot) => !ladderHangs(t, i, slot));
    expect(ref).toBeDefined();
    const below = LADDER_TOP_HOP_WINDOW_M + 2.13;
    const live = onLadder(ref!, below);
    let p = step(live, { ...IDLE, moveX: 1, jump: true });
    expect(p.onLadder).toBe(false);
    expect(p.vy).toBe(ladderJumpSpeed(ref!.tower));
    p = step(live, { ...IDLE, moveX: 1 });
    expect(p.vx).toBe(ref!.tower.moveSpeed);
  });

  it("a top hop steers at the reduced air speed until it lands", () => {
    const [ref] = laddersBelowGoal(150, ladderHasShortTop);
    expect(ref).toBeDefined();
    const live = onLadder(ref!, 0);
    step(live, { ...IDLE, moveX: 1, jump: true });
    let airTicks = 0;
    const p = flyUntilSettled(live, { ...IDLE, moveX: 1 }, (air) => {
      expect(air.vx).toBeGreaterThan(0);
      expect(air.vx).toBeLessThan(ref!.tower.moveSpeed);
      airTicks++;
    });
    expect(airTicks).toBeGreaterThan(3);
    expect(p.onGround).toBe(true);
    // Back on the floor: full walk speed again.
    expect(step(live, { ...IDLE, moveX: 1 }).vx).toBe(ref!.tower.moveSpeed);
  });
});

describe("eased short stop", () => {
  it("the season's deepest short top holds the climber closer to the floor, so its jump clears more", () => {
    const refs = laddersBelowGoal(300, ladderHasShortTop);
    expect(refs.length).toBeGreaterThan(0);
    const ref = refs[0]!;
    const t = ref.tower;
    const l = laddersForFloor(t, ref.floor)[ref.slot]!;
    const next = floorHeight(t, ref.floor + 1);
    const live = match(t);
    const p = live.players[0];
    Object.assign(p, { x: l.x, y: floorHeight(t, ref.floor), onGround: true, peakY: floorHeight(t, ref.floor) });
    for (let k = 0; k < MAX_CLIMB_TICKS; k++) step(live, UP);
    // Held at the stop, still on the ladder.
    expect(p.onLadder).toBe(true);
    const stop = next - p.y;
    expect(stop).toBeGreaterThan(0);
    // 60% of a ladder jump's 1.38 m rise (0.83 m); it was 70% (0.96 m).
    expect(stop).toBeLessThan(0.85);

    step(live, { ...UP, jump: true });
    let peak = p.y;
    const landed = flyUntilSettled(live, IDLE, (air) => {
      peak = Math.max(peak, air.y);
    });
    expect(landed.y).toBe(next);
    // Highest sampled tick clears the floor by 0.38 m (0.24 m at the old stop).
    expect(peak - next).toBeGreaterThan(0.3);
  });
});

// ── Hop exits and the drift band on every archetype ─────────────────────────

/** A short-top ladder on L150, and a match with the climber held at its top. */
function heldAtShortTop(): { live: MatchState; t: TowerSpec } {
  const [ref] = laddersBelowGoal(150, ladderHasShortTop);
  expect(ref).toBeDefined();
  return { live: onLadder(ref!, 0), t: ref!.tower };
}

describe("a top hop ends when the climber takes over the air", () => {
  it("jetpack thrust out of a hop steers at full walk speed", () => {
    const { live, t } = heldAtShortTop();
    const p = live.players[0];
    grantPowerUp(p, "jetpack", live.tick, t);
    step(live, { ...IDLE, moveX: 1, jump: true });
    expect(p.ladderTopHop).toBe(true);
    // Jump still held in the air: thrust.
    step(live, { ...IDLE, moveX: 1, jump: true });
    expect(p.jetpackThrusting).toBe(true);
    expect(step(live, { ...IDLE, moveX: 1, jump: true }).vx).toBe(t.moveSpeed);
    expect(p.onGround).toBe(false);
  });

  it("a super-jump air jump out of a hop steers at full walk speed", () => {
    const { live, t } = heldAtShortTop();
    const p = live.players[0];
    grantPowerUp(p, "super-jump", live.tick, t);
    step(live, { ...IDLE, moveX: 1, jump: true });
    const hopVx = step(live, { ...IDLE, moveX: 1 }).vx;
    expect(p.ladderTopHop).toBe(true);
    expect(hopVx).toBeLessThan(t.moveSpeed);
    // A fresh tap in the air is the air jump.
    step(live, { ...IDLE, moveX: 1, jump: true });
    expect(p.vy).toBeGreaterThan(ladderJumpSpeed(t));
    expect(step(live, { ...IDLE, moveX: 1 }).vx).toBe(t.moveSpeed);
    expect(p.onGround).toBe(false);
  });

  it("a hop that falls below the ladder's own floor is just a fall", () => {
    const { live, t } = heldAtShortTop();
    const p = live.players[0];
    step(live, { ...IDLE, moveX: 1, jump: true });
    expect(p.ladderTopHop).toBe(true);
    // Stand-in for a hop knocked off course: falling past the floor it left.
    Object.assign(p, { y: p.ladderTopHopFloorY - 0.137, vy: -6 });
    step(live, { ...IDLE, moveX: 1 });
    expect(p.onGround).toBe(false);
    expect(p.ladderTopHop).toBe(false);
    expect(step(live, { ...IDLE, moveX: 1 }).vx).toBe(t.moveSpeed);
  });
});

/** Every archetype's physics on a level-style tower with the deepest short tops the engine allows. */
function archetypeTowers(): Array<[string, TowerSpec]> {
  const rows: Array<[string, Partial<TowerSpec>]> = [
    ...Object.entries(ARCHETYPE_TUNING),
    ["free", {}],
  ];
  return rows.map(([name, tuning]) => {
    const base: TowerSpec = { ...applyRunSeed(buildFreeTower(), `hop-${name}`), ...tuning, difficulty: 0.6 };
    const plain = ladderJumpSpeed(base);
    const capGap = MAX_LADDER_TOP_GAP_FRAC * ((plain * plain) / (2 * base.gravity));
    return [name, { ...base, ladderTopGapM: capGap * 0.999, shortTopShare: 1 }];
  });
}

describe("top hop drift stays on the solid floor beside the ladder", () => {
  it("on every archetype, sprint-burst included, a held direction lands inside the band", () => {
    let checked = 0;
    let worst = 0;
    for (const [name, t] of archetypeTowers()) {
      const band = ladderFloorClearanceM(t);
      for (let floor = 1; floor < 16; floor++) {
        laddersForFloor(t, floor).forEach((_, slot) => {
          const short = ladderHasShortTop(t, floor, slot);
          // Longest airtimes: a plain launch just under a full top, and an
          // assisted launch from the bottom of the window under a short top.
          const below = short ? LADDER_TOP_HOP_WINDOW_M - 0.013 : 0.013;
          const l = laddersForFloor(t, floor)[slot]!;
          for (const sprint of [false, true]) {
            for (const dir of [-1, 1] as const) {
              const live = onLadder({ tower: t, level: 0, floor, slot }, below);
              if (sprint) grantPowerUp(live.players[0], "sprint-burst", live.tick, t);
              step(live, { ...IDLE, moveX: dir, jump: true });
              const p = flyUntilSettled(live, { ...IDLE, moveX: dir });
              const where = `${name} floor ${floor} slot ${slot} sprint ${sprint} dir ${dir}`;
              expect(p.onGround, where).toBe(true);
              expect(p.y, where).toBeGreaterThanOrEqual(floorHeight(t, floor + 1));
              const w = t.widthM;
              const dx = Math.min(Math.abs(p.x - l.x), w - Math.abs(p.x - l.x));
              worst = Math.max(worst, dx / band);
              expect(dx, where).toBeLessThan(band);
              checked++;
            }
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(100);
    // The worst case really pushes toward the band edge, so the check bites.
    expect(worst).toBeGreaterThan(0.8);
  });

  it("never launches a hop as fast as a standing jump, on any archetype or level", () => {
    const towers: TowerSpec[] = [
      ...archetypeTowers().map(([, t]) => t),
      tower(300),
      buildFreeTower(),
    ];
    for (const t of towers) {
      const plain = ladderJumpSpeed(t);
      const capGap = MAX_LADDER_TOP_GAP_FRAC * ((plain * plain) / (2 * t.gravity));
      expect(topHopSpeed(t, capGap + LADDER_TOP_HOP_WINDOW_M)).toBeLessThan(t.jumpSpeed);
    }
    expect(towers.length).toBe(Object.keys(ARCHETYPE_TUNING).length + 3);
  });
});
