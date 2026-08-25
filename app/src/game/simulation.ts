/**
 * Tower v3 "The Climb" — deterministic simulation core (Phase 0).
 *
 * This is the single source of truth for physics, run by BOTH the authoritative
 * server tick and client-side prediction (spec-next.md, Netcode). It is pure and
 * deterministic: `stepMatch(state, inputs)` is a total function of its arguments
 * (no Date.now, no Math.random — randomness comes from the seeded Rng only), so
 * re-simulating (seed, inputLog) reproduces the identical outcome. That property
 * is what AC-11 (determinism) and AC-17 (replay verification) rely on.
 *
 * Tick order is deliberate and load-bearing:
 *   1. advance race-clock + hazard height
 *   2. integrate each climbing player's motion from their input
 *   3. FLAG FINISH is evaluated BEFORE elimination (AC-4): a player touching the
 *      flag on the same tick the hazard reaches them FINISHES, not dies.
 *   4. hazard + fall elimination / respawn for players who did not finish (AC-7,
 *      AC-9, AC-10); peakY is always retained (AC-8).
 *   5. resolve match end + deterministic winner (AC-2, AC-3).
 */

import {
  MatchState,
  PlayerInput,
  PlayerState,
  PlayerId,
  TowerSpec,
  TICK_DT,
  NO_INPUT,
} from "./types";
import {
  HazardConfig,
  DEFAULT_HAZARD_CONFIG,
  hazardHeightAt,
} from "./hazard";
import { type EngineConstants } from "../engine/constants";

export interface SimConfig {
  hazard: HazardConfig;
  /** Time penalty (ticks) added when a player respawns (solo). */
  respawnPenaltyTicks: number;
  engine?: Partial<EngineConstants>;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  hazard: DEFAULT_HAZARD_CONFIG,
  respawnPenaltyTicks: 60, // ~2s at 30Hz
};

/** Build a fresh climbing player at the tower base. */
export function spawnPlayer(id: PlayerId, slot: number): PlayerState {
  return {
    id,
    slot,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: true,
    onLadder: false,
    status: "climbing",
    peakY: 0,
    lastCheckpoint: 0,
    finishedTick: null,
    penaltyTicks: 0,
  };
}

/** Create an initial match state in the countdown phase. */
export function createMatch(params: {
  seed: string;
  mode: MatchState["mode"];
  tower: TowerSpec;
  playerIds: PlayerId[];
}): MatchState {
  return {
    seed: params.seed,
    mode: params.mode,
    phase: "countdown",
    tick: 0,
    raceSeconds: 0,
    hazardY: 0,
    tower: params.tower,
    players: params.playerIds.map((id, i) => spawnPlayer(id, i)),
    winnerId: null,
  };
}

/** Respawn a player at their last checkpoint with a time penalty. */
function respawnAtCheckpoint(
  p: PlayerState,
  tower: TowerSpec,
  penaltyTicks: number
): void {
  // AC-10: caught before the first checkpoint → respawn at base (index 0).
  const cpIndex = Math.max(0, Math.min(p.lastCheckpoint, tower.checkpoints.length - 1));
  const cpY = tower.checkpoints[cpIndex] ?? 0;
  p.y = cpY;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.onLadder = false;
  p.penaltyTicks += penaltyTicks;
  // AC-8: peakY is NOT reset — the peak reached so far is retained permanently.
}

/** Integrate one climbing player's motion from their input for one tick. */
function integratePlayer(p: PlayerState, input: PlayerInput, tower: TowerSpec): void {
  const dt = TICK_DT;

  // Horizontal movement.
  p.vx = input.moveX * tower.moveSpeed;
  p.x += p.vx * dt;

  if (p.onLadder) {
    // On a ladder: gravity suspended, vertical input drives climb (clamped to
    // the tower's max legal climb speed — the same bound anti-cheat enforces).
    p.vy = input.climbY * tower.maxClimbSpeed;
    p.y += p.vy * dt;
    p.onGround = false;
  } else {
    // Airborne / grounded: gravity + jump.
    if (input.jump && p.onGround) {
      p.vy = tower.jumpSpeed;
      p.onGround = false;
    }
    p.vy -= tower.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      // Simplified base floor; segment/platform collision is layered on later.
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }
  }

  // Advance checkpoint marker as the player climbs past checkpoint heights.
  for (let i = p.lastCheckpoint + 1; i < tower.checkpoints.length; i++) {
    if (p.y >= tower.checkpoints[i]) p.lastCheckpoint = i;
    else break;
  }

  // Permanent peak-height record ethos (AC-8, AC-30/AC-31).
  if (p.y > p.peakY) p.peakY = p.y;
}

/**
 * Advance the match by exactly one tick.
 *
 * @param state  current authoritative state (mutated in place and returned)
 * @param inputs per-player input for this tick (missing = NO_INPUT / idle)
 * @param cfg    simulation tuning
 */
