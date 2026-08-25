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
  status: PlayerStatus;
  /** Permanent-record ethos: max height reached, retained on death (AC-8). */
  peakY: number;
  /** Index of the last checkpoint passed (respawn target). */
  lastCheckpoint: number;
  /** Tick this player touched the flag, if finished (AC-3 tie-break). */
  finishedTick: number | null;
  /** Accumulated respawn time penalty in ticks (solo mode). */
  penaltyTicks: number;
}

/** Static tower geometry the simulation runs against. */
export interface TowerSpec {
  categorySlug: string;
  /** Total climbable height in metres. */
  heightM: number;
  /** Feet-height of the summit flag trigger. */
  flagY: number;
  /** Ascending checkpoint heights (metres). Index 0 is the base. */
  checkpoints: number[];
  /** Max legal climb rate (m/s) used by anti-cheat + fall logic. */
  maxClimbSpeed: number;
  moveSpeed: number;
  jumpSpeed: number;
  gravity: number;
  /**
   * Fall-death margin (metres). If a player is airborne (not on ground/ladder)
   * and falls more than this far below their last passed checkpoint, they have
   * fallen into a gap and are eliminated / respawned (AC-9). Models missing a
   * platform without needing full segment geometry yet.
   */
  fallDeathMargin: number;
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
