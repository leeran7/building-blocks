/**
 * Tower v3 "The Climb" — simulation types.
 *
 * The same deterministic simulation runs on the authoritative server tick and
 * as client-side prediction (spec-next.md, Netcode). These types are the shared
 * contract. Height (vertical Y) is the authoritative race metric.
 */

/** Fixed simulation tick rate — 30 Hz authoritative (spec NFR-1). */
export const TICK_HZ = 30;
export const TICK_DT = 1 / TICK_HZ; // seconds per tick

export type PlayerId = string;

/**
 * The six power-ups. Each is a deliberate counter to one of the ways the
 * endless tower kills you: the ladder grind (rapid-climb), long sideways
 * traverses (sprint-burst), a missed gap or crate stair (double-jump), a
 * sloppy ladder grab or platform edge (giant), a bad ladder detour (jetpack),
 * and the lava simply outpacing you late in a run (slow-lava).
 * Tuning lives in powerups.ts.
 */
export type PowerUpType =
  | "rapid-climb"
  | "sprint-burst"
  | "double-jump"
  | "giant"
  | "jetpack"
  | "slow-lava";

/**
 * A power-up sitting in the world, hovering above a floor's surface. Generated
 * deterministically per floor from (seed, floorIndex) like the rest of the
 * tower geometry, so an endless world still re-simulates exactly (AC-11).
 */
export interface PowerUpPickup {
  /** Stable per-floor id — `pu:<floorIndex>`. */
  id: string;
  type: PowerUpType;
  floorIndex: number;
  x: number;
  /** Centre height of the orb in tower metres. */
  y: number;
  collected: boolean;
  /** Tick it was collected, for the pickup flash. */
  collectedTick: number | null;
}

/**
 * A power-up the player has activated. Duration-based effects run until
 * `startTick + durationTicks`; charge-based ones (double-jump) are consumed
 * by the move they enable and expire unused when the window closes. Jetpack
 * is duration-based with a separate fuel budget spent while jump is held.
 */
export interface ActivePowerUp {
  type: PowerUpType;
  startTick: number;
  durationTicks: number;
  /** Charge-based only: the charge has been spent. */
  used?: boolean;
  /** Double-jump only: mid-air jumps remaining in this window. */
  chargesRemaining?: number;
  /** Jetpack only: ticks of thrust remaining in this window. */
  fuelRemainingTicks?: number;
}

/** Per-tick intent produced by a client's input sampling. */
export interface PlayerInput {
  /** -1 = left, 0 = none, +1 = right. */
  moveX: -1 | 0 | 1;
  /** Jump requested this tick. */
  jump: boolean;
  /** -1 = down, 0 = none, +1 = up (only meaningful while on a ladder). */
  climbY: -1 | 0 | 1;
  /** Reserved: power-ups now auto-activate on pickup, so this is currently unused by the sim. */
  usePowerUp: boolean;
}

export const NO_INPUT: PlayerInput = {
  moveX: 0,
  jump: false,
  climbY: 0,
  usePowerUp: false,
};

export type PlayerStatus = "climbing" | "finished" | "eliminated";

/** Authoritative per-player state. Positions are server-derived only (AC-18). */
export interface PlayerState {
  id: PlayerId;
  /** Deterministic winner tie-break: lower slot wins ties (AC-3, B5 edge). */
  slot: number;
  x: number;
  /** Feet-height in tower metres — THE race metric. */
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  onLadder: boolean;
  /** Floor index of the ladder being climbed (ladder i joins floor i→i+1), else null. */
  ladderIx: number | null;
  /** Which ladder on that floor is being climbed — floors can have several. */
  ladderSlot: number | null;
  status: PlayerStatus;
  /** Permanent-record ethos: max height reached, retained on death (AC-8). */
  peakY: number;
  /** Tick the run ended. Solo endless sets this on lava/fall death. */
  finishedTick: number | null;
  /**
   * Consecutive illegal height deltas this run (AC-16). Ranked payouts void
   * once this hits K; see updateSentinel.
   */
  cheatViolations: number;
  /** True once the height-rate sentinel has flagged this player (AC-16). */
  cheatFlagged: boolean;
  /** Power-ups currently running. Expired entries are dropped each tick. */
  activePowerUps: ActivePowerUp[];
  /**
   * Earliest tick each type may be activated again. Only slow-lava sets one —
   * see the balance note in powerups.ts on why the run has to stay finite.
   */
  cooldownUntilTick: Partial<Record<PowerUpType, number>>;
  /**
   * Last pickup, which is now also the activation (touching an orb activates it
   * immediately — there is no held slot), recorded so the renderer and the sound
   * layer can fire one-shot feedback without diffing arrays. Presentation-only:
   * nothing in the simulation reads them back.
   */
  lastPickupTick: number | null;
  lastPickupType: PowerUpType | null;
  /**
   * Previous tick's jump button, so it can be edge-triggered. Without this a
   * held jump key would spend a double-jump charge on the tick after the
   * ground launch (and would fight the jetpack's hold-to-thrust).
   */
  jumpHeldPrev: boolean;
  /**
   * Jetpack thrust applied this tick. Presentation-only (canvas flame); the
   * simulation never reads it back.
   */
  jetpackThrusting: boolean;
  /**
   * True after stepping off a ladder onto a platform (its top or bottom) while
   * the climb intent is still held. It suppresses re-grabbing a ladder until the
   * climb button is released, and clears the moment it is. Without it, topping
   * out with the mobile climb button still down instantly re-grabbed a ladder on
   * that same surface and snapped the climber's x back, so they could not walk
   * away — the "stuck after getting off a ladder" bug.
   */
  grabSuppressedUntilRelease: boolean;
}

