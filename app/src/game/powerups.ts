/**
 * Tower v3 "The Climb" — power-ups.
 *
 * Five pickups, each answering one of the ways the endless tower ends a run:
 *
 *   rapid-climb   ladders are the fastest way up, so make them faster
 *   sprint-burst  ladders drift further apart with altitude — cover the traverse
 *   double-jump   recover a missed gap instead of falling behind your peak
 *   super-jump    skip a ladder detour entirely with one big launch
 *   time-slow     the lava eventually outpaces any climber; buy back seconds
 *
 * BALANCE. The hazard passes 1.0x climb speed at ~48s and holds at 1.15x, so an
 * unaided run is hard-capped no matter how well it is played. Power-ups are
 * what push past that cap, and they are deliberately shaped so the ceiling is
 * raised by PLAYING WELL rather than by collecting:
 *
 *   - one slot. A pickup replaces whatever is banked, so hoarding is impossible
 *     and every orb is a "use it now or trade it away" decision;
 *   - short windows (6–8s) that must be spent on the right terrain — rapid-climb
 *     is wasted if you are not on a ladder;
 *   - multipliers under 2x, so no single pickup trivialises a floor;
 *   - time-slow cancels half the lava's rise and is the rarest drop, but weights
 *     toward it with altitude — exactly where the lava wins — so a deep run keeps
 *     getting the tool it needs to go deeper.
 *
 * THE RUN MUST STILL END. The endless tower's guarantee is that the lava settles
 * at 1.15x the climb speed, so no climber outlasts it. Time-slow is the one
 * power-up that can break that: held at 100% uptime it drops the lava to 0.58x
 * and the tower becomes survivable forever. Its cooldown is what keeps the
 * guarantee — it caps uptime at 8s in every 32s, so the lava still averages
 * 1.15 · (1 − 0.5 · 0.25) ≈ 1.006x the climb speed. That margin is thin on
 * purpose: a player who lands every time-slow perfectly gets very close to
 * outrunning the tower, which is exactly the high-hike ceiling this is for, but
 * never actually escapes it. Do not raise TIME_SLOW_FRAC or shorten the cooldown
 * without redoing that arithmetic — `powerups.test.ts` asserts the bound.
 *
 * Spawns are generated per floor from (seed, floorIndex) with the seeded Rng,
 * never Math.random, so an endless world still re-simulates bit-identically
 * (AC-11) and the same seed always drops the same orbs in the same places.
 */

import {
  ActivePowerUp,
  PlayerState,
  PowerUpPickup,
  PowerUpType,
  TICK_HZ,
  TowerSpec,
} from "./types";
import { createRng } from "./rng";
import { floorHeight, floorIndexAt, platformsForFloor } from "./towers";

// ── Pickup geometry ────────────────────────────────────────────────────────

/** Height above the floor surface the orb hovers, in metres. */
export const POWER_UP_HOVER_M = 3.2;
/** Horizontal half-width of the pickup box, in metres. */
export const POWER_UP_GRAB_X = 2.8;
/** How far below / above the orb centre the climber's feet may be to collect. */
const GRAB_BELOW_M = 2.0;
const GRAB_ABOVE_M = 5.0;
/** Keep orbs off the very lip of a platform piece so they are never half in a gap. */
const EDGE_MARGIN_M = 3.0;
/** Floors below this never spawn — the opening should be read, not scrambled. */
const FIRST_SPAWN_FLOOR = 2;
/** Floors over which spawn odds and the time-slow bias ramp to their maximum. */
const RAMP_FLOORS = 50;
/** Spawn chance per floor at the base, and after the ramp. */
const SPAWN_CHANCE_LOW = 0.18;
const SPAWN_CHANCE_HIGH = 0.32;

// ── Effects ────────────────────────────────────────────────────────────────

/** Multiplier applied to `tower.maxClimbSpeed` while rapid-climb runs. */
export const RAPID_CLIMB_MULT = 1.75;
/** Multiplier applied to `tower.moveSpeed` while sprint-burst runs. */
export const SPRINT_BURST_MULT = 1.5;
/** Multiplier applied to `tower.jumpSpeed` when a super-jump charge is spent. */
export const SUPER_JUMP_MULT = 1.6;
/** Fraction of a normal jump a double-jump gives (a recovery, not a second launch). */
export const DOUBLE_JUMP_MULT = 0.92;
/** Fraction of the lava's rise cancelled while time-slow runs. */
export const TIME_SLOW_FRAC = 0.5;
/** Seconds before time-slow may be used again — the endless-run guarantee. */
export const TIME_SLOW_COOLDOWN_SECONDS = 24;

