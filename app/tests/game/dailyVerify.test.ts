/**
 * verifyDailyReplay — the server re-simulation that decides a daily score.
 *
 * Runs are produced the way the client produces them: a solo match built like
 * useClimb (player "you", applyRunSeed(buildFreeTower(), seed)), stepped tick
 * by tick with the input logged before each climb step, then encoded with the
 * real encodeRunReplay and decoded with the real decodeRunReplay. Every
 * rejection is proven against a fixture that would otherwise pass.
 */

import { describe, expect, it } from "vitest";
import { buildFreeTower } from "../../src/game/freeStack";
import { applyRunSeed } from "../../src/game/towers";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { decodeRunReplay, encodeRunReplay, MAX_SHARE_TICKS, type RunReplay } from "../../src/game/runReplay";
import { DAILY_PEAK_EPSILON_M, verifyDailyReplay } from "../../src/game/dailyVerify";
import { dailySeedFor } from "../../src/lib/dailyDay";
import type { PlayerInput } from "../../src/game/types";

const DAY = "2026-09-26";
const SEED = dailySeedFor(DAY);
const MIDDAY = new Date("2026-09-26T12:00:00Z");

/**
 * Play a deterministic scripted run exactly as useClimb records one: the
 * input for each climb tick is logged, then stepped. The policy (hold a random
 * direction for 10 ticks, always climb, jump every 23 ticks, RNG state 28)
 * was picked because it climbs well past the first ledge on DAY's tower
 * (~8.2 m) but not on the previous day's (~2.6 m), so a relabelled replay
 * cannot pass by coincidence.
 */
function playRun(seed: string, maxTicks = 6000): { inputs: PlayerInput[]; peakY: number } {
  const state = createMatch({
    seed,
    mode: "solo",
    tower: applyRunSeed(buildFreeTower(), seed),
    playerIds: ["you"],
  });
  while (state.phase === "countdown") stepMatch(state, {});
  const inputs: PlayerInput[] = [];
  let r = 28;
  let moveX: -1 | 0 | 1 = 1;
  while (state.phase === "climb" && inputs.length < maxTicks) {
    if (inputs.length % 10 === 0) {
      r = (r * 16807) % 2147483647;
      moveX = ((r % 3) - 1) as -1 | 0 | 1;
    }
    const input: PlayerInput = { moveX, jump: inputs.length % 23 === 0, climbY: 1, usePowerUp: false };
    inputs.push({ ...input });
    stepMatch(state, { you: input });
  }
  return { inputs, peakY: state.players[0].peakY };
}

async function tokenFor(seed: string, peakY: number, inputs: PlayerInput[]): Promise<RunReplay> {
  const token = await encodeRunReplay({ seed, peakY, inputs });
  expect(token).toBeTruthy();
  const decoded = await decodeRunReplay(token as string);
  expect(decoded).not.toBeNull();
  return decoded as RunReplay;
}

describe("verifyDailyReplay", () => {
  it("accepts an honest run and returns the server's own peak", async () => {
    const run = playRun(SEED);
    expect(run.peakY).toBeGreaterThan(5);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);

    const verdict = verifyDailyReplay(replay, run.peakY, MIDDAY);
    expect(verdict).toEqual({
      ok: true,
      day: DAY,
      peakY: run.peakY,
      ticks: run.inputs.length,
      finished: false,
    });
  });

  it("falls back to the token's claim when the body carries none", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    expect(verifyDailyReplay(replay, null, MIDDAY)).toMatchObject({ ok: true, peakY: run.peakY });
  });

  it("rejects a body claim above what the inputs produce", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    const verdict = verifyDailyReplay(replay, run.peakY + 1, MIDDAY);
    expect(verdict).toMatchObject({ ok: false, code: "REPLAY_MISMATCH", serverPeakY: run.peakY });
  });

  it("rejects a token whose embedded claim was forged", async () => {
    const run = playRun(SEED);
    const forged = await tokenFor(SEED, run.peakY + 50, run.inputs);
    expect(verifyDailyReplay(forged, null, MIDDAY)).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
    // Even when the body echoes the honest number, the token must agree too.
    expect(verifyDailyReplay(forged, run.peakY, MIDDAY)).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
  });

  it("tolerates only the token's 0.1 m rounding", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    expect(verifyDailyReplay(replay, run.peakY + DAILY_PEAK_EPSILON_M / 2, MIDDAY).ok).toBe(true);
    expect(verifyDailyReplay(replay, run.peakY + DAILY_PEAK_EPSILON_M * 2, MIDDAY).ok).toBe(false);
  });

  it("rejects inputs replayed on a different tower than the one played", async () => {
    // Played on today's tower, relabelled as yesterday's inside the grace
    // window: the seed is accepted, but the inputs no longer reproduce the claim.
    const run = playRun(SEED);
    const relabelled = await tokenFor(dailySeedFor("2026-09-25"), run.peakY, run.inputs);
    const verdict = verifyDailyReplay(relabelled, run.peakY, new Date("2026-09-26T00:03:00Z"));
    expect(verdict).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
    if (!verdict.ok) expect(verdict.serverPeakY).toBeLessThan(run.peakY - 1);
  });

  it("scores yesterday's tower for yesterday inside the grace window only", async () => {
    const seed = dailySeedFor("2026-09-25");
    const run = playRun(seed);
    const replay = await tokenFor(seed, run.peakY, run.inputs);
    expect(verifyDailyReplay(replay, run.peakY, new Date("2026-09-26T00:04:00Z"))).toMatchObject({
      ok: true,
      day: "2026-09-25",
    });
    expect(verifyDailyReplay(replay, run.peakY, new Date("2026-09-26T00:30:00Z"))).toMatchObject({
      ok: false,
      code: "DAY_CLOSED",
    });
  });

  it("rejects a closed day even for an honest run", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    expect(verifyDailyReplay(replay, run.peakY, new Date("2026-09-28T12:00:00Z"))).toMatchObject({
      ok: false,
      code: "DAY_CLOSED",
    });
  });

  it("rejects an input log longer than MAX_SHARE_TICKS", () => {
    const idle: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
    const tooLong: RunReplay = {
      version: 1,
      seed: SEED,
      peakY: 0,
      inputs: Array.from({ length: MAX_SHARE_TICKS + 1 }, () => idle),
    };
    expect(verifyDailyReplay(tooLong, 0, MIDDAY)).toMatchObject({ ok: false, code: "RUN_TOO_LONG" });
    // The same idle run at the cap is not rejected for length.
    const atCap: RunReplay = { ...tooLong, inputs: tooLong.inputs.slice(0, MAX_SHARE_TICKS) };
    expect(verifyDailyReplay(atCap, null, MIDDAY)).not.toMatchObject({ code: "RUN_TOO_LONG" });
  });
});