export function stepMatch(
  state: MatchState,
  inputs: Record<PlayerId, PlayerInput>,
  cfg: SimConfig = DEFAULT_SIM_CONFIG
): MatchState {
  // Only countdown and climb advance the sim; lobby/finished/results are inert.
  if (state.phase !== "countdown" && state.phase !== "climb") return state;

  // Countdown: a fixed 3-2-1 (90 ticks) before "GO"; inputs are locked.
  if (state.phase === "countdown") {
    state.tick += 1;
    if (state.tick >= 90) {
      state.phase = "climb";
      state.tick = 0;
      state.raceSeconds = 0;
    }
    return state;
  }

  // ── phase === "climb" ──────────────────────────────────────────────────
  state.tick += 1;
  state.raceSeconds = state.tick * TICK_DT;

  // 1. Rising hazard reuses the leaderboard engine curve (AC-5, AC-6).
  state.hazardY = hazardHeightAt(state.raceSeconds, cfg.hazard, cfg.engine);

  for (const p of state.players) {
    if (p.status !== "climbing") continue;

    // Serve any outstanding respawn penalty (frozen while penalty ticks down).
    if (p.penaltyTicks > 0) {
      p.penaltyTicks -= 1;
      continue;
    }

    // 2. Integrate motion from validated input.
    const input = inputs[p.id] ?? NO_INPUT;
    integratePlayer(p, input, state.tower);

    // 3. FLAG FINISH — evaluated BEFORE elimination (AC-4). Touching the flag
    //    trigger height finishes the run even if the hazard arrives same tick.
    if (p.y >= state.tower.flagY) {
      p.status = "finished";
      p.finishedTick = state.tick;
      // Clamp to the summit: you cannot stand above the flag, so both position
      // and the permanent peak record top out at flagY (keeps AC-1's peak exact).
      p.y = state.tower.flagY;
      p.peakY = state.tower.flagY;
      continue;
    }

    // 4a. Hazard elimination / respawn (AC-7).
    if (p.y <= state.hazardY) {
      if (state.mode === "solo") {
        respawnAtCheckpoint(p, state.tower, cfg.respawnPenaltyTicks);
      } else {
        p.status = "eliminated"; // peakY retained (AC-8)
      }
      continue;
    }

    // 4b. Fall into a gap (AC-9): airborne and dropped more than fallDeathMargin
    //     below the last passed checkpoint means a missed platform.
    const cpY = state.tower.checkpoints[p.lastCheckpoint] ?? 0;
    const fellIntoGap =
      !p.onGround && !p.onLadder && p.y < cpY - state.tower.fallDeathMargin;
    if (fellIntoGap) {
      if (state.mode === "solo") {
        respawnAtCheckpoint(p, state.tower, cfg.respawnPenaltyTicks);
      } else {
        p.status = "eliminated";
      }
    }
  }

  // 5. Resolve match end + deterministic winner.
  resolveOutcome(state);
  return state;
}

/**
 * Decide the winner deterministically (AC-2, AC-3):
 *   - winner = first finisher by earliest finishedTick,
 *   - ties on the same tick broken by lowest slot id.
 * Match ends when someone finishes (multiplayer) or, in solo, when the single
 * player finishes or is out.
 */
function resolveOutcome(state: MatchState): void {
  const finishers = state.players
    .filter((p) => p.status === "finished" && p.finishedTick !== null)
    .sort((a, b) => {
      if (a.finishedTick !== b.finishedTick) {
        return (a.finishedTick as number) - (b.finishedTick as number);
      }
      return a.slot - b.slot; // deterministic tie-break
    });

  if (finishers.length > 0) {
    state.winnerId = finishers[0].id;
    state.phase = "finished";
    return;
  }

  // No finisher yet — if nobody can still climb, the match is over (solo caught,
  // or all multiplayer players eliminated).
  const stillClimbing = state.players.some((p) => p.status === "climbing");
  if (!stillClimbing && state.players.length > 0) {
    state.winnerId = null;
    state.phase = "finished";
  }
}

/**
 * Deterministic re-simulation from a seed + ordered input log (AC-11, AC-17).
 * Feeds each tick's inputs through stepMatch and returns the final state.
 */
export function simulateFromInputs(
  init: Parameters<typeof createMatch>[0],
  inputLog: Record<PlayerId, PlayerInput>[],
  cfg: SimConfig = DEFAULT_SIM_CONFIG,
  maxTicks = 100_000
): MatchState {
  const state = createMatch(init);
  let ticks = 0;
  // Drain the countdown first (locked inputs).
  while (state.phase === "countdown" && ticks < maxTicks) {
    stepMatch(state, {}, cfg);
    ticks++;
  }
  for (const inputs of inputLog) {
    if (state.phase === "finished" || state.phase === "results") break;
    stepMatch(state, inputs, cfg);
    ticks++;
    if (ticks >= maxTicks) break;
  }
  return state;
}
