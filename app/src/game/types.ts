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

/** Per-tick intent produced by a client's input sampling. */
export interface PlayerInput {
  /** -1 = left, 0 = none, +1 = right. */
  moveX: -1 | 0 | 1;
  /** Jump requested this tick. */
  jump: boolean;
  /** -1 = down, 0 = none, +1 = up (only meaningful while on a ladder). */
  climbY: -1 | 0 | 1;
  /** Use held power-up this tick. */
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
  status: PlayerStatus;
  /** Permanent-record ethos: max height reached, retained on death (AC-8). */
  peakY: number;
  /** Tick this player touched the flag, if finished (AC-3 tie-break). */
  finishedTick: number | null;
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
  tower: TowerSpec;
  players: PlayerState[];
  /** Winner player id once phase is finished/results. */
  winnerId: PlayerId | null;
}
