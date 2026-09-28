/**
 * GET /api/climb/daily/leaderboard and /friends, against Next's REAL cache.
 *
 * The public board is cached per day (unstable_cache, 30 s); the caller's own
 * standing (`me`) must NOT be: a cached `me` would show one player another
 * player's rank. Here next/cache is real (in-memory IncrementalCache, each
 * request inside a work store) and src/db/dailyClimb is real; only Prisma,
 * auth and the rate limiter are mocked. The consent filter's SQL semantics
 * are proven against Postgres in tests/db/dailyClimb.pg.test.ts; this file
 * proves the route and cache wiring around it.
 */

// Must come first: Next's request storage reads this global when it loads.
import "./nodeAsyncStorage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => {
  type Row = {
    userId: string;
    peak_y: number;
    attempts: number;
    user: { display_name: string | null; username: string | null; avatar_id: string | null };
  };
  const state = {
    /** What the DB would return for the public board, per day. */
    boards: {} as Record<string, Row[]>,
    /** Own rows, keyed `${userId}|${day}`. */
    mine: {} as Record<string, { peak_y: number; attempts: number; updated_at: Date; consent: Date | null }>,
    ahead: 0,
  };
  const prisma = {
    dailyClimbScore: {
      findMany: vi.fn(async ({ where }: { where: { day: string } }) => state.boards[where.day] ?? []),
      count: vi.fn(async ({ where }: { where: { day: string; OR?: unknown } }) =>
        where.OR ? state.ahead : (state.boards[where.day] ?? []).length
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { daily_climb_user_day: { userId: string; day: string } } }) => {
          const k = `${where.daily_climb_user_day.userId}|${where.daily_climb_user_day.day}`;
          const m = state.mine[k];
          return m
            ? { peak_y: m.peak_y, attempts: m.attempts, updated_at: m.updated_at, user: { leaderboard_consent_at: m.consent } }
            : null;
        }
      ),
    },
    friendship: { findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => []) },
  };
  return { state, prisma };
});

vi.mock("../../src/db/client", () => ({ prisma: db.prisma }));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({ verifyIdToken: vi.fn() }));
// PUT /api/settings dependencies, for the consent-revocation flow.
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn(async () => {}) }));
vi.mock("../../src/db/creator", () => ({
  setUsername: vi.fn(async () => ({ ok: true })),
  clearUsername: vi.fn(async () => {}),
}));
vi.mock("../../src/db/settings", () => ({
  getUserSettings: vi.fn(),
  updateUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    social: {},
    leaderboardConsent: false,
    avatarId: null,
  })),
  updateUserSocialHandles: vi.fn(async () => {}),
}));

import { GET } from "../../app/api/climb/daily/leaderboard/route";
import { GET as GET_FRIENDS } from "../../app/api/climb/daily/leaderboard/friends/route";
import { PUT as PUT_SETTINGS } from "../../app/api/settings/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { checkRateLimit } from "../../src/lib/rateLimit";
import { inRequest, newIncrementalCache } from "./realNextCache";
import { shiftDayKey, utcDayKey } from "../../src/lib/dailyDay";
import type { IncrementalCache } from "next/dist/server/lib/incremental-cache";

const row = (userId: string, peak_y: number, attempts = 1) => ({
  userId,
  peak_y,
  attempts,
  user: { display_name: `Name ${userId}`, username: null, avatar_id: null },
});

let cache: IncrementalCache;
let today: string;
// Next's in-memory cache outlives one IncrementalCache instance, and the
// production key is ["topDailyClimbers", day]; a fresh UTC day per test keeps
// entries from leaking between tests.
let testIndex = 0;

function req(path: string, token: string | null = null): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, { headers });
}

