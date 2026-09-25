/**
 * GET /api/climb/leaderboard/friends — the board is always the verified
 * token's user. A user id smuggled in the query must not let one player read
 * another player's friend graph.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { checkRateLimit, verifyIdToken, friendsLeaderboard, getRedis } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async (_opts: unknown) => ({ allowed: true, degraded: false })),
  getRedis: vi.fn(() => {
    throw new Error("redis down");
  }),
  verifyIdToken: vi.fn(async (_token: string) => ({ uid: "token-uid" })),
  friendsLeaderboard: vi.fn(async (_userId: string) => ({
    climbers: [{ rank: 1, userId: "token-uid", handle: "Me", username: null, peakY: 120, wins: 0 }],
    hiddenCount: 2,
    notClimbedCount: 3,
  })),
}));

vi.mock("../../src/lib/rateLimit", () => ({ checkRateLimit }));
// Only reached through the real checkRateLimit in the fail-open test below.
vi.mock("../../src/lib/redis", () => ({ getRedis }));
vi.mock("../../src/lib/firebaseAdmin", () => ({ verifyIdToken }));
vi.mock("../../src/db/climb", () => ({ friendsLeaderboard }));

import { GET } from "../../app/api/climb/leaderboard/friends/route";

function get(path = "/api/climb/leaderboard/friends", token: string | null = "t"): Promise<Response> {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return GET(new NextRequest(`http://localhost${path}`, { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/climb/leaderboard/friends", () => {
  it("401s without a bearer token and never reads the board", async () => {
    const res = await get(undefined, null);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(friendsLeaderboard).not.toHaveBeenCalled();
  });

  it("401s when the token does not verify", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("expired"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(friendsLeaderboard).not.toHaveBeenCalled();
  });

  it("429s when rate limited, keyed on the token uid", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, degraded: false });
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "leaderboard:friends", identifier: "token-uid", max: 60, windowSeconds: 60 })
    );
    expect(friendsLeaderboard).not.toHaveBeenCalled();
  });

  it("ignores a userId in the query and builds the board for the token uid", async () => {
    const res = await get("/api/climb/leaderboard/friends?userId=someone-else&uid=someone-else");
    expect(res.status).toBe(200);
    expect(friendsLeaderboard).toHaveBeenCalledTimes(1);
    expect(friendsLeaderboard).toHaveBeenCalledWith("token-uid");
  });

  it("returns the board shape with a private, no-store cache header", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      climbers: [{ rank: 1, userId: "token-uid", handle: "Me", username: null, peakY: 120, wins: 0 }],
      hiddenCount: 2,
      notClimbedCount: 3,
    });
  });

  it("500s without leaking the database error", async () => {
    friendsLeaderboard.mockRejectedValueOnce(new Error("connection refused at 10.0.0.5"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });

  it("still serves the board when Redis is down (fails open through the real limiter)", async () => {
    const real = await vi.importActual<typeof import("../../src/lib/rateLimit")>("../../src/lib/rateLimit");
    checkRateLimit.mockImplementationOnce((opts) => real.checkRateLimit(opts as Parameters<typeof real.checkRateLimit>[0]));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await get();
    expect(getRedis).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(friendsLeaderboard).toHaveBeenCalledWith("token-uid");
  });
});
