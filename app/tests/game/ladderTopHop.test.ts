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
  LADDER_JUMP_SPEED_FRAC,
  LADDER_TOP_HOP_AIR_SPEED_FRAC,
  LADDER_TOP_HOP_WINDOW_M,
  floorHeight,
  ladderHangs,
  ladderHasShortTop,
  laddersForFloor,
  summitFloor,
} from "../../src/game/towers";
import { SEASON_1 } from "../../src/game/levels/season";
import { levelSpec, levelTower } from "../../src/game/levels/levelSpec";
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
        const stepM = t.maxClimbSpeed / 30;
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
    expect(p.vy).toBe(ref!.tower.jumpSpeed * LADDER_JUMP_SPEED_FRAC);
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
      expect(air.vx).toBe(ref!.tower.moveSpeed * LADDER_TOP_HOP_AIR_SPEED_FRAC);
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