/** One GET as a request would run it (inside a work store), plus a short settle. */
async function getBoard(query = "", token: string | null = null) {
  await new Promise((r) => setTimeout(r, 5));
  const res = await inRequest(cache, "/api/climb/daily/leaderboard", () =>
    GET(req(`/api/climb/daily/leaderboard${query}`, token))
  );
  return { res, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  cache = newIncrementalCache();
  // Fixed day, clock still moving (Next's cache compares real timestamps).
  testIndex += 1;
  const start = Date.parse("2026-09-26T12:00:00Z") + testIndex * 20 * 86_400_000;
  vi.useFakeTimers({ now: new Date(start), toFake: ["Date"], shouldAdvanceTime: true });
  today = utcDayKey(new Date());
  db.state.boards = {};
  db.state.mine = {};
  db.state.ahead = 0;
  vi.clearAllMocks();
  vi.mocked(verifyIdToken).mockImplementation(async (token: string) => {
    if (token.startsWith("tok-")) return { uid: token.slice(4), email: `${token}@e.com` } as never;
    throw new Error("bad token");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/climb/daily/leaderboard", () => {
  it("returns today's board with day, resetsAt, totalClimbers and a null me for guests", async () => {
    db.state.boards[today] = [row("a", 20, 3), row("b", 10)];
    const { res, json } = await getBoard();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(json).toMatchObject({
      day: today,
      resetsAt: `${shiftDayKey(today, 1)}T00:00:00.000Z`,
      totalClimbers: 2,
      me: null,
    });
    expect((json.climbers as Array<Record<string, unknown>>).map((c) => [c.rank, c.userId, c.peakY, c.attempts])).toEqual([
      [1, "a", 20, 3],
      [2, "b", 10, 1],
    ]);
    expect(db.prisma.dailyClimbScore.findUnique).not.toHaveBeenCalled();
  });

  it("computes `me` per caller OUTSIDE the cache while the board itself is cached", async () => {
    db.state.boards[today] = [row("a", 20), row("b", 10)];
    db.state.mine[`a|${today}`] = { peak_y: 20, attempts: 2, updated_at: new Date(), consent: new Date() };
    db.state.mine[`b|${today}`] = { peak_y: 10, attempts: 5, updated_at: new Date(), consent: new Date() };

    db.state.ahead = 0;
    const first = await getBoard("", "tok-a");
    expect(first.json.me).toEqual({ rank: 1, peakY: 20, attempts: 2 });

    db.state.ahead = 1;
    const second = await getBoard("", "tok-b");
    expect(second.json.me).toEqual({ rank: 2, peakY: 10, attempts: 5 });

    // Board read once (cached for the second caller); standing read per caller.
    expect(db.prisma.dailyClimbScore.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.dailyClimbScore.findUnique).toHaveBeenCalledTimes(2);

    // A player with no run today, and a hidden player, on the same cached board.
    const third = await getBoard("", "tok-c");
    expect(third.json.me).toBeNull();
    db.state.mine[`h|${today}`] = { peak_y: 99, attempts: 1, updated_at: new Date(), consent: null };
    expect((await getBoard("", "tok-h")).json.me).toEqual({ rank: null, peakY: 99, attempts: 1 });
    expect(db.prisma.dailyClimbScore.findMany).toHaveBeenCalledTimes(1);
  });

  it("an invalid Bearer token still returns the public board, with me: null", async () => {
    db.state.boards[today] = [row("a", 20)];
    const { res, json } = await getBoard("", "garbage");
    expect(res.status).toBe(200);
    expect(json.me).toBeNull();
    expect((json.climbers as unknown[]).length).toBe(1);
  });

  it("revoking consent (PUT /api/settings) hides the row on the very next daily-board read", async () => {
    // Next stamps tag expiry with Date.now() but judges it against the real
    // performance clock, so this test runs on the real clock (and the real
    // UTC day, which no other test in this file uses).
    vi.useRealTimers();
    today = utcDayKey(new Date());
    db.state.boards[today] = [row("a", 20), row("b", 10)];
    expect((await getBoard()).json.totalClimbers).toBe(2);

    // The DB now filters "a" out (consent revoked). Control: the cache still has it.
    db.state.boards[today] = [row("b", 10)];
    expect((await getBoard()).json.totalClimbers).toBe(2);

    vi.mocked(verifyIdToken).mockResolvedValueOnce({ uid: "a", email: "a@e.com", email_verified: true } as never);
    const put = await inRequest(cache, "/api/settings", () =>
      PUT_SETTINGS(
        new NextRequest("http://localhost/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: "Bearer t" },
          body: JSON.stringify({ leaderboardConsent: false }),
        })
      )
    );
    expect(put.status).toBe(200);

    const after = await getBoard();
    expect((after.json.climbers as Array<{ userId: string }>).map((c) => c.userId)).toEqual(["b"]);
    expect(after.json.totalClimbers).toBe(1);
  });

  it("caches each day separately", async () => {
    const yesterday = shiftDayKey(today, -1);
    db.state.boards[today] = [row("t", 5)];
    db.state.boards[yesterday] = [row("y", 50), row("z", 40)];
    const t = await getBoard();
    const y = await getBoard(`?day=${yesterday}`);
    expect((t.json.climbers as Array<{ userId: string }>).map((c) => c.userId)).toEqual(["t"]);
    expect(y.json).toMatchObject({ day: yesterday, totalClimbers: 2 });
    expect((y.json.climbers as Array<{ userId: string }>).map((c) => c.userId)).toEqual(["y", "z"]);
  });

  it("accepts ?day= for today and each of the previous 7 days", async () => {
    let checked = 0;
    for (let back = 0; back <= 7; back++) {
      const day = shiftDayKey(today, -back);
      const { res, json } = await getBoard(`?day=${day}`);
      expect(res.status).toBe(200);
      expect(json.day).toBe(day);
      checked++;
    }
    expect(checked).toBe(8);
  });

  it("400s ?day= outside the 7-day window or malformed, without touching the DB", async () => {
    const cases: Array<[string, string]> = [
      [shiftDayKey(today, -8), "DAY_OUT_OF_RANGE"],
      [shiftDayKey(today, -365), "DAY_OUT_OF_RANGE"],
      [shiftDayKey(today, 1), "DAY_OUT_OF_RANGE"],
      ["2026-02-30", "INVALID_DAY"],
      ["2026-13-01", "INVALID_DAY"],
      ["2026-9-1", "INVALID_DAY"],
      ["__proto__", "INVALID_DAY"],
      ["", "INVALID_DAY"],
      ["%20", "INVALID_DAY"],
      ["today", "INVALID_DAY"],
    ];
    let checked = 0;
    for (const [day, code] of cases) {
      const { res, json } = await getBoard(`?day=${day}`);
      expect(res.status, `day=${day}`).toBe(400);
      expect(json.code, `day=${day}`).toBe(code);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      checked++;
    }
    expect(checked).toBe(cases.length);
    expect(db.prisma.dailyClimbScore.findMany).not.toHaveBeenCalled();
    expect(db.prisma.dailyClimbScore.count).not.toHaveBeenCalled();
  });

  it("answers 429 when the per-IP board limit is spent", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, degraded: false });
    const { res, json } = await getBoard();
    expect(res.status).toBe(429);
    expect(json.code).toBe("RATE_LIMITED");
    expect(db.prisma.dailyClimbScore.findMany).not.toHaveBeenCalled();
  });

  it("a DB failure is a 500, not an empty board", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.prisma.dailyClimbScore.findMany.mockRejectedValueOnce(new Error("db down"));
    const { res, json } = await getBoard();
    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL_ERROR");
  });
});

