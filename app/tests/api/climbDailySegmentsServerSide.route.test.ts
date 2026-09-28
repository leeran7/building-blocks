/**
 * SEC-DC-15 at the route with the REAL re-simulation (verifier). The claim
 * exemption must depend only on the segment count the server computes over
 * the canonical consumed bytes:
 * - a client-sent segment count (or any other extra field) changes nothing;
 * - a tail padded after death adds no segment at the route either;
 * - real runs sitting exactly on the floor (3 vs 4 segments, both > 6 m) fall
 *   on the right side of it.
 *
 * The DB is mocked with a first-claim-wins store; encode/decode, verification
 * and the segment count are production code.
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
  claimDailyReplay: vi.fn(),
  dailyLeaderboardTag: (day: string) => `daily-leaderboard:${day}`,
  recordDailyClimb: vi.fn(async (input: { peakY: number }) => ({ peakY: input.peakY, improved: true, attempts: 1 })),
  dailyStandingFor: vi.fn(async () => ({ rank: 3, peakY: 0, attempts: 1 })),
  dailyClimberCount: vi.fn(async () => 12),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";
vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);

import { POST } from "../../app/api/climb/daily/result/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { claimDailyReplay, recordDailyClimb } from "../../src/db/dailyClimb";
import { buildFreeTower } from "../../src/game/freeStack";
import { applyRunSeed } from "../../src/game/towers";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { encodeRunReplay, MAX_SHARE_TICKS } from "../../src/game/runReplay";
import { dailySeedFor } from "../../src/lib/dailySeedServer";
import { DAILY_CLAIM_MIN_INPUT_SEGMENTS, DAILY_CLAIM_MIN_PEAK_M, dailyInputSegments } from "../../src/game/dailyVerify";
import { DAILY_SIM_VERSION } from "../../src/game/simVersion";
import type { PlayerInput } from "../../src/game/types";

/** 2026-09-20: holding climb scales the spawn ladder (see dailyVerify.test.ts). */
const HELD_DAY = "2026-09-20";
const SCRIPTED_DAY = "2026-09-26";

const still: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const climb: PlayerInput = { ...still, climbY: 1 };
const climbJump: PlayerInput = { ...climb, jump: true };

function play(seed: string, policy: (tick: number) => PlayerInput): { inputs: PlayerInput[]; peakY: number } {
  const state = createMatch({ seed, mode: "solo", tower: applyRunSeed(buildFreeTower(), seed), playerIds: ["you"] });
  while (state.phase === "countdown") stepMatch(state, {});
  const inputs: PlayerInput[] = [];
  while (state.phase === "climb" && inputs.length < MAX_SHARE_TICKS) {
    const input = policy(inputs.length);
    inputs.push({ ...input });
    stepMatch(state, { you: input });
  }
  return { inputs, peakY: state.players[0].peakY };
}

/** The scripted 38-segment real climb shared with the other daily route tests. */
function scripted(seed: string) {
  let r = 28;
  let moveX: -1 | 0 | 1 = 1;
  return play(seed, (t) => {
    if (t % 10 === 0) {
      r = (r * 16807) % 2147483647;
      moveX = ((r % 3) - 1) as -1 | 0 | 1;
    }
    return { moveX, jump: t % 23 === 0, climbY: 1, usePowerUp: false };
  });
}

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/climb/daily/result", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer good-token" },
      body: JSON.stringify({ simVersion: DAILY_SIM_VERSION, ...body }),
    }),
  );
}

const asUser = (uid: string) =>
  vi.mocked(verifyIdToken).mockResolvedValue({
    uid,
    email: `${uid}@example.com`,
    email_verified: true,
  } as Awaited<ReturnType<typeof verifyIdToken>>);