export interface PowerUpSpec {
  type: PowerUpType;
  /** Short HUD name. */
  label: string;
  /** One-line explanation for the guide and the a11y announcement. */
  description: string;
  /** Canvas/HUD glyph. */
  glyph: string;
  /** Hex colour used for the orb, the HUD chip, and the climber's aura. */
  color: string;
  /** How long the effect (or the window to spend a charge) lasts, in seconds. */
  durationSeconds: number;
  /**
   * Seconds after the effect ends before this type may be activated again. Only
   * time-slow needs one — see the note at the top on why the run must still end.
   */
  cooldownSeconds: number;
  /**
   * Charge-based: consumed by the move it enables (a jump) rather than by time.
   * The duration is then just the window in which it may be spent.
   */
  charge: boolean;
  /** Relative drop weight at the base of the tower. */
  weight: number;
  /** Drop-weight multiplier once past the altitude ramp. */
  altitudeWeightMult: number;
}

export const POWER_UP_SPECS: Record<PowerUpType, PowerUpSpec> = {
  "rapid-climb": {
    type: "rapid-climb",
    label: "Rapid Climb",
    description: `Climb ladders ${RAPID_CLIMB_MULT}x faster`,
    glyph: "⇈",
    color: "#4dd9f2",
    durationSeconds: 6,
    cooldownSeconds: 0,
    charge: false,
    weight: 26,
    altitudeWeightMult: 1.15,
  },
  "sprint-burst": {
    type: "sprint-burst",
    label: "Sprint Burst",
    description: `Run ${SPRINT_BURST_MULT}x faster`,
    glyph: "»",
    color: "#f2d24d",
    durationSeconds: 6,
    cooldownSeconds: 0,
    charge: false,
    weight: 22,
    altitudeWeightMult: 1,
  },
  "double-jump": {
    type: "double-jump",
    label: "Double Jump",
    description: "One extra jump in mid-air",
    glyph: "⇡",
    color: "#a98cf5",
    durationSeconds: 10,
    cooldownSeconds: 0,
    charge: true,
    weight: 22,
    altitudeWeightMult: 1,
  },
  "super-jump": {
    type: "super-jump",
    label: "Super Jump",
    description: `Next jump launches ${SUPER_JUMP_MULT}x higher`,
    glyph: "⤒",
    color: "#5cf29b",
    durationSeconds: 8,
    cooldownSeconds: 0,
    charge: true,
    weight: 18,
    altitudeWeightMult: 1.1,
  },
  "time-slow": {
    type: "time-slow",
    label: "Time Slow",
    description: `Lava rises ${Math.round(TIME_SLOW_FRAC * 100)}% slower`,
    glyph: "◷",
    color: "#ff8ad4",
    durationSeconds: 8,
    cooldownSeconds: TIME_SLOW_COOLDOWN_SECONDS,
    charge: false,
    weight: 12,
    // Weights up with altitude, where the lava is winning, but not so far that
    // the strongest power-up stops being the rarest one on the tower.
    altitudeWeightMult: 1.5,
  },
};

export const POWER_UP_TYPES = Object.keys(POWER_UP_SPECS) as PowerUpType[];

/** Duration of a power-up in simulation ticks. */
export function durationTicks(type: PowerUpType): number {
  return Math.round(POWER_UP_SPECS[type].durationSeconds * TICK_HZ);
}

/** Cooldown of a power-up in simulation ticks (0 for most). */
export function cooldownTicks(type: PowerUpType): number {
  return Math.round(POWER_UP_SPECS[type].cooldownSeconds * TICK_HZ);
}

/** Ticks until `type` may be activated again — 0 when it is ready now. */
export function cooldownRemaining(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): number {
  const until = p.cooldownUntilTick[type];
  if (until === undefined) return 0;
  return Math.max(0, until - tick);
}

/** May this player spend `type` right now? */
export function canActivate(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): boolean {
  return cooldownRemaining(p, type, tick) === 0;
}

// ── Deterministic spawning ─────────────────────────────────────────────────

/** Spawn odds for a floor — rises with altitude to keep deep runs supplied. */
export function spawnChanceForFloor(i: number): number {
  if (i < FIRST_SPAWN_FLOOR) return 0;
  const d = Math.min(1, i / RAMP_FLOORS);
  return SPAWN_CHANCE_LOW + (SPAWN_CHANCE_HIGH - SPAWN_CHANCE_LOW) * d;
}

