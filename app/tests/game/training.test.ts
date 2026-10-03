/**
 * First-run training (src/game/levels/training.ts): each goal is met by the
 * action its caption asks for, played through the real engine, and not by
 * anything else.
 */

import { describe, expect, it } from "vitest";

import {
  TRAINING_GOALS,
  TRAINING_SUMMIT_FLOOR,
  WALK_GOAL_M,
  createTraining,
  type Training,
  type TrainingGoalId,
} from "../../src/game/levels/training";
import { createRouteBot } from "../../src/game/levels/routeBot";
import { isPowerUpActive, POWER_UP_SPECS } from "../../src/game/powerups";
import { floorIndexAt, platformsForFloor } from "../../src/game/towers";
import { TICK_HZ, type PlayerInput } from "../../src/game/types";

const IDLE: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const goal = (t: Training): TrainingGoalId => TRAINING_GOALS[t.goalIndex].id;

/** Step with `input` until the goal changes or `max` ticks pass. Returns ticks run. */
function runUntilGoalChanges(t: Training, input: (t: Training) => PlayerInput, max = 60 * TICK_HZ): number {
  const start = t.goalIndex;
  let n = 0;
  while (t.goalIndex === start && !t.done && n < max) {
    t.step(input(t));
    n += 1;
  }
  return n;
}

/** Hold `input` for `ticks` and report whether the goal moved. */
function holds(t: Training, input: PlayerInput, ticks: number): boolean {
  const start = t.goalIndex;
  for (let i = 0; i < ticks; i++) t.step(input);
  return t.goalIndex !== start;
}

function towardOrb(t: Training): PlayerInput {
  const p = t.state.players[0];
  const orb = t.state.powerUps.find((o) => !o.collected);
  if (!orb) throw new Error("no orb to walk to");
  return { ...IDLE, moveX: orb.x > p.x ? 1 : -1 };
}

/** Taps jump every few ticks (jump is edge-triggered). */
const tapJump = (t: Training): PlayerInput => ({ ...IDLE, jump: t.state.tick % 8 < 2 });

function routeBotInput() {
  const bot = createRouteBot();
  return (t: Training) => bot(t.state.players[0], t.state.tower, t.state.tick);
}

/** Walk, jump and climb: the training at the start of "grab". */
function trainedToGrab(): Training {
  const t = createTraining();
  runUntilGoalChanges(t, () => ({ ...IDLE, moveX: 1 }));
  runUntilGoalChanges(t, () => ({ ...IDLE, jump: true }));
  runUntilGoalChanges(t, routeBotInput());
  expect(goal(t)).toBe("grab");
  return t;
}

