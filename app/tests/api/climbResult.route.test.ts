/**
 * POST /api/climb/result is the production caller of checkClimbResult.
 *
 * A unit test of the bound is not coverage of the persist path: if the route
 * stopped calling it, honest jetpack peaks would still look fine in
 * scoreBounds.test.ts while 1e9 took rank 1 forever.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("../../src/db/climb", () => ({
  recordClimb: vi.fn(),
}));

vi.mock("../../src/db/user", () => ({
  ensureUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "../../app/api/climb/result/route";
import { recordClimb } from "../../src/db/climb";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { revalidatePath } from "next/cache";
import { maxReachablePeakY } from "../../src/game/scoreBounds";
import { FASTEST_ARCHETYPE } from "../../src/game/towers";
import { TICK_DT, NO_INPUT } from "../../src/game/types";
import { JETPACK_MAX_VY, POWER_UP_HOVER_M, RAPID_CLIMB_MULT, jetpackFuelTicks } from "../../src/game/powerups";
import { buildTower } from "../../src/game/towers";
import { createMatch, stepMatch } from "../../src/game/simulation";

async function postResult(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/climb/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/climb/result calls checkClimbResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unbounded peak with IMPLAUSIBLE_RESULT", async () => {
    const res = await postResult({ peakY: 1e9, ticks: 100, seed: "x" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("IMPLAUSIBLE_RESULT");
  });

  it("rejects a claim that would have fit the deleted super-jump envelope", async () => {
    const ticks = 100;
    const nowCeiling = maxReachablePeakY(ticks);
    const deletedSuperJumpCeiling =
      FASTEST_ARCHETYPE.jumpSpeed * 1.6 * ticks * TICK_DT + 1;
    expect(nowCeiling).toBe(
      Math.max(
        FASTEST_ARCHETYPE.maxClimbSpeed * RAPID_CLIMB_MULT,
        FASTEST_ARCHETYPE.jumpSpeed,
        JETPACK_MAX_VY
      ) *
        ticks *
        TICK_DT +
        1
    );
    expect(nowCeiling).toBeLessThan(deletedSuperJumpCeiling);
    const claim = (nowCeiling + deletedSuperJumpCeiling) / 2;
    const res = await postResult({ peakY: claim, ticks, seed: "x" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("IMPLAUSIBLE_RESULT");
  });

  it("accepts a peak measured from a real jetpack thrust run", async () => {
    const tower = buildTower("ai", { runSeed: "jetpack-route" });
    const match = createMatch({
      seed: "jetpack-route",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    match.phase = "climb";
    match.tick = 0;
    match.powerUps = [];
    match.powerUpFloorHi = 100_000;
    const player = match.players[0]!;
    match.powerUps.push({
      id: "test:jetpack",
      type: "jetpack",
      floorIndex: 0,
      x: player.x,
      y: player.y + POWER_UP_HOVER_M,
      collected: false,
      collectedTick: null,
    });
    const jump = { moveX: 0, jump: true, climbY: 0, usePowerUp: false } as const;
    stepMatch(match, { p1: NO_INPUT });
    stepMatch(match, { p1: jump });
    const tank = jetpackFuelTicks();
    for (let i = 0; i < tank; i++) stepMatch(match, { p1: jump });

    const res = await postResult({
      peakY: player.peakY,
      ticks: match.tick,
      seed: "jetpack-route",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { saved?: boolean };
    expect(body.saved).toBe(false);
  });

  it("revalidates leaderboard pages after a persisted run", async () => {
    vi.mocked(verifyIdToken).mockResolvedValue({
      uid: "user-1",
      email: "climber@example.com",
      email_verified: true,
    } as Awaited<ReturnType<typeof verifyIdToken>>);
    vi.mocked(recordClimb).mockResolvedValue({
      peakY: 120,
      improved: true,
      rank: 4,
      totalClimbers: 40,
      handle: "Climber",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/climb/result", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ peakY: 120, ticks: 500, seed: "saved-run" }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { saved?: boolean; rank?: number };
    expect(body.saved).toBe(true);
    expect(body.rank).toBe(4);
    expect(revalidatePath).toHaveBeenCalledWith("/climb");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