/** Pick a type by weight, biasing toward the altitude-scaled ones as you climb. */
function pickType(roll: number, i: number): PowerUpType {
  const d = Math.min(1, i / RAMP_FLOORS);
  const weights = POWER_UP_TYPES.map((t) => {
    const s = POWER_UP_SPECS[t];
    return s.weight * (1 + (s.altitudeWeightMult - 1) * d);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = roll * total;
  for (let k = 0; k < POWER_UP_TYPES.length; k++) {
    acc -= weights[k];
    if (acc <= 0) return POWER_UP_TYPES[k];
  }
  return POWER_UP_TYPES[POWER_UP_TYPES.length - 1];
}

/**
 * The power-up on floor `i`, or null if that floor has none. Deterministic in
 * (tower.seed, i) — the same tower always drops the same orbs.
 */
export function powerUpForFloor(tower: TowerSpec, i: number): PowerUpPickup | null {
  if (i < FIRST_SPAWN_FLOOR) return null;
  const rng = createRng(`${tower.seed}:pu:${i}`);
  if (rng.next() >= spawnChanceForFloor(i)) return null;

  const type = pickType(rng.next(), i);

  // Sit the orb on a solid piece of the floor, chosen by width so a wide slab is
  // likelier than a sliver, and inset from the edges so it never floats over the
  // gap the player has to jump.
  const pieces = platformsForFloor(tower, i)
    .map((p) => ({ p, w: p.x1 - p.x0 }))
    .filter((e) => e.w > 2 * EDGE_MARGIN_M);
  if (pieces.length === 0) return null;
  const totalW = pieces.reduce((a, e) => a + e.w, 0);
  let pickW = rng.next() * totalW;
  let chosen = pieces[pieces.length - 1].p;
  for (const e of pieces) {
    pickW -= e.w;
    if (pickW <= 0) {
      chosen = e.p;
      break;
    }
  }
  const lo = chosen.x0 + EDGE_MARGIN_M;
  const hi = chosen.x1 - EDGE_MARGIN_M;

  return {
    id: `pu:${i}`,
    type,
    floorIndex: i,
    x: lo + rng.next() * (hi - lo),
    y: floorHeight(tower, i) + POWER_UP_HOVER_M,
    collected: false,
    collectedTick: null,
  };
}

/** Every power-up on the floors intersecting [yLow, yHigh]. */
export function powerUpsNearY(
  tower: TowerSpec,
  yLow: number,
  yHigh: number
): PowerUpPickup[] {
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  const out: PowerUpPickup[] = [];
  for (let i = lo; i <= hi; i++) {
    const pu = powerUpForFloor(tower, i);
    if (pu) out.push(pu);
  }
  return out;
}

/** True if a climber whose feet are at (x, y) is touching this orb. */
export function overlapsPickup(pu: PowerUpPickup, x: number, y: number): boolean {
  if (Math.abs(x - pu.x) > POWER_UP_GRAB_X) return false;
  return y >= pu.y - GRAB_ABOVE_M && y <= pu.y + GRAB_BELOW_M;
}

// ── Active-effect queries ──────────────────────────────────────────────────

/** Has this entry run out of time (or been spent)? */
export function isExpired(a: ActivePowerUp, tick: number): boolean {
  return a.used || tick - a.startTick >= a.durationTicks;
}

/** The live entry for `type`, or undefined. */
export function activeEntry(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): ActivePowerUp | undefined {
  return p.activePowerUps.find((a) => a.type === type && !isExpired(a, tick));
}

export function isPowerUpActive(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): boolean {
  return activeEntry(p, type, tick) !== undefined;
}

/** Ticks left on a live entry (0 if not running). */
export function remainingTicks(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): number {
  const a = activeEntry(p, type, tick);
  if (!a) return 0;
  return Math.max(0, a.durationTicks - (tick - a.startTick));
}

export function climbSpeedMultiplier(p: PlayerState, tick: number): number {
  return isPowerUpActive(p, "rapid-climb", tick) ? RAPID_CLIMB_MULT : 1;
}

export function moveSpeedMultiplier(p: PlayerState, tick: number): number {
  return isPowerUpActive(p, "sprint-burst", tick) ? SPRINT_BURST_MULT : 1;
}

/**
 * Fraction of real time the lava clock advances by this tick. Multiplayer shares
 * one hazard, so the slowest clock any live climber has earned applies to all.
 */
export function hazardTimeScale(players: PlayerState[], tick: number): number {
  const slowed = players.some(
    (p) => p.status === "climbing" && isPowerUpActive(p, "time-slow", tick)
  );
  return slowed ? 1 - TIME_SLOW_FRAC : 1;
}

/** Spend a charge-based power-up, returning whether one was available. */
export function consumeCharge(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): boolean {
  const a = activeEntry(p, type, tick);
  if (!a) return false;
  a.used = true;
  return true;
}

/** Drop entries that have expired or been spent, so the list stays small. */
export function pruneActive(p: PlayerState, tick: number): void {
  if (p.activePowerUps.length === 0) return;
  p.activePowerUps = p.activePowerUps.filter((a) => !isExpired(a, tick));
}