describe("training", () => {
  it("starts on the first goal with nothing met", () => {
    const t = createTraining();
    expect(t.goalIndex).toBe(0);
    expect(t.done).toBe(false);
    expect(t.state.phase).toBe("climb");
    expect(t.state.powerUps).toEqual([]);
    expect(TRAINING_GOALS.map((g) => g.id)).toEqual(["walk", "jump", "climb", "grab", "use", "summit"]);
  });

  it("standing still meets nothing", () => {
    const t = createTraining();
    expect(holds(t, IDLE, 10 * TICK_HZ)).toBe(false);
    expect(goal(t)).toBe("walk");
  });

  it("walk: met after walking WALK_GOAL_M, not on the first step", () => {
    const t = createTraining();
    const x0 = t.state.players[0].x;
    const ticks = runUntilGoalChanges(t, () => ({ ...IDLE, moveX: -1 }));
    expect(goal(t)).toBe("jump");
    expect(ticks).toBeGreaterThan(1);
    const moved = Math.abs(t.state.players[0].x - x0);
    expect(Math.min(moved, t.state.tower.widthM - moved)).toBeGreaterThanOrEqual(WALK_GOAL_M - 0.5);
  });

  it("jump: walking does not meet it, a jump does", () => {
    const t = createTraining();
    runUntilGoalChanges(t, () => ({ ...IDLE, moveX: 1 }));
    expect(goal(t)).toBe("jump");
    expect(holds(t, { ...IDLE, moveX: 1 }, 3 * TICK_HZ)).toBe(false);
    expect(holds(t, IDLE, TICK_HZ)).toBe(false);
    // Land first, so the jump starts from the ground.
    expect(t.state.players[0].onGround).toBe(true);
    expect(holds(t, { ...IDLE, jump: true }, 2)).toBe(true);
    expect(goal(t)).toBe("climb");
    expect(t.state.players[0].vy).toBeGreaterThan(0);
  });

  it("jump: going up a ladder leaves the ground but is not a jump", () => {
    const t = createTraining();
    runUntilGoalChanges(t, () => ({ ...IDLE, moveX: 1 }));
    expect(goal(t)).toBe("jump");
    const bot = routeBotInput();
    let climbedTicks = 0;
    for (let i = 0; i < 8 * TICK_HZ && t.goalIndex === 1; i++) {
      t.step({ ...bot(t), jump: false });
      if (t.state.players[0].onLadder && !t.state.players[0].onGround) climbedTicks += 1;
    }
    // The fixture really climbed, off the ground, with no jump pressed.
    expect(climbedTicks).toBeGreaterThan(0);
    expect(goal(t)).toBe("jump");
  });

  it("climb: jumping about on the base floor does not meet it, a ladder does", () => {
    const t = createTraining();
    runUntilGoalChanges(t, () => ({ ...IDLE, moveX: 1 }));
    runUntilGoalChanges(t, () => ({ ...IDLE, jump: true }));
    expect(goal(t)).toBe("climb");
    let moved = false;
    for (let i = 0; i < 4 * TICK_HZ; i++) {
      t.step({ ...IDLE, moveX: -1, jump: i % 10 === 0 });
      moved ||= t.goalIndex !== 2;
    }
    expect(moved).toBe(false);

    let onLadder = false;
    const bot = routeBotInput();
    runUntilGoalChanges(t, (tr) => {
      onLadder ||= tr.state.players[0].onLadder;
      return bot(tr);
    });
    expect(onLadder).toBe(true);
    expect(goal(t)).toBe("grab");
    const p = t.state.players[0];
    expect(floorIndexAt(t.state.tower, p.y + 1e-6)).toBeGreaterThanOrEqual(1);
    expect(p.onGround && !p.onLadder).toBe(true);
  });

  it("grab: places one Super Jump orb on the climber's floor and platform, out of reach until they walk to it", () => {
    const t = trainedToGrab();
    expect(t.orbsPlaced).toBe(1);
    const p = t.state.players[0];
    const [orb, ...rest] = t.state.powerUps;
    expect(rest).toEqual([]);
    expect(orb.type).toBe("super-jump");
    expect(orb.collected).toBe(false);
    const floor = floorIndexAt(t.state.tower, p.y + 1e-6);
    expect(orb.floorIndex).toBe(floor);
    const piece = platformsForFloor(t.state.tower, floor).find((pl) => p.x >= pl.x0 && p.x <= pl.x1);
    expect(piece).toBeDefined();
    expect(orb.x).toBeGreaterThanOrEqual(piece!.x0);
    expect(orb.x).toBeLessThanOrEqual(piece!.x1);
    expect(Math.abs(orb.x - p.x)).toBeGreaterThanOrEqual(3);

    expect(holds(t, IDLE, 2 * TICK_HZ)).toBe(false);
    expect(isPowerUpActive(t.state.players[0], "super-jump", t.state.tick)).toBe(false);

    runUntilGoalChanges(t, towardOrb, 10 * TICK_HZ);
    expect(goal(t)).toBe("use");
    // Touching it is the activation.
    expect(isPowerUpActive(t.state.players[0], "super-jump", t.state.tick)).toBe(true);
    expect(t.state.players[0].lastPickupType).toBe("super-jump");
  });

  it("use: a Super Jump that runs out unused places a fresh orb and goes back to grab", () => {
    const t = trainedToGrab();
    runUntilGoalChanges(t, towardOrb, 10 * TICK_HZ);
    expect(goal(t)).toBe("use");
    const ticks = runUntilGoalChanges(t, () => IDLE, 2 * POWER_UP_SPECS["super-jump"].durationSeconds * TICK_HZ);
    expect(goal(t)).toBe("grab");
    expect(ticks).toBeGreaterThanOrEqual((POWER_UP_SPECS["super-jump"].durationSeconds - 1) * TICK_HZ);
    expect(t.orbsPlaced).toBe(2);
    expect(t.state.powerUps.filter((o) => !o.collected)).toHaveLength(1);

    // The new orb works like the first.
    runUntilGoalChanges(t, towardOrb, 10 * TICK_HZ);
    expect(goal(t)).toBe("use");
    runUntilGoalChanges(t, tapJump, 5 * TICK_HZ);
    expect(goal(t)).toBe("summit");
  });

  it("use: met by jumping with it, then the summit diamond ends training", () => {
    const t = trainedToGrab();
    runUntilGoalChanges(t, towardOrb, 10 * TICK_HZ);
    runUntilGoalChanges(t, tapJump, 5 * TICK_HZ);
    expect(goal(t)).toBe("summit");

    // Idle on the summit goal meets nothing.
    expect(holds(t, IDLE, TICK_HZ)).toBe(false);
    runUntilGoalChanges(t, routeBotInput(), 90 * TICK_HZ);
    expect(t.done).toBe(true);
    expect(t.goalIndex).toBe(TRAINING_GOALS.length);
    const p = t.state.players[0];
    expect(p.status).toBe("finished");
    expect(floorIndexAt(t.state.tower, p.y + 1e-6)).toBe(TRAINING_SUMMIT_FLOOR);

    // Done is final: further steps change nothing.
    const tick = t.state.tick;
    t.step({ ...IDLE, moveX: 1 });
    expect(t.state.tick).toBe(tick);
  });

  it("cannot be lost: no lava, no fall death", () => {
    const t = createTraining();
    for (let i = 0; i < 60 * TICK_HZ; i++) t.step(IDLE);
    expect(t.state.players[0].status).toBe("climbing");
    expect(t.state.hazardY).toBeLessThan(t.state.players[0].y);
  });
});
