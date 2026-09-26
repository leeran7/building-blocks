/**
 * SEC-DC-11 / SEC-DC-15 at the route boundary. POST /api/climb/daily/result
 * must decide whether to claim a run from the SERVER's re-simulated peak
 * (inclusively at DAILY_CLAIM_MIN_PEAK_M) and the SERVER's input segment
 * count (inclusively at DAILY_CLAIM_MIN_INPUT_SEGMENTS), and must enforce the
 * claim's answer only for runs it claims.
 *
 * Real runs cannot be steered to land exactly on 6 m, so verifyDailyReplay is
 * stubbed to return chosen verdicts. The client's claimed peak is deliberately
 * set on the other side of the floor from the server's peak, so a route that
 * gated on the client value (or offset the server value) goes red. The real
 * dailyRunNeedsClaim and constant are kept. Token parsing, the day check and
 * inflate are real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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
  claimDailyReplay: vi.fn(async (input: { userId: string }) => input.userId),
  dailyLeaderboardTag: (day: string) => `daily-leaderboard:${day}`,
  recordDailyClimb: vi.fn(async (input: { peakY: number }) => ({ peakY: input.peakY, improved: true, attempts: 1 })),
  dailyStandingFor: vi.fn(async () => ({ rank: 3, peakY: 0, attempts: 1 })),
  dailyClimberCount: vi.fn(async () => 12),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("../../src/game/dailyVerify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/dailyVerify")>();
  return { ...actual, verifyDailyReplay: vi.fn() };
});

import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";
vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);

import { POST } from "../../app/api/climb/daily/result/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { claimDailyReplay, recordDailyClimb } from "../../src/db/dailyClimb";
import { DAILY_CLAIM_MIN_INPUT_SEGMENTS, DAILY_CLAIM_MIN_PEAK_M, verifyDailyReplay } from "../../src/game/dailyVerify";
import { DAILY_SIM_VERSION } from "../../src/game/simVersion";
import { encodeRunReplay } from "../../src/game/runReplay";
import { dailySeedFor } from "../../src/lib/dailySeedServer";
import type { PlayerInput } from "../../src/game/types";

const DAY = "2026-09-26";
const HASH = "ab".repeat(32);

async function postRun(clientPeakY: number): Promise<Response> {
  const seed = dailySeedFor(DAY);
  const idle: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
  const replayToken = await encodeRunReplay({ seed, peakY: clientPeakY, inputs: Array.from({ length: 40 }, () => ({ ...idle })) });
  expect(replayToken).toBeTruthy();
  return POST(
    new NextRequest("http://localhost/api/climb/daily/result", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer good" },
      body: JSON.stringify({ peakY: clientPeakY, seed, replayToken, simVersion: DAILY_SIM_VERSION }),
    }),
  );
}

/** Segment count of the scripted real climb: far above the SEC-DC-15 floor. */
const REAL_SEGMENTS = 31;

function serverVerdict(peakY: number, inputSegments = REAL_SEGMENTS) {
  vi.mocked(verifyDailyReplay).mockReturnValue({
    ok: true,
    day: DAY,
    peakY,
    ticks: 40,
    finished: false,
    inputHash: HASH,
    inputSegments,
  });
}

describe("claim floor at the route: server peak, inclusive boundary (SEC-DC-11, verifier)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date(`${DAY}T12:00:00Z`), toFake: ["Date"] });
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: "u1",
      email: "u1@example.com",
      email_verified: true,
    } as Awaited<ReturnType<typeof verifyIdToken>>);
    vi.mocked(claimDailyReplay).mockImplementation(async ({ userId }) => userId);
  });

  it("precondition: the floor under test is 6 m", () => {
    expect(DAILY_CLAIM_MIN_PEAK_M).toBe(6);
  });

  it("a server peak of exactly the floor is claimed, even when the client claims less", async () => {
    serverVerdict(DAILY_CLAIM_MIN_PEAK_M);
    const res = await postRun(DAILY_CLAIM_MIN_PEAK_M - 0.05);
    expect(verifyDailyReplay).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(claimDailyReplay).toHaveBeenCalledTimes(1);
    expect(vi.mocked(claimDailyReplay).mock.calls[0][0]).toEqual({ userId: "u1", day: DAY, inputHash: HASH });
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0]).toMatchObject({ userId: "u1", peakY: DAILY_CLAIM_MIN_PEAK_M });
  });

  it("a server peak of exactly the floor that another account owns is 409 and not saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(claimDailyReplay).mockResolvedValue("someone-else");
    serverVerdict(DAILY_CLAIM_MIN_PEAK_M);
    const res = await postRun(DAILY_CLAIM_MIN_PEAK_M);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("REPLAY_REUSED");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("a server peak just under the floor is saved unclaimed, even when the client claims more", async () => {
    serverVerdict(DAILY_CLAIM_MIN_PEAK_M - 0.001);
    const res = await postRun(DAILY_CLAIM_MIN_PEAK_M + 0.05);
    expect(verifyDailyReplay).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { saved?: boolean }).saved).toBe(true);
    expect(claimDailyReplay).not.toHaveBeenCalled();
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0]).toMatchObject({ userId: "u1", peakY: DAILY_CLAIM_MIN_PEAK_M - 0.001 });
  });

  it("an unclaimed sub-floor run is saved even if its hash is already owned elsewhere", async () => {
    vi.mocked(claimDailyReplay).mockResolvedValue("someone-else");
    serverVerdict(3.8); // the measured best of a held right + jump + climb run
    const res = await postRun(3.8);
    expect(res.status).toBe(200);
    expect(claimDailyReplay).not.toHaveBeenCalled();
    expect(recordDailyClimb).toHaveBeenCalledTimes(1);
  });
});

describe("segment floor at the route: server count, inclusive boundary (SEC-DC-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date(`${DAY}T12:00:00Z`), toFake: ["Date"] });
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: "u1",
      email: "u1@example.com",
      email_verified: true,
    } as Awaited<ReturnType<typeof verifyIdToken>>);
    vi.mocked(claimDailyReplay).mockImplementation(async ({ userId }) => userId);
  });

  it("precondition: the segment floor under test is 4", () => {
    expect(DAILY_CLAIM_MIN_INPUT_SEGMENTS).toBe(4);
  });

  it("a high run with exactly the segment floor is claimed, and refused when owned elsewhere", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(claimDailyReplay).mockResolvedValue("someone-else");
    serverVerdict(40, DAILY_CLAIM_MIN_INPUT_SEGMENTS);
    const res = await postRun(40);
    expect(claimDailyReplay).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("REPLAY_REUSED");
    expect(recordDailyClimb).not.toHaveBeenCalled();
  });

  it("a high run one segment under the floor is saved unclaimed even if its hash is owned elsewhere", async () => {
    vi.mocked(claimDailyReplay).mockResolvedValue("someone-else");
    serverVerdict(176, DAILY_CLAIM_MIN_INPUT_SEGMENTS - 1);
    const res = await postRun(176);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { saved?: boolean }).saved).toBe(true);
    expect(claimDailyReplay).not.toHaveBeenCalled();
    expect(vi.mocked(recordDailyClimb).mock.calls[0][0]).toMatchObject({ userId: "u1", peakY: 176 });
  });
});