describe("GET /api/climb/daily/leaderboard/friends", () => {
  const getFriends = (query = "", token: string | null = null) =>
    GET_FRIENDS(req(`/api/climb/daily/leaderboard/friends${query}`, token));

  it("401s without a Bearer token and with an invalid one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const token of [null, "garbage"]) {
      const res = await getFriends("", token);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(((await res.json()) as { code: string }).code).toBe("UNAUTHORIZED");
    }
    expect(db.prisma.dailyClimbScore.findMany).not.toHaveBeenCalled();
  });

  it("400s an out-of-range or malformed day for an authenticated caller", async () => {
    for (const [day, code] of [
      [shiftDayKey(today, -8), "DAY_OUT_OF_RANGE"],
      ["2026-02-30", "INVALID_DAY"],
    ] as const) {
      const res = await getFriends(`?day=${day}`, "tok-me");
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe(code);
    }
    expect(db.prisma.dailyClimbScore.findMany).not.toHaveBeenCalled();
  });

  it("returns the verified caller's board, ignoring any user id in the query", async () => {
    db.prisma.friendship.findMany.mockResolvedValueOnce([{ sender_id: "me", receiver_id: "f1" }] as never);
    db.prisma.user.findMany.mockResolvedValueOnce([{ id: "f1", leaderboard_consent_at: new Date() }] as never);
    db.prisma.dailyClimbScore.findMany.mockResolvedValueOnce([row("f1", 9), row("me", 5)] as never);
    const res = await getFriends("?userId=someone-else", "tok-me");
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ day: today, hiddenCount: 0, notClimbedCount: 0 });
    const where = (db.prisma.dailyClimbScore.findMany.mock.calls[0][0] as unknown as { where: { userId: { in: string[] } } }).where;
    expect(where.userId.in.sort()).toEqual(["f1", "me"]);
  });
});
