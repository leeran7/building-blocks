/**
 * POST /api/duel/[id]/result — the daily duel bonus life (design §5b).
 *
 * grantBonusLife is a monotonic write, so it may only follow a server
 * re-simulated completion. A forfeit (which one client can trigger alone), a
 * first-arrival 202, a 409 and a 422 must never grant. The DB layer and the
 * re-simulation are mocked; the replay decode guards in the route are real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { deflateSync } from "node:zlib";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({ verifyIdToken: vi.fn() }));
vi.mock("../../src/db/duel", () => ({
  getDuel: vi.fn(),
  completeDuel: vi.fn(),
  voidDuelForForfeit: vi.fn(),
  markPlayerSubmitted: vi.fn(),
  getDuelStats: vi.fn(async () => null),
}));
vi.mock("../../src/db/tournaments", () => ({ advanceRound: vi.fn(), assignPrizes: vi.fn() }));
vi.mock("../../src/db/notification", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("../../src/db/levelExtras", () => ({
  // Its once-a-day locking is covered against Postgres (tests/db/levelEngagement.pg.test.ts).
  grantBonusLife: vi.fn(async () => true),
}));
vi.mock("../../src/game/simulation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/game/simulation")>()),
  simulateDuel: vi.fn(),
}));

import { POST } from "../../app/api/duel/[id]/result/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { completeDuel, getDuel, markPlayerSubmitted, voidDuelForForfeit } from "../../src/db/duel";
import { grantBonusLife } from "../../src/db/levelExtras";
import { simulateDuel, type DuelSimResult } from "../../src/game/simulation";
import { packInputLog } from "../../src/game/runReplay";
import type { PlayerInput } from "../../src/game/types";

const DUEL_ID = "duel-1";
const SEED = "seed-abc";
const P1 = "user-p1";
const P2 = "user-p2";
const NO_INPUT: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const REPLAY_B64 = deflateSync(packInputLog([NO_INPUT, NO_INPUT, NO_INPUT])).toString("base64");

const SIM_WIN: DuelSimResult = {
  winnerId: P1,
  player1Peak: 12,
  player2Peak: 8,
  player1CheatFlagged: false,
  player2CheatFlagged: false,
  tiebreakRule: "peak_y",
  finishedTick: 100,
  totalTicks: 100,
};

function duelRow(over: Record<string, unknown> = {}) {
  return {
    id: DUEL_ID,
    seed: SEED,
    category_slug: "general",
    status: "active",
    tournament_id: null,
    player1_id: P1,
    player2_id: P2,
    player1_submitted: false,
    player2_submitted: false,
    player1_replay: REPLAY_B64,
    player2_replay: REPLAY_B64,
    player1: { display_name: "One" },
    player2: { display_name: "Two" },
    ...over,
  };
}

function post(body: Record<string, unknown>): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/duel/${DUEL_ID}/result`, {
    method: "POST",
    headers: { authorization: "Bearer tok", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: DUEL_ID }) });
}

const normalBody = { seed: SEED, inputLog: REPLAY_B64, claimedOutcome: "win" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyIdToken).mockResolvedValue({ uid: P1 } as Awaited<ReturnType<typeof verifyIdToken>>);
  vi.mocked(getDuel).mockResolvedValue(duelRow() as never);
  vi.mocked(markPlayerSubmitted).mockResolvedValue({ bothSubmitted: true, alreadySubmitted: false } as never);
  vi.mocked(simulateDuel).mockReturnValue(SIM_WIN);
  vi.mocked(completeDuel).mockResolvedValue({ outcome: "completed", payoutCents: null } as never);
  vi.mocked(voidDuelForForfeit).mockResolvedValue({ outcome: "voided", payoutCents: null } as never);
});

describe("POST /api/duel/[id]/result — bonus life", () => {
  it("grants both players a bonus life after a server re-simulated completion", async () => {
    const res = await post(normalBody);
    expect(res.status).toBe(200);
    expect(completeDuel).toHaveBeenCalledTimes(1);
    expect(grantBonusLife).toHaveBeenCalledTimes(2);
    const granted = vi.mocked(grantBonusLife).mock.calls.map(([uid]) => uid);
    expect(granted.sort()).toEqual([P1, P2]);
    for (const [, at] of vi.mocked(grantBonusLife).mock.calls) expect(at).toBeInstanceOf(Date);
  });

  it("a failing grant never fails the result", async () => {
    vi.mocked(grantBonusLife).mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(normalBody);
    expect(res.status).toBe(200);
    expect(grantBonusLife).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("does not grant on a forfeit (one client can trigger it alone)", async () => {
    const res = await post({ seed: SEED, claimedOutcome: "forfeit" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ forfeit: true, winnerId: P2 });
    expect(voidDuelForForfeit).toHaveBeenCalledTimes(1);
    expect(grantBonusLife).not.toHaveBeenCalled();
  });

  it("does not grant on the first-arrival 202 pending", async () => {
    vi.mocked(markPlayerSubmitted).mockResolvedValue({ bothSubmitted: false, alreadySubmitted: false } as never);
    const res = await post(normalBody);
    expect(res.status).toBe(202);
    expect(grantBonusLife).not.toHaveBeenCalled();
  });

  it("does not grant on a 409 when the duel was already resolved", async () => {
    vi.mocked(completeDuel).mockResolvedValue({ outcome: "already_resolved" } as never);
    const res = await post(normalBody);
    expect(res.status).toBe(409);
    expect(grantBonusLife).not.toHaveBeenCalled();
  });

  it("does not grant on a 409 duplicate submission", async () => {
    vi.mocked(markPlayerSubmitted).mockResolvedValue({ bothSubmitted: true, alreadySubmitted: true } as never);
    const res = await post(normalBody);
    expect(res.status).toBe(409);
    expect(grantBonusLife).not.toHaveBeenCalled();
  });

  it("does not grant on a 422 cheat flag", async () => {
    vi.mocked(simulateDuel).mockReturnValue({ ...SIM_WIN, player2CheatFlagged: true });
    const res = await post(normalBody);
    expect(res.status).toBe(422);
    expect(completeDuel).not.toHaveBeenCalled();
    expect(grantBonusLife).not.toHaveBeenCalled();
  });

  it("does not grant on a 422 no-winner simulation", async () => {
    vi.mocked(simulateDuel).mockReturnValue({ ...SIM_WIN, winnerId: null, tiebreakRule: null });
    const res = await post(normalBody);
    expect(res.status).toBe(422);
    expect(grantBonusLife).not.toHaveBeenCalled();
  });
});
