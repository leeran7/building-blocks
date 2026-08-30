/**
 * Tower v3 "The Climb" — power-ups.
 *
 * Six pickups, each answering one of the ways the endless tower ends a run:
 *
 *   rapid-climb   ladders are the fastest way up, so make them faster
 *   sprint-burst  ladders drift further apart with altitude — cover the traverse
 *   double-jump   recover a missed gap or climb a crate stair
 *   giant         grow 2× — wider ladder grabs and platform landings
 *   jetpack       skip a ladder detour — hold jump to thrust, fuel is short
 *   slow-lava     the lava eventually outpaces any climber; buy back seconds
 *
 * BALANCE. The hazard envelope ramps toward 1.0× (ladder climb speed) and
 * stumbles (2s of 0.25× envelope every 8s), so the time-averaged chase
 * settles near 0.75× — climbable on a ladder, with longer stumble windows for
 * lets the lava close in. Power-ups are what push past that cap, and they are
 * cap, and they are deliberately shaped so the ceiling is raised by PLAYING
 * WELL rather than by collecting:
 *
 *   - one live entry per type. A second orb of the same type refreshes the
 *     running effect rather than stacking charges, so double-jump cannot be
 *     hoarded. Different types may overlap; that is a separate product choice
 *     from same-type stacking, which the HUD and the charge counter both
 *     assume cannot happen;
 *   - short windows that must be spent on the right terrain — rapid-climb is
 *     wasted if you are not on a ladder, leftover jetpack fuel dies if jump
 *     is not held (or with the spend window);
 *   - multipliers under 2x, so no single pickup trivialises a floor;
 *   - slow-lava halves the lava's clock and is the rarest drop, but
 *     weights toward it with altitude — exactly where the lava wins — so a deep
 *     run keeps getting the tool it needs to go deeper.
 *
 * THE RUN MUST STILL END. The endless tower's guarantee is that the lava's
 * time-averaged late-game speed (envelope × stumble duty) stays above 1x climb
 * speed, so no climber outlasts it. Time-slow is the one power-up that can break
 * that: held at 100% uptime it would drop the lava to (1 − TIME_SLOW_FRAC) of
 * its clock and the tower could become survivable forever. Its cooldown is
 * what keeps the guarantee — it caps uptime at 8s in every 48s, so the lava
 * still averages meanSpeedFrac · (1 − 0.5 · 0.167) ≈ 1.06x the climb speed.
 * Do not raise TIME_SLOW_FRAC or shorten the cooldown without redoing that
 * arithmetic — `powerups.test.ts` asserts the bound. The 8s/40s pair keeps
 * the same uptime fraction as the old 6s/30s window.
 *
 * Spawns are a seeded GAP SCHEDULE, not independent per-floor coin flips:
 * a random first floor, then mixed clusters and droughts whose mean gap
 * tightens with altitude. Placement is anchored to ladders (near the climb,
 * on the traverse, or opposite side) so orbs don't sit in the same relative
 * spot every time. Still fully deterministic in (seed, floorIndex) (AC-11).
 */

import {
  ActivePowerUp,
  Platform,
  PlayerState,
  PowerUpPickup,
  PowerUpType,
  TICK_HZ,
  TowerSpec,
} from "./types";
import { createRng, Rng } from "./rng";
import { createSeedCache } from "./seedCache";
import { floorHeight, floorIndexAt, laddersForFloor, platformsForFloor } from "./towers";

// ── Pickup geometry ────────────────────────────────────────────────────────

/** Height above the floor surface the orb hovers, in metres. */
export const POWER_UP_HOVER_M = 3.2;
/** Horizontal half-width of the pickup box, in metres. */
export const POWER_UP_GRAB_X = 2.8;
/** How far below / above the orb centre the climber's feet may be to collect. */
const GRAB_BELOW_M = 2.0;
const GRAB_ABOVE_M = 5.0;
/** Keep orbs off the very lip of a platform piece so they are never half in a gap. */
const EDGE_MARGIN_MIN_M = 1.6;
const EDGE_MARGIN_MAX_M = 4.8;
/** Only the spawn floor never drops — floor 1 is fair game so orbs start early. */
const MIN_SPAWN_FLOOR = 1;
/** First orb lands somewhere in this inclusive range (varies per tower seed). */
const FIRST_SPAWN_MIN = 1;
const FIRST_SPAWN_MAX = 4;
/** Floors over which spawn density and the slow-lava bias ramp to their maximum. */
const RAMP_FLOORS = 50;
/** Target occupancy per floor at the base, and after the ramp (drives mean gap). */
const SPAWN_CHANCE_LOW = 0.22;
const SPAWN_CHANCE_HIGH = 0.34;

