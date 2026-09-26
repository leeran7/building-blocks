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
 * Residual risks, by design: a bot that plays perfectly produces a legal
 * input log and passes; replays carry no engine version, so a deploy that
 * changes stepMatch or obstacle geometry desyncs runs recorded before it.
 * DAILY_SIM_VERSION is stamped on each stored score so such rows can be
 * found afterwards.
 */

import { buildFreeTower } from "./freeStack";
import { applyRunSeed } from "./towers";
import { simulateFromInputs, DEFAULT_SIM_CONFIG } from "./simulation";
import { MAX_SHARE_TICKS, type RunReplay } from "./runReplay";
import type { PlayerInput } from "./types";
import { submissionDayForSeed } from "../lib/dailyDay";

/**
 * Engine revision a daily score was verified under. Bump in the same change
 * as any edit to stepMatch, obstaclesForFloor, power-ups or hazard tuning.
 */
export const DAILY_SIM_VERSION = 1;

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
    }
  | {
      ok: false;
      code: DailyVerifyFailure;
      reason: string;
      /** Present for REPLAY_MISMATCH so the route can log both sides. */
      serverPeakY?: number;
    };

/** Re-simulate a solo daily run; returns the final state's climber. */
export function resimulateSoloRun(seed: string, inputs: PlayerInput[]) {
  const state = simulateFromInputs(
    {
      seed,
      mode: "solo",
      tower: applyRunSeed(buildFreeTower(), seed),
      playerIds: [SOLO_PLAYER_ID],
    },
    inputs.map((input) => ({ [SOLO_PLAYER_ID]: input })),
    DEFAULT_SIM_CONFIG
  );
  return { state, player: state.players[0] };
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

  const { state, player } = resimulateSoloRun(replay.seed, replay.inputs);
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
  };
}
