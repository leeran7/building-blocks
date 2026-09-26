/**
 * verifyDailyReplay — the server re-simulation that decides a daily score.
 *
 * Runs are produced the way the client produces them: a solo match built like
 * useClimb (player "you", applyRunSeed(buildFreeTower(), seed)), stepped tick
 * by tick with the input logged before each climb step, then encoded with the
 * real encodeRunReplay and decoded with the real decodeRunReplay. Every
 * rejection is proven against a fixture that would otherwise pass.
 */

import { describe, expect, it, vi } from "vitest";
import { buildFreeTower } from "../../src/game/freeStack";
import { applyRunSeed } from "../../src/game/towers";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { decodeRunReplay, encodeRunReplay, MAX_SHARE_TICKS, packInputLog, type RunReplay } from "../../src/game/runReplay";
import { deflateSync } from "node:zlib";
import { DAILY_PEAK_EPSILON_M, dailyInputHash, verifyDailyReplay } from "../../src/game/dailyVerify";
import { dailySeedFor } from "../../src/lib/dailySeedServer";
import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";

vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
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
      inputHash: dailyInputHash(run.inputs),
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

// ---------------------------------------------------------------------------
// Verifier additions.
// ---------------------------------------------------------------------------

describe("verifyDailyReplay (verifier)", () => {
  it("fixture precondition: the scripted inputs mean something only on DAY's tower", () => {
    // loop/learnings (replay-fixtures): a wrong-seed test is vacuous unless the
    // same inputs reach a clearly different height on the other tower.
    const run = playRun(SEED);
    const other = playRun(dailySeedFor("2026-09-25"));
    expect(Math.abs(run.peakY - other.peakY)).toBeGreaterThan(1);
  });

  it("rejects an honest run relabelled as tomorrow's tower (future day)", async () => {
    const run = playRun(SEED);
    const tomorrow = await tokenFor(dailySeedFor("2026-09-27"), run.peakY, run.inputs);
    expect(verifyDailyReplay(tomorrow, run.peakY, new Date("2026-09-26T23:59:59.999Z"))).toMatchObject({
      ok: false,
      code: "DAY_CLOSED",
    });
  });

  it("rejects yesterday's honest run 1 ms after the grace window", async () => {
    const seed = dailySeedFor("2026-09-25");
    const run = playRun(seed);
    const replay = await tokenFor(seed, run.peakY, run.inputs);
    const edge = Date.parse("2026-09-26T00:10:00.000Z");
    expect(verifyDailyReplay(replay, run.peakY, edge)).toMatchObject({ ok: true, day: "2026-09-25" });
    expect(verifyDailyReplay(replay, run.peakY, edge + 1)).toMatchObject({ ok: false, code: "DAY_CLOSED" });
  });

  it("rejects the tower from 2 days ago and non-daily seeds", async () => {
    const run = playRun(SEED);
    const old = await tokenFor(SEED, run.peakY, run.inputs);
    expect(verifyDailyReplay(old, run.peakY, new Date("2026-09-28T00:01:00Z"))).toMatchObject({
      ok: false,
      code: "DAY_CLOSED",
    });
    const solo: RunReplay = { ...old, seed: "solo" };
    expect(verifyDailyReplay(solo, run.peakY, MIDDAY)).toMatchObject({ ok: false, code: "DAY_CLOSED" });
  });

  it("rejects an empty input log", () => {
    const empty: RunReplay = { version: 1, seed: SEED, peakY: 0, inputs: [] };
    expect(verifyDailyReplay(empty, 0, MIDDAY)).toMatchObject({ ok: false, code: "RUN_TOO_LONG" });
  });

  it("rejects a non-finite claim instead of skipping the comparison", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    const nanToken: RunReplay = { ...replay, peakY: Number.NaN };
    expect(verifyDailyReplay(nanToken, null, MIDDAY)).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
    expect(verifyDailyReplay(replay, Number.POSITIVE_INFINITY, MIDDAY)).toMatchObject({
      ok: false,
      code: "REPLAY_MISMATCH",
    });
  });

  it("returns the server peak, not the claim, when the claim is inside the slack", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    const verdict = verifyDailyReplay(replay, run.peakY + DAILY_PEAK_EPSILON_M * 0.9, MIDDAY);
    expect(verdict).toMatchObject({ ok: true });
    if (verdict.ok) expect(verdict.peakY).toBe(run.peakY);
  });

  it("rejects a claim below the server peak by more than the slack (desync either way)", async () => {
    const run = playRun(SEED);
    const replay = await tokenFor(SEED, run.peakY, run.inputs);
    expect(verifyDailyReplay(replay, run.peakY - 1, MIDDAY)).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
  });
});

describe("canonical input hash (SEC-DC-2)", () => {
  const idle: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };

  async function verdictFor(inputs: PlayerInput[], peakY: number) {
    return verifyDailyReplay(await tokenFor(SEED, peakY, inputs), peakY, MIDDAY);
  }

  it("ignores inputs padded after the run ended", async () => {
    const run = playRun(SEED);
    const padded = [...run.inputs, ...Array.from({ length: 40 }, () => idle)];
    const a = await verdictFor(run.inputs, run.peakY);
    const b = await verdictFor(padded, run.peakY);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Precondition: the padded log really is longer than what the sim used.
    expect(b.ticks).toBe(run.inputs.length + 40);
    expect(b.inputHash).toBe(a.inputHash);
  });

  it("ignores unused bits in the packed input bytes", async () => {
    const run = playRun(SEED);
    const packed = packInputLog(run.inputs);
    // Bits 5-7 carry nothing; set them all on every byte.
    const noisy = Buffer.from(packed.map((b) => b | 0b1110_0000));
    const i = deflateSync(noisy).toString("base64url");
    const token = Buffer.from(JSON.stringify({ v: 1, s: SEED, p: run.peakY, i })).toString("base64url");
    const replay = await decodeRunReplay(token);
    expect(replay).not.toBeNull();
    const a = await verdictFor(run.inputs, run.peakY);
    const b = verifyDailyReplay(replay!, run.peakY, MIDDAY);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.inputHash).toBe(a.inputHash);
  });

  it("differs for a genuinely different run", async () => {
    const run = playRun(SEED);
    const changed = run.inputs.map((input, t) => (t === 5 ? { ...input, jump: !input.jump } : input));
    const a = await verdictFor(run.inputs, run.peakY);
    expect(a.ok).toBe(true);
    expect(dailyInputHash(changed)).not.toBe(dailyInputHash(run.inputs));
    expect(dailyInputHash(run.inputs)).toMatch(/^[0-9a-f]{64}$/);
  });
});