let owners: Map<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  owners = new Map();
  vi.mocked(claimDailyReplay).mockImplementation(async ({ userId, day, inputHash }) => {
    const key = `${day}:${inputHash}`;
    if (!owners.has(key)) owners.set(key, userId);
    return owners.get(key)!;
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function codeOf(res: Response): Promise<string | undefined> {
  return ((await res.clone().json()) as { code?: string }).code;
}

async function twoAccounts(body: Record<string, unknown>, second: Record<string, unknown> = body) {
  asUser("u1");
  const first = await post(body);
  asUser("u2");
  const other = await post(second);
  return { first, other };
}

describe("the segment count comes only from the server (SEC-DC-15, verifier)", () => {
  it("a copier who also sends a low segment count (and a fake hash) is still refused", async () => {
    vi.useFakeTimers({ now: new Date(`${SCRIPTED_DAY}T12:00:00Z`), toFake: ["Date"] });
    const seed = dailySeedFor(SCRIPTED_DAY);
    const run = scripted(seed);
    // Precondition: a real claimed climb (over both floors).
    expect(run.peakY).toBeGreaterThanOrEqual(DAILY_CLAIM_MIN_PEAK_M);
    expect(dailyInputSegments(run.inputs)).toBeGreaterThanOrEqual(DAILY_CLAIM_MIN_INPUT_SEGMENTS);
    const replayToken = await encodeRunReplay({ seed, peakY: run.peakY, inputs: run.inputs });
    const honest = { peakY: run.peakY, replayToken };
    const forged = { ...honest, inputSegments: 1, segments: 1, inputHash: "0".repeat(64) };

    const { first, other } = await twoAccounts(honest, forged);
    expect(first.status).toBe(200);
    expect(other.status).toBe(409);
    expect(await codeOf(other)).toBe("REPLAY_REUSED");
    expect(vi.mocked(recordDailyClimb).mock.calls.map(([c]) => c.userId)).toEqual(["u1"]);
  });

  it("a held-input run padded after death with varied inputs is still exempt at the route", async () => {
    vi.useFakeTimers({ now: new Date(`${HELD_DAY}T12:00:00Z`), toFake: ["Date"] });
    const seed = dailySeedFor(HELD_DAY);
    const run = play(seed, () => climb);
    const tail = [
      ...Array.from({ length: 10 }, () => ({ ...still, moveX: -1 as const })),
      ...Array.from({ length: 10 }, () => ({ ...still, jump: true })),
      ...Array.from({ length: 10 }, () => ({ ...still, moveX: 1 as const })),
    ];
    const padded = [...run.inputs, ...tail];
    // Positive fixture: counted over the raw token inputs this log would be claimed.
    expect(dailyInputSegments(run.inputs)).toBe(1);
    expect(dailyInputSegments(padded)).toBe(4);
    expect(run.peakY).toBeGreaterThan(DAILY_CLAIM_MIN_PEAK_M);
    const body = { peakY: run.peakY, replayToken: await encodeRunReplay({ seed, peakY: run.peakY, inputs: padded }) };

    const { first, other } = await twoAccounts(body);
    expect(first.status).toBe(200);
    expect(other.status).toBe(200);
    expect(claimDailyReplay).not.toHaveBeenCalled();
    expect(vi.mocked(recordDailyClimb).mock.calls.map(([c]) => c.userId)).toEqual(["u1", "u2"]);
  });
});

describe("real runs on the segment floor (SEC-DC-15, verifier)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(`${HELD_DAY}T12:00:00Z`), toFake: ["Date"] });
  });

  /** Hold climb, one climb+jump tick at 60; optionally climb+jump again from tick 91 on. */
  async function heldRun(extraSwitch: boolean) {
    const seed = dailySeedFor(HELD_DAY);
    const run = play(seed, (t) => (t === 60 || (extraSwitch && t >= 91) ? climbJump : climb));
    return { run, body: { peakY: run.peakY, replayToken: await encodeRunReplay({ seed, peakY: run.peakY, inputs: run.inputs }) } };
  }

  it("3 segments over 6 m: two honest accounts are both saved and ranked", async () => {
    const { run, body } = await heldRun(false);
    expect(dailyInputSegments(run.inputs)).toBe(DAILY_CLAIM_MIN_INPUT_SEGMENTS - 1);
    expect(run.peakY).toBeGreaterThan(DAILY_CLAIM_MIN_PEAK_M);

    const { first, other } = await twoAccounts(body);
    expect(first.status).toBe(200);
    expect(other.status).toBe(200);
    expect(((await other.json()) as { saved?: boolean }).saved).toBe(true);
    expect(vi.mocked(recordDailyClimb).mock.calls.map(([c]) => [c.userId, c.day])).toEqual([
      ["u1", HELD_DAY],
      ["u2", HELD_DAY],
    ]);
    expect(claimDailyReplay).not.toHaveBeenCalled();
  });

  it("exactly 4 segments over 6 m: claimed by the first account, refused for the second", async () => {
    const { run, body } = await heldRun(true);
    expect(dailyInputSegments(run.inputs)).toBe(DAILY_CLAIM_MIN_INPUT_SEGMENTS);
    expect(run.peakY).toBeGreaterThan(DAILY_CLAIM_MIN_PEAK_M);

    const { first, other } = await twoAccounts(body);
    expect(first.status).toBe(200);
    expect(other.status).toBe(409);
    expect(await codeOf(other)).toBe("REPLAY_REUSED");
    expect(owners.size).toBe(1);
    expect([...owners.values()]).toEqual(["u1"]);
    expect(vi.mocked(recordDailyClimb).mock.calls.map(([c]) => c.userId)).toEqual(["u1"]);
  });
});
