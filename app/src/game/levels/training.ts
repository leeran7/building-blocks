/**
 * First-run training: a short, playable climb that teaches the controls.
 *
 * The level tutorials (tutorial.ts) are demos the player watches. Training is
 * the player's own climb on a small practice tower, driven by their input
 * through the same `stepMatch` a level uses, with one goal on screen at a
 * time. Each goal ends on something the engine reports, never on a timer:
 *
 *   walk    → moved a few metres along the floor
 *   jump    → left the ground on a jump
 *   climb   → stood on a higher floor than the one the goal started on
 *   grab    → touched the orb this goal placed (it activates on touch)
 *   use     → spent a Super Jump air jump, or reached a higher floor with it
 *   summit  → touched the summit diamond, which finishes the climb
 *
 * There is no lava and no fall death, so the climb cannot be lost. If the
 * Super Jump runs out before it is used, a fresh orb appears and the goal
 * goes back to "grab".
 *
 * Pure and deterministic (fixed seed), so tests drive it with scripted input.
 * Reads the engine only: nothing here changes what the simulation outputs.
 */

import {
  SUPER_JUMP_AIR_JUMPS,
  isPowerUpActive,
  superJumpChargesRemaining,
} from "../powerups";
import { createMatch, stepMatch, type SimConfig } from "../simulation";
import { applyRunSeed, floorHeight, floorIndexAt, platformsForFloor } from "../towers";
import { buildFreeTower } from "../freeStack";
import type { MatchState, PlayerInput, PlayerState, TowerSpec } from "../types";
import { NO_LAVA } from "./levelRun";

export type TrainingGoalId = "walk" | "jump" | "climb" | "grab" | "use" | "summit";

export interface TrainingGoal {
  id: TrainingGoalId;
  /** Short heading, e.g. "Jump". */
  title: string;
  /** What to do with the on-screen controls. */
  touch: string;
  /** What to do with a keyboard. */
  keys: string;
  /** Shown once the goal is met: what just happened, in one line. */
  done: string;
}

/** The goals, in the order the player meets them. */
export const TRAINING_GOALS: readonly TrainingGoal[] = [
  {
    id: "walk",
    title: "Walk",
    touch: "Hold ← or → (or push the stick) to walk. Walk off one edge and you come back on the other side.",
    keys: "Hold ← → or A D to walk. Walk off one edge and you come back on the other side.",
    done: "The tower wraps around, so every direction leads somewhere.",
  },
  {
    id: "jump",
    title: "Jump",
    touch: "Tap the jump button to leap. Jump over crates and across gaps in the floor.",
    keys: "Tap Space to leap. Jump over crates and across gaps in the floor.",
    done: "Jumps clear crates and gaps.",
  },
  {
    id: "climb",
    title: "Climb a ladder",
    touch: "Walk to a ladder, then hold ↑ climb (or push the stick up) to reach the next floor.",
    keys: "Walk to a ladder, then hold ↑ or W to climb to the next floor.",
    done: "Ladders are the fastest way up.",
  },
  {
    id: "grab",
    title: "Grab the orb",
    touch: "A glowing orb appeared on your floor. Walk into it.",
    keys: "A glowing orb appeared on your floor. Walk into it.",
    done: "Power-ups start the moment you touch them. The bar up top shows how long it lasts.",
  },
  {
    id: "use",
    title: "Super Jump",
    touch: "Tap jump, then tap it again in the air. You jump twice as high and can jump in mid-air.",
    keys: "Tap Space, then tap it again in the air. You jump twice as high and can jump in mid-air.",
    done: "Each power-up does something different, and they all run out.",
  },
  {
    id: "summit",
    title: "Reach the summit",
    touch: "Climb to the top floor and touch the diamond to finish.",
    keys: "Climb to the top floor and touch the diamond to finish.",
    done: "Every level ends at a diamond like this one.",
  },
];

export interface Training {
  readonly state: MatchState;
  readonly cfg: SimConfig;
  /** Index into TRAINING_GOALS of the goal on screen; TRAINING_GOALS.length once done. */
  readonly goalIndex: number;
  /** Every goal is met. */
  readonly done: boolean;
  /** Orbs placed so far (a Super Jump that runs out unused places another). */
  readonly orbsPlaced: number;
  /** Advance one tick with the player's input. A no-op once done. */
  step(input: PlayerInput): void;
}

export const TRAINING_SEED = "training";
/** The summit floor: one ladder, the power-up, then a last climb. */
export const TRAINING_SUMMIT_FLOOR = 4;
/** Walking this far (m) along the floor meets the walk goal. */
export const WALK_GOAL_M = 10;
/** The orb goes this far (m) from the climber along their floor. */
const ORB_OFFSET_M = 5;
/** Never closer than this (m), so the orb is never picked up where it appears. */
const ORB_MIN_OFFSET_M = 3;
/** Height (m) of the orb above its floor, as on generated towers. */
const ORB_HOVER_M = 3;
const PLAYER_ID = "you";
/** Slack (m) on "standing on a floor", for floating point. */
const FLOOR_EPS_M = 1e-6;

/**
 * The practice tower: the free tower's physics on a fixed seed with the
 * easiest layout, capped at TRAINING_SUMMIT_FLOOR, with no spawned orbs and
 * no fall death.
 */