/**
 * A solid, one-way platform (you land on its top from above, and can jump up
 * through it from below — Donkey-Kong / Doodle-Jump style). Spans [x0, x1] at
 * top-surface height `y`, all in tower metres.
 */
export interface Platform {
  x0: number;
  x1: number;
  y: number;
}

/**
 * A crate on or above a floor. Solid from the sides; the top is a one-way
 * landing. Single crates are hurdles; three stacked as a triangle sit on the
 * slab; a taller run forms a stair to the next floor. Generated per floor from
 * the tower seed (AC-11).
 */
export interface Obstacle {
  floorIndex: number;
  x0: number;
  x1: number;
  /** Bottom of the crate (floor height for a hurdle; stacked for a stair). */
  y0: number;
  /** Top of the crate (landable). */
  y1: number;
  kind: "barrel" | "rock" | "debris";
}

/**
 * A climbable ladder connecting a lower platform to a higher one. Centered at
 * `x`, spanning feet-heights [y0, y1]. A climber within `grabRadius` of `x` and
 * inside the y-span can attach and climb (King-Kong ladders).
 */
export interface Ladder {
  x: number;
  y0: number;
  y1: number;
}

/**
 * An ENDLESS tower descriptor. There is no summit — the climb goes up forever
 * and gets harder with altitude; a run ends only when the climber is caught, and
 * the peak height reached is the leaderboard score. Geometry is NOT stored: each
 * floor's platforms + ladder are generated deterministically on demand from
 * `seed` + the floor index (see towers.ts), so the world is unbounded yet
 * reproducible for re-simulation (AC-11).
 */
export interface TowerSpec {
  categorySlug: string;
  /** Horizontal play width in metres (x ∈ [0, widthM]). */
  widthM: number;
  /** Vertical distance between consecutive floors in metres. */
  floorGap: number;
  /** Seed for deterministic per-floor geometry generation. */
  seed: string;
  /** How close (metres) to a ladder's x you must be to grab it. */
  ladderGrabRadius: number;
  /** Max legal climb rate (m/s) used by anti-cheat + climbing. */
  maxClimbSpeed: number;
  /** Horizontal walk speed (m/s). */
  moveSpeed: number;
  /** Upward launch velocity of a jump (m/s). */
  jumpSpeed: number;
  /** Downward gravity acceleration (m/s²). */
  gravity: number;
  /**
   * Doodle-Jump fall-death: if a climber's feet fall more than this far below
   * their peak height reached, they have fallen off the climb and are out.
   */
  fallDeathBelowPeakM: number;
}

export type MatchPhase =
  | "lobby"
  | "countdown"
  | "climb"
  | "finished"
  | "results";

export type MatchMode = "solo" | "multiplayer";

/** Full authoritative match state at a given tick. */
export interface MatchState {
  seed: string;
  mode: MatchMode;
  phase: MatchPhase;
  tick: number;
  /** Race-time in seconds since "GO" (tick * TICK_DT once climbing). */
  raceSeconds: number;
  hazardY: number;
  /**
   * Seconds of hazard rise cancelled by slow-lava. The hazard reads the clock
   * at `raceSeconds - hazardSlowSeconds` rather than being scaled directly:
   * scaling a height curve that is already an integral would make the lava
   * drop, and the lava must only ever rise.
   */
  hazardSlowSeconds: number;
  tower: TowerSpec;
  players: PlayerState[];
  /** Winner player id once phase is finished/results. */
  winnerId: PlayerId | null;
  /** Materialized power-up pickups for the floors currently in play. */
  powerUps: PowerUpPickup[];
  /** Exclusive upper bound of the floor range `powerUps` has been generated for. */
  powerUpFloorHi: number;
}