// ── Effects ────────────────────────────────────────────────────────────────

/** Multiplier applied to `tower.maxClimbSpeed` while rapid-climb runs. */
export const RAPID_CLIMB_MULT = 1.75;
/** Multiplier applied to `tower.moveSpeed` while sprint-burst runs. */
export const SPRINT_BURST_MULT = 1.5;
/** Upward acceleration applied while the jetpack is thrusting, in m/s². */
export const JETPACK_THRUST = 80;
/**
 * Terminal rise speed while thrusting, in m/s. A bit above a typical ladder
 * so the pack reads as a skip, not a second climb. Fuel is sized so a full
 * burn covers a few floors at this cap.
 */
export const JETPACK_MAX_VY = 12;
/** Seconds of thrust in the tank. Feathered inside the window, not a full-window fly. */
export const JETPACK_FUEL_SECONDS = 7.5;
/** Window in which leftover fuel may still be burned. */
export const JETPACK_WINDOW_SECONDS = 30;
/** Canvas draw scale while giant runs (sim uses separate grab/landing tuning). */
export const GIANT_VISUAL_SCALE = 2;
/** Multiplier on `tower.ladderGrabRadius` while giant runs. */
export const GIANT_GRAB_MULT = 1.5;
/** Extra horizontal metres allowed for platform landings while giant runs. */
export const GIANT_PLATFORM_MARGIN_M = 0.75;
/** Fraction of a normal jump a double-jump gives (a recovery, not a second launch). */
export const DOUBLE_JUMP_MULT = 0.92;
/** Mid-air jumps granted per double-jump activation. */
export const DOUBLE_JUMP_CHARGES = 2;
/**
 * Fraction of the lava's rise cancelled while slow-lava runs. Half the clock
 * (0.5) so the line visibly slows without stalling the way 0.75 did.
 */
export const TIME_SLOW_FRAC = 0.5;
/** Seconds before slow-lava may be used again — the endless-run guarantee. */
export const TIME_SLOW_COOLDOWN_SECONDS = 40;

/** Jetpack fuel budget in simulation ticks. */
export function jetpackFuelTicks(): number {
  return Math.round(JETPACK_FUEL_SECONDS * TICK_HZ);
}

