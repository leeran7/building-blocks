/**
 * Daily Climb score verification — the server derives the score, the client
 * only supplies inputs.
 *
 * A daily run is accepted only as a replay (seed + per-tick input log). The
 * server re-runs it through the same deterministic engine the client played
 * on, and the height that lands on the board is the SERVER's peakY. The
 * client's own claim is used for one thing: detecting a desync or a forged
 * token, which is rejected rather than trusted either way.
 *
 * The match is built exactly as useClimb builds a solo run (same player id,
 * same `applyRunSeed(buildFreeTower(), seed)` tower, default sim config), so
 * an honest replay reproduces the client's peak bit-for-bit on the same
 * engine version.
 *
 * Residual risk, by design: a bot that plays perfectly produces a legal
 * input log and passes. The seed is secret until its day opens
 * (dailySeedServer.ts), so that search cannot start early. Clients send
 * DAILY_SIM_VERSION (simVersion.ts), and the route rejects a stale engine
 * before it gets here, so a mismatch reaching this module means a desync or
 * a forgery on the same engine.
 */

import { createHash } from "node:crypto";

import { buildFreeTower } from "./freeStack";
import { applyRunSeed } from "./towers";
import { simulateFromInputs, DEFAULT_SIM_CONFIG } from "./simulation";
import { MAX_SHARE_TICKS, packInputLog, type RunReplay } from "./runReplay";
import type { PlayerInput } from "./types";
import { submissionDayForSeed } from "../lib/dailySeedServer";

export { DAILY_SIM_VERSION } from "./simVersion";

/**
 * Largest |client peak - server peak| still treated as the same run, metres.
 * The token rounds its claim to 0.1 m (max error 0.05); the rest is float
 * slack. A real desync or a forged claim is off by far more.
 */
export const DAILY_PEAK_EPSILON_M = 0.1;

/**
 * Lowest verified peak, in metres, whose input log is claimed against reuse
 * (SEC-DC-2 / SEC-DC-11). Below it the run is saved as a normal attempt with
 * no claim, because honest low-entropy runs collide: every player who never
 * presses a key produces the same 221-tick, 0 m log, and so does anyone who
 * only holds jump or walks into the lava. Claiming those would refuse the
 * second honest player with a false REPLAY_REUSED.
 *
 * Why 6 m: measured on 30 daily towers (Sept 2026, test secret), idle and
 * walk-only runs peak at 0 m, jump-only runs at 2.6 m, and hold
 * right + jump + climb at 3.8 m at most (a standing jump is
 * jumpSpeed^2 / (2 * gravity) <= 3.6 m; a crate adds a little). The first
 * floor starts at 0.68 * floorGap >= 15 m. A run under 6 m never reached the
 * first floor, so copying it launders nothing but a near-zero score.
 *
 * The peak floor alone does not cover a constant held input that happens to
 * catch a ladder (hold left or right + climb): it also collides across
 * players and can reach 17-176 m. Those are exempted by segment count
 * instead (DAILY_CLAIM_MIN_INPUT_SEGMENTS, SEC-DC-15).
 */
export const DAILY_CLAIM_MIN_PEAK_M = 6;

/**
 * Fewest input segments (see dailyInputSegments) a verified daily run needs
 * before its log is claimed (SEC-DC-15). A run with at most 3 segments, i.e.
 * at most two input changes (constant hold; hold-then-switch; idle, hold,
 * release), is saved with no claim however high it reaches.
 *
 * Why: two honest players produce byte-identical logs only for patterns
 * anchored at tick 0 and ended by death, with a couple of switches at most.
 * Measured on the September 2026 towers: 67 of 540 constant-input runs reach
 * >= 6 m (max 176 m) and 1536 of 9180 two-segment runs do, so claiming them
 * refused honest second players and let one account pre-claim every constant
 * run just after the reset. A real climb has far more segments (the scripted
 * test run has 31).
 *
 * Why a copier gains nothing: the claim already stops only exact and padded
 * copies. Changing one no-effect input (jump in mid-air) gets any run a new
 * hash today, so skipping the claim for a class of runs grants no capability
 * a copier lacks. To use the exemption on a high run they would have to
 * rewrite it into <= 3 segments that still reach the same server-verified
 * peak; that is a trivial strategy anyone can find, not a copy of someone's
 * play, and it scores only what it really reaches. Ties still rank the
 * earlier run first.
 */
export const DAILY_CLAIM_MIN_INPUT_SEGMENTS = 4;

/**
 * Number of maximal runs of identical bytes in packInputLog(inputs): the
 * same canonical bytes dailyInputHash hashes. Pass the consumed slice (the
 * inputs the sim read before the run ended), so tail padding after death
 * adds nothing. Packing drops unused bits, so flipping one (usePowerUp) adds
 * nothing either. An empty log has 0 segments; a constant log has 1.
 */
export function dailyInputSegments(inputs: PlayerInput[]): number {
  const bytes = packInputLog(inputs);
  if (bytes.length === 0) return 0;
  let segments = 1;
  for (let i = 1; i < bytes.length; i++) {
    if (bytes[i] !== bytes[i - 1]) segments++;
  }
  return segments;
}

/**
 * True when a verified daily run must claim its input hash before it is
 * saved. Both arguments must be server-derived (verifyDailyReplay's verdict),
 * never taken from the client.
 */
export function dailyRunNeedsClaim(serverPeakY: number, inputSegments: number): boolean {
  return serverPeakY >= DAILY_CLAIM_MIN_PEAK_M && inputSegments >= DAILY_CLAIM_MIN_INPUT_SEGMENTS;
}

