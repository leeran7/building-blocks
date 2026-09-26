/**
 * POST /api/climb/daily/result — the only writer of daily_climb_scores.
 *
 * The persisted height must be the SERVER's re-simulated peak: a unit test of
 * verifyDailyReplay is not coverage of the route that stores the number. The
 * DB layer is mocked; the replay encode/decode and re-simulation are real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({ verifyIdToken: vi.fn() }));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn() }));
vi.mock("../../src/db/client", () => ({
  prisma: { user: { findUnique: vi.fn(async () => ({ leaderboard_consent_at: new Date() })) } },
}));
vi.mock("../../src/db/climb", () => ({
  recordClimb: vi.fn(async () => ({ peakY: 0, improved: false, rank: 1, totalClimbers: 1, handle: "h" })),
}));
vi.mock("../../src/db/dailyClimb", () => ({
  dailyLeaderboardTag: (day: string) => `daily-leaderboard:${day}`,
  recordDailyClimb: vi.fn(async (input: { peakY: number }) => ({ peakY: input.peakY, improved: true, attempts: 1 })),
  dailyStandingFor: vi.fn(async () => ({ rank: 3, peakY: 0, attempts: 1 })),
  dailyClimberCount: vi.fn(async () => 12),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { POST } from "../../app/api/climb/daily/result/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { checkRateLimit } from "../../src/lib/rateLimit";
import { prisma } from "../../src/db/client";
import { recordClimb } from "../../src/db/climb";
import { recordDailyClimb } from "../../src/db/dailyClimb";
import { revalidateTag } from "next/cache";
import { buildFreeTower } from "../../src/game/freeStack";
import { applyRunSeed } from "../../src/game/towers";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { decodeRunReplay, encodeRunReplay, MAX_SHARE_TICKS, packInputLog } from "../../src/game/runReplay";
import { deflateSync } from "node:zlib";
import { dailySeedFor } from "../../src/lib/dailyDay";
import { resimulateSoloRun } from "../../src/game/dailyVerify";
import type { PlayerInput } from "../../src/game/types";

const DAY = "2026-09-26";
const NOW = new Date("2026-09-26T12:00:00Z");

/** Same scripted policy as tests/game/dailyVerify.test.ts (climbs ~8 m on DAY). */
function playRun(seed: string): { inputs: PlayerInput[]; peakY: number; ticks: number } {
  const state = createMatch({ seed, mode: "solo", tower: applyRunSeed(buildFreeTower(), seed), playerIds: ["you"] });
  while (state.phase === "countdown") stepMatch(state, {});
  const inputs: PlayerInput[] = [];
  let r = 28;
  let moveX: -1 | 0 | 1 = 1;
  while (state.phase === "climb" && inputs.length < 6000) {
    if (inputs.length % 10 === 0) {
      r = (r * 16807) % 2147483647;
      moveX = ((r % 3) - 1) as -1 | 0 | 1;
    }
    const input: PlayerInput = { moveX, jump: inputs.length % 23 === 0, climbY: 1, usePowerUp: false };
    inputs.push({ ...input });
    stepMatch(state, { you: input });
  }
  return { inputs, peakY: state.players[0].peakY, ticks: state.tick };
}

async function honestPayload(seed = dailySeedFor(DAY)) {
  const run = playRun(seed);
  const replayToken = await encodeRunReplay({ seed, peakY: run.peakY, inputs: run.inputs });
  return { run, body: { peakY: run.peakY, ticks: run.ticks, seed, replayToken } };
}

