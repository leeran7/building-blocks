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
 * drops unused bits, and cut at the tick the run ended. Padding the tail or
 * flipping ignored bits therefore cannot disguise a copied replay.
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

  return {
    ok: true,
    day,
    peakY: serverPeakY,
    ticks: replay.inputs.length,
    finished: state.phase === "finished" && player?.status === "finished",
    inputHash: dailyInputHash(replay.inputs.slice(0, consumedTicks)),
  };
}