/** Player id useClimb gives the solo climber. Must match for identical sims. */
const SOLO_PLAYER_ID = "you";

export type DailyVerifyFailure =
  | "DAY_CLOSED"
  | "RUN_TOO_LONG"
  | "REPLAY_MISMATCH";

export type DailyVerifyResult =
  | {
      ok: true;
      /** UTC day the run counts toward (server clock). */
      day: string;
      /** Server re-simulated peak height. The only value that is stored. */
      peakY: number;
      /** Ticks the server actually simulated. */
      ticks: number;
      /** True when the re-simulated climber reached the finish. */
      finished: boolean;
      /** dailyInputHash of the inputs the sim consumed. */
      inputHash: string;
      /** dailyInputSegments of the same consumed inputs (server-computed). */
      inputSegments: number;
    }
  | {
      ok: false;
      code: DailyVerifyFailure;
      reason: string;
      /** Present for REPLAY_MISMATCH so the route can log both sides. */
      serverPeakY?: number;
    };

function soloMatch(seed: string): Parameters<typeof simulateFromInputs>[0] {
  return {
    seed,
    mode: "solo",
    tower: applyRunSeed(buildFreeTower(), seed),
    playerIds: [SOLO_PLAYER_ID],
  };
}

/**
 * Re-simulate a solo daily run. Returns the final state, its climber, and
 * how many of the inputs the sim consumed before the run ended (inputs after
 * elimination or the finish change nothing).
 */
export function resimulateSoloRun(seed: string, inputs: PlayerInput[]) {
  const state = simulateFromInputs(
    soloMatch(seed),
    inputs.map((input) => ({ [SOLO_PLAYER_ID]: input })),
    DEFAULT_SIM_CONFIG
  );
  // Ticks the engine runs before it reads the first input (the countdown).
  const leadTicks = simulateFromInputs(soloMatch(seed), [], DEFAULT_SIM_CONFIG).tick;
  const consumedTicks = Math.min(inputs.length, Math.max(0, state.tick - leadTicks));
  return { state, player: state.players[0], consumedTicks };
}

/**
 * SHA-256 (hex) of a canonical input log, used to spot one run submitted by
 * two accounts (SEC-DC-2). Canonical means the inputs are re-packed, which
 * drops unused bits, and cut at the tick the run ended. So an exact copy, a
 * tail-padded copy, or one with flipped unused bits hashes the same and is
 * refused.
 *
 * It does NOT stop all copies. Changing one input the game ignores (jump
 * while airborne, climbY off a ladder, moveX into a wall) keeps the peak
 * bit-identical under a new hash. That near-copy is an accepted residual
 * (SEC-DC-2, medium): it can only tie the original, ties rank the earlier
 * run first, and beating the original needs a search, which is the bot/TAS
 * residual above.
 */
export function dailyInputHash(inputs: PlayerInput[]): string {
  return createHash("sha256").update(packInputLog(inputs)).digest("hex");
}

/**
 * Decide whether a decoded replay is a genuine run on an open daily tower,
 * and if so what height it earned.
 *
 * @param replay        decoded token (decodeRunReplayServer / inflateReplayEnvelope)
 * @param claimedPeakY  the client's reported peak; null uses the token's own
 * @param now           server clock
 */
export function verifyDailyReplay(
  replay: RunReplay,
  claimedPeakY: number | null,
  now: Date | number
): DailyVerifyResult {
  const day = submissionDayForSeed(replay.seed, now);
  if (day === null) {
    return {
      ok: false,
      code: "DAY_CLOSED",
      reason: "run is not on today's tower (or yesterday's within the grace window)",
    };
  }

  if (replay.inputs.length === 0 || replay.inputs.length > MAX_SHARE_TICKS) {
    return {
      ok: false,
      code: "RUN_TOO_LONG",
      reason: `input log must be 1..${MAX_SHARE_TICKS} ticks`,
    };
  }

  const { state, player, consumedTicks } = resimulateSoloRun(replay.seed, replay.inputs);
  const serverPeakY = Math.max(0, player?.peakY ?? 0);
  const claim = claimedPeakY ?? replay.peakY;

  // `Math.abs(NaN - x) > eps` is false, so a non-finite peak would slip past
  // the tolerance checks below, and Postgres GREATEST ranks NaN above every
  // number. Reject any non-finite value outright, and compare with `<=` so a
  // NaN difference fails closed.
  if (!Number.isFinite(serverPeakY) || !Number.isFinite(claim) || !Number.isFinite(replay.peakY)) {
    return {
      ok: false,
      code: "REPLAY_MISMATCH",
      reason: "peak is not a finite number",
      serverPeakY,
    };
  }
  if (!(Math.abs(serverPeakY - claim) <= DAILY_PEAK_EPSILON_M)) {
    return {
      ok: false,
      code: "REPLAY_MISMATCH",
      reason: "re-simulated peak does not match the reported peak",
      serverPeakY,
    };
  }
  if (!(Math.abs(serverPeakY - replay.peakY) <= DAILY_PEAK_EPSILON_M)) {
    return {
      ok: false,
      code: "REPLAY_MISMATCH",
      reason: "re-simulated peak does not match the replay token",
      serverPeakY,
    };
  }

  const consumed = replay.inputs.slice(0, consumedTicks);
  return {
    ok: true,
    day,
    peakY: serverPeakY,
    ticks: replay.inputs.length,
    finished: state.phase === "finished" && player?.status === "finished",
    inputHash: dailyInputHash(consumed),
    inputSegments: dailyInputSegments(consumed),
  };
}
