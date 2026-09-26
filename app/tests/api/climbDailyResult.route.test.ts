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
import { encodeRunReplay } from "../../src/game/runReplay";
import { dailySeedFor } from "../../src/lib/dailyDay";
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