export function trainingTower(): TowerSpec {
  const base: TowerSpec = {
    ...applyRunSeed(buildFreeTower(), TRAINING_SEED),
    difficulty: 0,
    powerUpChance: 0,
    allowedPowerUps: ["super-jump"],
    fallDeathBelowPeakM: Number.MAX_SAFE_INTEGER,
  };
  return { ...base, goalM: floorHeight(base, TRAINING_SUMMIT_FLOOR) };
}

export function createTraining(): Training {
  const tower = trainingTower();
  const cfg: SimConfig = { hazard: NO_LAVA };
  const state = createMatch({ seed: tower.seed, mode: "solo", tower, playerIds: [PLAYER_ID] });
  // Skip the 3-2-1: training starts on the move.
  while (state.phase === "countdown") stepMatch(state, {}, cfg);
  // Only the orbs training places: switch off the tower's own spawns.
  state.powerUps = [];
  state.powerUpFloorHi = Number.MAX_SAFE_INTEGER;

  let goalIndex = 0;
  let orbsPlaced = 0;
  // Per-goal baselines, set by begin().
  let walked = 0;
  let startFloor = 0;
  let orbId: string | null = null;

  const me = (): PlayerState => state.players[0];
  const begin = (index: number) => {
    goalIndex = index;
    const p = me();
    walked = 0;
    startFloor = floorOf(tower, p);
    if (TRAINING_GOALS[index]?.id === "grab") orbId = placeOrb(state, ++orbsPlaced);
  };
  begin(0);

  return {
    state,
    cfg,
    get goalIndex() {
      return goalIndex;
    },
    get done() {
      return goalIndex >= TRAINING_GOALS.length;
    },
    get orbsPlaced() {
      return orbsPlaced;
    },
    step(input) {
      if (goalIndex >= TRAINING_GOALS.length) return;
      const before = me();
      const wasGrounded = before.onGround && !before.onLadder;
      const lastX = before.x;
      stepMatch(state, { [PLAYER_ID]: input }, cfg);
      const p = me();
      const goal = TRAINING_GOALS[goalIndex].id;
      let met = false;
      switch (goal) {
        case "walk":
          if (p.onGround) walked += wrappedDist(p.x, lastX, tower.widthM);
          met = walked >= WALK_GOAL_M;
          break;
        case "jump":
          met = wasGrounded && input.jump && !p.onGround && !p.onLadder && p.vy > 0;
          break;
        case "climb":
          met = standingAbove(p, startFloor);
          break;
        case "grab":
          met = state.powerUps.some((pu) => pu.id === orbId && pu.collected);
          break;
        case "use": {
          // Charges read 0 once it expires, so only a live one counts as spent.
          const active = isPowerUpActive(p, "super-jump", state.tick);
          met =
            (active && superJumpChargesRemaining(p, state.tick) < SUPER_JUMP_AIR_JUMPS) ||
            standingAbove(p, startFloor);
          // Ran out unused: a fresh orb, and back to grabbing it.
          if (!met && !active) {
            begin(goalIndex - 1);
            return;
          }
          break;
        }
        case "summit":
          met = p.status === "finished";
          break;
      }
      if (met) begin(goalIndex + 1);
    },
  };

  function standingAbove(p: PlayerState, floor: number): boolean {
    return p.onGround && !p.onLadder && floorOf(tower, p) > floor;
  }
}

/**
 * Put an orb on the climber's floor, ORB_OFFSET_M ahead of them (or behind,
 * when ahead runs off their platform), on the same platform piece so no gap
 * stands between them. Returns its id.
 */
function placeOrb(state: MatchState, n: number): string {
  const tower = state.tower;
  const p = state.players[0];
  const floor = floorOf(tower, p);
  const y = floorHeight(tower, floor);
  const piece =
    platformsForFloor(tower, floor).find((pl) => p.x >= pl.x0 && p.x <= pl.x1) ?? { x0: 0, x1: tower.widthM };
  const fits = (x: number) => x >= piece.x0 + 1 && x <= piece.x1 - 1;
  const candidates = [p.x + p.facing * ORB_OFFSET_M, p.x - p.facing * ORB_OFFSET_M];
  const mid = (piece.x0 + piece.x1) / 2;
  const x =
    candidates.find(fits) ??
    // A short piece: its far end from the climber, at least ORB_MIN_OFFSET_M away when it can be.
    (Math.abs(mid - p.x) >= ORB_MIN_OFFSET_M ? mid : p.x < mid ? piece.x1 - 1 : piece.x0 + 1);
  const id = `pu:training:${n}`;
  state.powerUps.push({
    id,
    type: "super-jump",
    floorIndex: floor,
    x,
    y: y + ORB_HOVER_M,
    collected: false,
    collectedTick: null,
  });
  return id;
}

/**
 * The floor a climber stands on (or is above). Feet rest on a floor's
 * surface, which floating point can put a hair under it.
 */
function floorOf(tower: TowerSpec, p: PlayerState): number {
  return floorIndexAt(tower, p.y + FLOOR_EPS_M);
}

function wrappedDist(a: number, b: number, w: number): number {
  const d = Math.abs(a - b) % w;
  return Math.min(d, w - d);
}