export interface PowerUpSpec {
  type: PowerUpType;
  /** Short HUD name. */
  label: string;
  /** One-line explanation for the guide and the a11y announcement. */
  description: string;
  /** Hex colour used for the orb, the HUD chip, and the climber's aura. */
  color: string;
  /** How long the effect lasts, in seconds. */
  durationSeconds: number;
  /**
   * Seconds after the effect ends before this type may be activated again. Only
   * slow-lava needs one — see the note at the top on why the run must still end.
   */
  cooldownSeconds: number;
  /**
   * Charge-based: consumed by the move it enables (a jump) rather than by time.
   * The duration is then just the window in which it may be spent.
   */
  charge?: boolean;
  /** Charge-based with multiple spends (double-jump). */
  chargeCount?: number;
  /**
   * Jetpack only: seconds of thrust in the tank. The duration is the window
   * in which that fuel may be burned; leftover fuel dies with the window.
   */
  fuelSeconds?: number;
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
    color: "#4dd9f2",
    durationSeconds: 15,
    cooldownSeconds: 0,
    weight: 26,
    altitudeWeightMult: 1.15,
  },
  "sprint-burst": {
    type: "sprint-burst",
    label: "Sprint Burst",
    description: `Run ${SPRINT_BURST_MULT}x faster`,
    color: "#f2d24d",
    durationSeconds: 10,
    cooldownSeconds: 0,
    weight: 22,
    altitudeWeightMult: 1,
  },
  "double-jump": {
    type: "double-jump",
    label: "Double Jump",
    description: `${DOUBLE_JUMP_CHARGES} extra jumps in mid-air`,
    color: "#a98cf5",
    durationSeconds: 18,
    cooldownSeconds: 0,
    charge: true,
    chargeCount: DOUBLE_JUMP_CHARGES,
    weight: 22,
    altitudeWeightMult: 1,
  },
  giant: {
    type: "giant",
    label: "Giant",
    description: `${GIANT_VISUAL_SCALE}× size · wider grabs & landings`,
    color: "#b8f57c",
    durationSeconds: 12,
    cooldownSeconds: 0,
    weight: 22,
    altitudeWeightMult: 1,
  },
  jetpack: {
    type: "jetpack",
    label: "Jetpack",
    description: `Hold jump to thrust (${JETPACK_FUEL_SECONDS}s fuel)`,
    color: "#ff9a4a",
    durationSeconds: JETPACK_WINDOW_SECONDS,
    cooldownSeconds: 0,
    fuelSeconds: JETPACK_FUEL_SECONDS,
    weight: 18,
    altitudeWeightMult: 1.1,
  },
  "slow-lava": {
    type: "slow-lava",
    label: "Slow Lava",
    description: `Lava rises ${Math.round(TIME_SLOW_FRAC * 100)}% slower`,
    color: "#ff8ad4",
    durationSeconds: 8,
    cooldownSeconds: TIME_SLOW_COOLDOWN_SECONDS,
    // Commoner at the base than the other altitude-scaled drops so a new
    // climber actually meets it early, without changing its share high up.
    weight: 12,
    // Weights up with altitude, where the lava is winning, but not so far that
    // the strongest power-up stops being the rarest one on the tower.
    altitudeWeightMult: 1.2,
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

/**
 * Target occupancy used to size gaps — denser with altitude so deep runs stay
 * supplied. Not a per-floor coin flip; the schedule below is what actually
 * places orbs.
 */
export function spawnChanceForFloor(i: number): number {
  if (i < MIN_SPAWN_FLOOR) return 0;
  const d = Math.min(1, i / RAMP_FLOORS);
  return SPAWN_CHANCE_LOW + (SPAWN_CHANCE_HIGH - SPAWN_CHANCE_LOW) * d;
}

/** Floor of the first orb on this tower (inclusive range, never the base). */
export function firstSpawnFloor(tower: TowerSpec): number {
  const r = createRng(`${tower.seed}:pu:first`);
  return r.int(FIRST_SPAWN_MIN, FIRST_SPAWN_MAX + 1);
}

/** Gap (in floors) after spawn `ordinal` at `fromFloor`. Always >= 1. */
function gapAfter(tower: TowerSpec, ordinal: number, fromFloor: number): number {
  const r = createRng(`${tower.seed}:pu:gap:${ordinal}`);
  const mean = 1 / Math.max(0.08, spawnChanceForFloor(fromFloor));
  const roll = r.next();
  // Drought: a long empty stretch so the next orb feels like a find.
  if (roll < 0.14) return Math.max(4, Math.round(mean * (1.8 + r.next() * 1.4)));
  // Cluster: next floor or skip-one, so two orbs can sit close together.
  if (roll < 0.32) return r.next() < 0.6 ? 1 : 2;
  // Typical: around the altitude-scaled mean, with a wide spread.
  return Math.max(1, Math.round(mean * (0.45 + r.next() * 1.1)));
}

interface SpawnRec {
  floor: number;
  type: PowerUpType;
}

/**
 * Memoized spawn schedule per tower seed — pure in (seed), just skips re-walks.
 *
 * Bounded. This was safe as a plain Map while a seed was a stable per-category
 * string, but tower seeds now mix in a fresh newRunSeed() per run, so every
 * game played added an entry that was never released — and each entry's array
 * grows with the altitude reached. Same bound and reasoning as the floor-height
 * prefix cache in ./towers.
 */
const spawnScheduleCache = createSeedCache<SpawnRec[]>(8, () => []);

function spawnScheduleUntil(tower: TowerSpec, atLeast: number): SpawnRec[] {
  const list = spawnScheduleCache.get(tower.seed);
  if (list.length === 0) {
    const floor = firstSpawnFloor(tower);
    const rng = createRng(`${tower.seed}:pu:type:${floor}`);
    list.push({ floor, type: pickType(rng, floor, null) });
  }
  while (list[list.length - 1].floor < atLeast) {
    const k = list.length - 1;
    const prev = list[k];
    const floor = prev.floor + Math.max(1, gapAfter(tower, k, prev.floor));
    const rng = createRng(`${tower.seed}:pu:type:${floor}`);
    list.push({ floor, type: pickType(rng, floor, prev.type) });
  }
  return list;
}

function spawnAtFloor(tower: TowerSpec, i: number): SpawnRec | null {
  if (i < MIN_SPAWN_FLOOR) return null;
  const list = spawnScheduleUntil(tower, i);
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const f = list[mid].floor;
    if (f === i) return list[mid];
    if (f < i) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** Pick a type by weight, with per-spawn jitter and a penalty for repeating. */
function pickType(rng: Rng, i: number, avoid: PowerUpType | null): PowerUpType {
  const d = Math.min(1, i / RAMP_FLOORS);
  const weights = POWER_UP_TYPES.map((t) => {
    const s = POWER_UP_SPECS[t];
    let w = s.weight * (1 + (s.altitudeWeightMult - 1) * d);
    w *= 0.55 + rng.next() * 0.9;
    if (t === avoid) w *= 0.22;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = rng.next() * total;
  for (let k = 0; k < POWER_UP_TYPES.length; k++) {
    acc -= weights[k];
    if (acc <= 0) return POWER_UP_TYPES[k];
  }
  return POWER_UP_TYPES[POWER_UP_TYPES.length - 1];
}

function clampToPiece(piece: Platform, x: number, margin: number): number {
  const lo = piece.x0 + margin;
  const hi = piece.x1 - margin;
  if (hi <= lo) return (piece.x0 + piece.x1) / 2;
  return Math.min(hi, Math.max(lo, x));
}

function closestPiece(
  pieces: { p: Platform; w: number }[],
  target: number
): Platform {
  let best = pieces[0].p;
  let bestD = Infinity;
  for (const e of pieces) {
    const inside = target >= e.p.x0 && target <= e.p.x1;
    const mid = (e.p.x0 + e.p.x1) / 2;
    const d = inside ? 0 : Math.abs(mid - target);
    if (d < bestD) {
      bestD = d;
      best = e.p;
    }
  }
  return best;
}

/**
 * Horizontal placement: mix ladder-anchored spots (easy grab after a climb or
 * before the next one), opposite-side traverse orbs, and uniform piece rolls.
 */
function pickX(
  rng: Rng,
  pieces: { p: Platform; w: number }[],
  margin: number,
  inXs: number[],
  outXs: number[],
  width: number
): number {
  // Floors can host several ladders; anchor to a random one so orbs aren't
  // always parked beside the same route up.
  const outX = outXs[rng.int(0, outXs.length)];
  const mode = rng.next();
  let target: number | null = null;
  if (mode < 0.26) target = outX;
  else if (mode < 0.5 && inXs.length > 0) target = inXs[rng.int(0, inXs.length)];
  else if (mode < 0.76) {
    const away = outX < width / 2 ? 0.82 : 0.18;
    target = width * away + (rng.next() - 0.5) * width * 0.14;
  }

  if (target !== null) {
    const piece = closestPiece(pieces, target);
    const jitter = (rng.next() - 0.5) * Math.min(16, (piece.x1 - piece.x0) * 0.45);
    return clampToPiece(piece, target + jitter, margin);
  }

  let chosen = pieces[pieces.length - 1].p;
  if (rng.next() < 0.5) {
    chosen = pieces[rng.int(0, pieces.length)].p;
  } else {
    const totalW = pieces.reduce((a, e) => a + e.w, 0);
    let pickW = rng.next() * totalW;
    for (const e of pieces) {
      pickW -= e.w;
      if (pickW <= 0) {
        chosen = e.p;
        break;
      }
    }
  }
  const lo = chosen.x0 + margin;
  const hi = chosen.x1 - margin;
  if (hi <= lo) return (chosen.x0 + chosen.x1) / 2;
  return lo + rng.next() * (hi - lo);
}

/**
 * The power-up on floor `i`, or null if that floor has none. Deterministic in
 * (tower.seed, i) — the same tower always drops the same orbs.
 */
export function powerUpForFloor(tower: TowerSpec, i: number): PowerUpPickup | null {
  const rec = spawnAtFloor(tower, i);
  if (!rec) return null;

  const rng = createRng(`${tower.seed}:pu:pos:${i}`);
  const edgeMargin =
    EDGE_MARGIN_MIN_M + rng.next() * (EDGE_MARGIN_MAX_M - EDGE_MARGIN_MIN_M);
  const hover = 2.0 + rng.next() * 2.8;
  const pieces = platformsForFloor(tower, i)
    .map((p) => ({ p, w: p.x1 - p.x0 }))
    .filter((e) => e.w > 2 * edgeMargin);
  if (pieces.length === 0) return null;

  const inXs = i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : [];
  const outXs = laddersForFloor(tower, i).map((l) => l.x);

  return {
    id: `pu:${i}`,
    type: rec.type,
    floorIndex: i,
    x: pickX(rng, pieces, edgeMargin, inXs, outXs, tower.widthM),
    y: floorHeight(tower, i) + hover,
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
  if (tick - a.startTick >= a.durationTicks) return true;
  if (a.type === "jetpack") {
    return (a.fuelRemainingTicks ?? 0) <= 0;
  }
  const spec = POWER_UP_SPECS[a.type];
  if (spec.charge && a.type === "double-jump") {
    return (a.chargesRemaining ?? 0) <= 0;
  }
  return spec.charge ? a.used === true : false;
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

export type PowerUpChipMeter = {
  seconds: number;
  frac: number;
  kind: "fuel" | "window";
};

/**
 * HUD chip fill and numeral. Jetpack shows the fuel tank, not the spend
 * window — a window-only chip would look full after the pack has already died.
 */
export function powerUpChipMeter(a: ActivePowerUp, tick: number): PowerUpChipMeter {
  const spec = POWER_UP_SPECS[a.type];
  if (spec.fuelSeconds != null) {
    const fuelLeft = Math.max(0, a.fuelRemainingTicks ?? 0);
    const fuelMax = jetpackFuelTicks();
    return {
      seconds: fuelLeft / TICK_HZ,
      frac: fuelMax > 0 ? fuelLeft / fuelMax : 0,
      kind: "fuel",
    };
  }
  const remaining = Math.max(0, a.durationTicks - (tick - a.startTick));
  return {
    seconds: remaining / TICK_HZ,
    frac: a.durationTicks > 0 ? remaining / a.durationTicks : 0,
    kind: "window",
  };
}

export function climbSpeedMultiplier(p: PlayerState, tick: number): number {
  return isPowerUpActive(p, "rapid-climb", tick) ? RAPID_CLIMB_MULT : 1;
}

export function moveSpeedMultiplier(p: PlayerState, tick: number): number {
  return isPowerUpActive(p, "sprint-burst", tick) ? SPRINT_BURST_MULT : 1;
}

/** Ladder grab radius multiplier while giant runs. */
export function ladderGrabMultiplier(p: PlayerState, tick: number): number {
  return isPowerUpActive(p, "giant", tick) ? GIANT_GRAB_MULT : 1;
}

/** Extra horizontal metres for platform support and landing while giant runs. */
export function platformReachMargin(p: PlayerState, tick: number): number {
  return isPowerUpActive(p, "giant", tick) ? GIANT_PLATFORM_MARGIN_M : 0;
}

/**
 * Fraction of real time the lava clock advances by this tick. Multiplayer shares
 * one hazard, so the slowest clock any live climber has earned applies to all.
 */
export function hazardTimeScale(players: PlayerState[], tick: number): number {
  const slowed = players.some(
    (p) => p.status === "climbing" && isPowerUpActive(p, "slow-lava", tick)
  );
  return slowed ? 1 - TIME_SLOW_FRAC : 1;
}

/** Ticks of jetpack thrust still in the tank. */
export function jetpackFuelRemaining(p: PlayerState, tick: number): number {
  const a = activeEntry(p, "jetpack", tick);
  if (!a) return 0;
  return Math.max(0, a.fuelRemainingTicks ?? 0);
}

/**
 * Spend one tick of jetpack fuel. Returns false when the pack is empty or
 * the window has closed, so the caller can skip thrust.
 */
export function consumeJetpackFuel(p: PlayerState, tick: number): boolean {
  const a = activeEntry(p, "jetpack", tick);
  if (!a) return false;
  const left = a.fuelRemainingTicks ?? 0;
  if (left <= 0) return false;
  a.fuelRemainingTicks = left - 1;
  return true;
}

/** Spend a charge-based power-up, returning whether one was available. */
export function consumeCharge(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): boolean {
  const a = activeEntry(p, type, tick);
  if (!a) return false;
  if (type === "double-jump") {
    const left = a.chargesRemaining ?? 0;
    if (left <= 0) return false;
    a.chargesRemaining = left - 1;
    return true;
  }
  a.used = true;
  return true;
}

/** Mid-air jumps still available from an active double-jump. */
export function doubleJumpChargesRemaining(
  p: PlayerState,
  tick: number
): number {
  const a = activeEntry(p, "double-jump", tick);
  if (!a) return 0;
  return Math.max(0, a.chargesRemaining ?? 0);
}

/** Drop entries that have expired or been spent, so the list stays small. */
export function pruneActive(p: PlayerState, tick: number): void {
  if (p.activePowerUps.length === 0) return;
  p.activePowerUps = p.activePowerUps.filter((a) => !isExpired(a, tick));
}

/**
 * Grant a power-up, keeping at most ONE live entry per type.
 *
 * activePowerUps is read everywhere through activeEntry, which is a .find() —
 * it returns the oldest live match and nothing else can see the rest. So an
 * append-only list quietly breaks three things when two orbs of one type are
 * picked up before the first expires:
 *
 *   - the HUD counts down the older entry, so the timer looks stuck and then
 *     jumps back up when that entry is pruned;
 *   - PowerUpHud and ClimbCanvas key their rows by type, so React sees
 *     duplicate keys;
 *   - for double-jump it is an exploit. consumeCharge drains the first entry,
 *     isExpired then reports it spent, and activeEntry falls through to the
 *     second — granting DOUBLE_JUMP_CHARGES again while
 *     doubleJumpChargesRemaining, reading the same first entry, never showed
 *     more than the original two. Four to five mid-air jumps from a counter
 *     that says two.
 *
 * Refreshing in place is the fix rather than re-keying the HUD, because the
 * duplication is in the simulation, not the view. This is deliberately the only
 * place that writes to activePowerUps.
 *
 * Same-type only: different types still stack. The header above records that
 * as the implemented rule, not a one-slot bank.
 */
export function grantPowerUp(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): void {
  const charges = type === "double-jump" ? DOUBLE_JUMP_CHARGES : undefined;
  const fuel = type === "jetpack" ? jetpackFuelTicks() : undefined;
  const existing = activeEntry(p, type, tick);

  if (existing) {
    // Second orb of a live type extends it and tops it back up, which is what
    // a player picking up an orb expects, without adding a second entry.
    existing.startTick = tick;
    existing.durationTicks = durationTicks(type);
    existing.used = false;
    existing.chargesRemaining = charges;
    existing.fuelRemainingTicks = fuel;
    return;
  }

  p.activePowerUps.push({
    type,
    startTick: tick,
    durationTicks: durationTicks(type),
    used: false,
    chargesRemaining: charges,
    fuelRemainingTicks: fuel,
  });
}

/** How many live entries of `type` the player holds. Should never exceed 1. */
export function liveEntryCount(
  p: PlayerState,
  type: PowerUpType,
  tick: number
): number {
  return p.activePowerUps.filter((a) => a.type === type && !isExpired(a, tick))
    .length;
}