function post(body: unknown, token: string | null = "good-token"): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return POST(
    new NextRequest("http://localhost/api/climb/daily/result", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/climb/daily/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Only Date is faked, so promises and CompressionStream still run.
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: "u1",
      email: "u1@example.com",
      email_verified: true,
    } as Awaited<ReturnType<typeof verifyIdToken>>);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores the server's re-simulated peak on both boards and expires the day's cache", async () => {
    const { run, body } = await honestPayload();
    const res = await post(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ saved: true, day: DAY, peakY: run.peakY, rank: 3, totalClimbers: 12, attempts: 1 });

    expect(recordDailyClimb).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0]).toMatchObject({
      userId: "u1",
      day: DAY,
      peakY: run.peakY,
      ticks: run.inputs.length,
    });
    expect(vi.mocked(recordClimb).mock.calls[0][0]).toMatchObject({ userId: "u1", peakY: run.peakY });
    expect(revalidateTag).toHaveBeenCalledWith(`daily-leaderboard:${DAY}`, { expire: 0 });
  });

  it("rejects an inflated claim with 400 REPLAY_MISMATCH and writes nothing", async () => {
    const { run, body } = await honestPayload();
    const res = await post({ ...body, peakY: run.peakY + 500 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("REPLAY_MISMATCH");
    expect(recordDailyClimb).not.toHaveBeenCalled();
    expect(recordClimb).not.toHaveBeenCalled();
  });

  it("rejects a run on a closed day's tower", async () => {
    const { body } = await honestPayload(dailySeedFor("2026-09-24"));
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("DAY_CLOSED");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("requires a replay token", async () => {
    const { body } = await honestPayload();
    const res = await post({ ...body, replayToken: undefined });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("REPLAY_REQUIRED");
  });

  it("does not save (or re-simulate) for an anonymous caller", async () => {
    const { body } = await honestPayload();
    const res = await post(body, null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: false, reason: "anonymous" });
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("does not save without leaderboard consent", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ leaderboard_consent_at: null } as never);
    const { body } = await honestPayload();
    const res = await post(body);
    expect(await res.json()).toEqual({ saved: false, reason: "no_consent" });
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("shares the per-IP bucket with /result and keys the per-user limit by day", async () => {
    const { body } = await honestPayload();
    await post(body);
    const calls = vi.mocked(checkRateLimit).mock.calls.map(([opts]) => opts);
    expect(calls).toContainEqual(expect.objectContaining({ namespace: "climb", identifier: "ip:127.0.0.1" }));
    expect(calls).toContainEqual(expect.objectContaining({ namespace: "climb:daily", identifier: `u1:${DAY}` }));
  });

  it("answers 429 when the per-user daily limit is spent", async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true, degraded: false })
      .mockResolvedValueOnce({ allowed: false, degraded: false });
    const { body } = await honestPayload();
    const res = await post(body);
    expect(res.status).toBe(429);
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Verifier additions: AC-2..AC-5 at the route (the layer that writes).
// ---------------------------------------------------------------------------

/**
 * Builds a v1 replay token for an input log of any length, including one
 * encodeRunReplay refuses to produce. Proven against a positive control
 * below, so a drift in the wire format cannot make the too-long case pass by
 * failing to decode for an unrelated reason.
 */
function rawToken(seed: string, peakY: number, inputs: PlayerInput[]): string {
  const i = deflateSync(Buffer.from(packInputLog(inputs))).toString("base64url");
  return Buffer.from(JSON.stringify({ v: 1, s: seed, p: peakY, i })).toString("base64url");
}

const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

describe("POST /api/climb/daily/result (verifier)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: "u1",
      email: "u1@example.com",
      email_verified: true,
    } as Awaited<ReturnType<typeof verifyIdToken>>);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stores the SERVER peak even when the client claim is inside the 0.1 m slack", async () => {
    const { run, body } = await honestPayload();
    const res = await post({ ...body, peakY: run.peakY + 0.09 });
    expect(res.status).toBe(200);
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0].peakY).toBe(run.peakY);
    expect(vi.mocked(recordClimb).mock.calls[0][0].peakY).toBe(run.peakY);
  });

  it("stores the SERVER peak when the body carries no claim at all", async () => {
    const { run, body } = await honestPayload();
    const res = await post({ replayToken: body.replayToken });
    expect(res.status).toBe(200);
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0].peakY).toBe(run.peakY);
  });

  it("rejects a tampered token peak (body echoes the honest peak) with a logged 400", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seed = dailySeedFor(DAY);
    const run = playRun(seed);
    const forged = await encodeRunReplay({ seed, peakY: run.peakY + 40, inputs: run.inputs });
    const res = await post({ replayToken: forged, peakY: run.peakY });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("REPLAY_MISMATCH");
    expect(recordDailyClimb).not.toHaveBeenCalled();
    expect(recordClimb).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[climb/daily/result] replay mismatch",
      expect.objectContaining({ uid: "u1", day: DAY, serverPeakY: run.peakY })
    );
  });

  it("rejects a replay whose inputs were played on a different (open) tower", async () => {
    // 00:03 UTC on the 27th: both the 26th (grace) and the 27th are open.
    vi.setSystemTime(new Date("2026-09-27T00:03:00Z"));
    const run = playRun(dailySeedFor(DAY));
    const otherOpen = dailySeedFor("2026-09-27");
    // Fixture precondition (loop/learnings replay-fixtures): the same inputs
    // must land at a clearly different height on the other tower.
    expect(Math.abs(resimulateSoloRun(otherOpen, run.inputs).player.peakY - run.peakY)).toBeGreaterThan(1);

    const token = await encodeRunReplay({ seed: otherOpen, peakY: run.peakY, inputs: run.inputs });
    const res = await post({ replayToken: token, peakY: run.peakY });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("REPLAY_MISMATCH");

    // A closed day's label (the 25th) is refused before re-simulation.
    const closed = await encodeRunReplay({ seed: dailySeedFor("2026-09-25"), peakY: run.peakY, inputs: run.inputs });
    expect(await codeOf(await post({ replayToken: closed, peakY: run.peakY }))).toBe("DAY_CLOSED");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("AC-3: yesterday's run at 00:05 UTC is saved for yesterday", async () => {
    vi.setSystemTime(new Date("2026-09-27T00:05:00Z"));
    const { run, body } = await honestPayload(dailySeedFor(DAY));
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saved: true, day: DAY, peakY: run.peakY });
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0]).toMatchObject({ day: DAY, peakY: run.peakY });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "climb:daily", identifier: `u1:${DAY}` })
    );
  });

  it("AC-3: yesterday's run at 00:11 UTC is 400 DAY_CLOSED and writes nothing", async () => {
    vi.setSystemTime(new Date("2026-09-27T00:11:00Z"));
    const { body } = await honestPayload(dailySeedFor(DAY));
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("DAY_CLOSED");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("AC-3: tomorrow's tower is 400 DAY_CLOSED", async () => {
    const { body } = await honestPayload(dailySeedFor("2026-09-27"));
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("DAY_CLOSED");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("AC-4: a replay longer than MAX_SHARE_TICKS is refused; one at the cap is not refused for length", async () => {
    const idle: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
    const seed = dailySeedFor(DAY);
    const atCap = rawToken(seed, 0, Array.from({ length: MAX_SHARE_TICKS }, () => idle));
    const over = rawToken(seed, 0, Array.from({ length: MAX_SHARE_TICKS + 1 }, () => idle));

    // Positive control: the builder produces tokens the real decoder accepts.
    expect(await decodeRunReplay(atCap)).not.toBeNull();
    const control = await post({ replayToken: atCap });
    expect(await codeOf(control)).not.toBe("INVALID_REPLAY");

    vi.mocked(recordDailyClimb).mockClear();
    const res = await post({ replayToken: over, peakY: 0 });
    expect(res.status).toBe(400);
    expect(["INVALID_REPLAY", "RUN_TOO_LONG"]).toContain(await codeOf(res));
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("AC-4: missing, empty, whitespace or non-string replay tokens are 400 REPLAY_REQUIRED", async () => {
    let checked = 0;
    for (const replayToken of [undefined, null, "", "   ", 42, { t: "x" }, ["x"]]) {
      const res = await post({ peakY: 5, replayToken });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe("REPLAY_REQUIRED");
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("an undecodable token is 400 INVALID_REPLAY", async () => {
    const res = await post({ replayToken: "not-a-replay", peakY: 5 });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe("INVALID_REPLAY");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("invalid JSON and a JSON non-object are 400 INVALID_JSON", async () => {
    expect(await codeOf(await post("{"))).toBe("INVALID_JSON");
    expect(await codeOf(await post("null"))).toBe("INVALID_JSON");
  });

  it("AC-5: an invalid Firebase token is not saved and nothing is written", async () => {
    vi.mocked(verifyIdToken).mockRejectedValueOnce(new Error("expired"));
    const { body } = await honestPayload();
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: false, reason: "invalid_token" });
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("AC-5: an anonymous Firebase session (no email) is not saved", async () => {
    vi.mocked(verifyIdToken).mockResolvedValueOnce({ uid: "anon" } as Awaited<ReturnType<typeof verifyIdToken>>);
    const { body } = await honestPayload();
    expect(await (await post(body)).json()).toEqual({ saved: false, reason: "anonymous" });
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("AC-6: the per-IP limit answers 429 before any identity or DB work", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, degraded: false });
    const { body } = await honestPayload();
    const res = await post(body);
    expect(res.status).toBe(429);
    expect(await codeOf(res)).toBe("RATE_LIMITED");
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("a DB failure while persisting is a 500 persist_error, never a false success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordDailyClimb).mockRejectedValueOnce(new Error("db down"));
    const { body } = await honestPayload();
    const res = await post(body);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ saved: false, reason: "persist_error" });
  });

  it("returns the stored best (not this run) when the run did not improve", async () => {
    vi.mocked(recordDailyClimb).mockResolvedValueOnce({ peakY: 999, improved: false, attempts: 4 });
    const { body } = await honestPayload();
    const json = await (await post(body)).json();
    expect(json).toMatchObject({ saved: true, peakY: 999, improved: false, attempts: 4 });
  });
});
