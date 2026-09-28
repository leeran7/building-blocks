/**
 * /api/levels routes: ticket, result and me.
 *
 * The DB layer is mocked (its locking and uniqueness are covered against
 * Postgres in tests/db/levels.pg.test.ts). These tests pin what the ROUTES
 * own: every refusal before a life is spent, the level coming from the
 * ticket and never the request, and the result's allow-list parsing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({ verifyIdToken: vi.fn() }));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn() }));
vi.mock("../../src/db/levels", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/db/levels")>();
  return {
    LevelError: real.LevelError,
    activeLevelSeason: vi.fn(),
    issueLevelTicket: vi.fn(),
    openTicketLevel: vi.fn(),
    submitLevelResult: vi.fn(),
    levelProfile: vi.fn(),
  };
});

vi.mock("../../src/db/levelExtras", () => ({ levelFriendsBoard: vi.fn() }));

import { POST as postTicket } from "../../app/api/levels/ticket/route";
import { GET as getBoard } from "../../app/api/levels/board/route";
import { levelFriendsBoard } from "../../src/db/levelExtras";
import { POST as postResult } from "../../app/api/levels/result/route";
import { GET as getMe } from "../../app/api/levels/me/route";
import { GET as getSeason } from "../../app/api/levels/season/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { checkRateLimit } from "../../src/lib/rateLimit";
import {
  LevelError,
  activeLevelSeason,
  issueLevelTicket,
  levelProfile,
  openTicketLevel,
  submitLevelResult,
} from "../../src/db/levels";
import { LEVEL_SIM_VERSION } from "../../src/game/simVersion";
import { TEST_STAR_CHEST_SECRET } from "../../src/levels/starChestServer";
import { encodeRunReplay } from "../../src/game/runReplay";
import type { PlayerInput } from "../../src/game/types";

const SIM = LEVEL_SIM_VERSION;
// Level 42's pars in season-1.json.
const L42_PARS = { twoStarTicks: 2897, threeStarTicks: 2519, oneStarTicks: 3779 };
const T_ISSUED = new Date("2026-09-27T12:00:00Z");
const TICKET = "ticket_abcdefghijk";

function req(path: string, body?: unknown, token: string | null = "tok"): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(verifyIdToken).mockResolvedValue({ uid: "u1", email: "u1@example.test", email_verified: true } as never);
  vi.mocked(activeLevelSeason).mockResolvedValue({ id: 1, minLevelSimVersion: 1 });
  vi.mocked(issueLevelTicket).mockResolvedValue({
    ticketId: TICKET,
    expiresAt: new Date(T_ISSUED.getTime() + 86_400_000),
    lifeSpent: true,
    lives: 4,
    nextLifeAt: new Date(T_ISSUED.getTime() + 1_800_000),
    startPowerUp: null,
    streak: 0,
    failsAtLevel: 0,
    routeGhostAvailable: false,
    boosters: {},
  });
  vi.mocked(openTicketLevel).mockResolvedValue({ season: 1, level: 42 });
  vi.mocked(submitLevelResult).mockImplementation(async (input) => ({
    season: 1,
    level: 42,
    outcome: input.run.cleared ? "cleared" : "failed",
    stars: input.run.stars,
    bestStars: input.run.stars,
    previousStars: 0,
    bestTicks: input.run.cleared ? input.run.ticks : null,
    newBest: input.run.cleared,
    lifeRefunded: input.run.cleared,
    lives: 5,
    nextLifeAt: null,
    xpGained: 510,
    xp: 510,
    playerLevel: 3,
    awards: [],
    unlockedAvatars: [],
    atFrontier: true,
    streak: input.run.cleared ? 1 : 0,
    failsAtLevel: input.run.cleared ? 0 : 1,
    routeGhostAvailable: false,
    chestsOpened: [],
    lifetimeStars: input.run.stars,
    boosters: {},
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/levels/ticket", () => {
  const ticket = (body: unknown, token?: string | null) => postTicket(req("/api/levels/ticket", body, token));

  it("issues a ticket pinned to the server's engine version", async () => {
    const res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ticketId: TICKET,
      season: 1,
      level: 42,
      simVersion: SIM,
      rev: 0,
      pars: L42_PARS,
      lifeSpent: true,
      lives: 4,
    });
    expect(issueLevelTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", season: 1, level: 42, simVersion: SIM })
    );
  });

  it("passes the level's allowed boosters from the manifest and returns the start power-up", async () => {
    vi.mocked(issueLevelTicket).mockResolvedValueOnce({
      ticketId: TICKET,
      expiresAt: new Date(T_ISSUED.getTime() + 86_400_000),
      lifeSpent: true,
      lives: 4,
      nextLifeAt: null,
      startPowerUp: { type: "super-jump", source: "streak" },
      streak: 5,
      failsAtLevel: 0,
      routeGhostAvailable: false,
      boosters: {},
    });
    const res = await ticket({ season: 1, level: 12, simVersion: SIM });
    expect(await res.json()).toMatchObject({ startPowerUp: { type: "super-jump", source: "streak" }, streak: 5 });
    // L12 of season 1 has unlocked rapid climb (L4), sprint burst (L7) and super jump (L11).
    expect(vi.mocked(issueLevelTicket).mock.calls[0][0].allowedBoosters).toEqual([
      "rapid-climb",
      "sprint-burst",
      "super-jump",
    ]);
  });

  it("passes an allowed booster to the ticket", async () => {
    await ticket({ season: 1, level: 12, simVersion: SIM, booster: "super-jump" });
    expect(vi.mocked(issueLevelTicket).mock.calls[0][0].booster).toBe("super-jump");
  });

  it.each([["random"], ["toString"], ["__proto__"], [7], [{ type: "giant" }]])(
    "refuses the booster %j before any write",
    async (booster) => {
      const res = await ticket({ season: 1, level: 42, simVersion: SIM, booster });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_BOOSTER");
      expect(issueLevelTicket).not.toHaveBeenCalled();
    }
  );

  it("refuses a booster the level has not unlocked before any write", async () => {
    // Jetpack unlocks at L28.
    const res = await ticket({ season: 1, level: 12, simVersion: SIM, booster: "jetpack" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("BOOSTER_NOT_ALLOWED");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("maps booster refusals from the transaction", async () => {
    vi.mocked(issueLevelTicket).mockRejectedValueOnce(new LevelError("BOOSTER_NOT_OWNED", "none left"));
    let res = await ticket({ season: 1, level: 12, simVersion: SIM, booster: "rapid-climb" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("BOOSTER_NOT_OWNED");
  });

  it.each([
    [{ season: 1, level: 0, simVersion: SIM }],
    [{ season: 1, level: 301, simVersion: SIM }],
    [{ season: 1, level: "5", simVersion: SIM }],
    [{ season: 1, level: 2.5, simVersion: SIM }],
    [{ season: 0, level: 5, simVersion: SIM }],
    [{ level: 5, simVersion: SIM }],
  ])("rejects a bad season or level %j", async (body) => {
    const res = await ticket(body);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_LEVEL");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON", async () => {
    expect((await ticket("[1]")).status).toBe(400);
    expect((await ticket("nope")).status).toBe(400);
  });

  it("tells a stale app to update before a life is spent", async () => {
    const res = await ticket({ season: 1, level: 42, simVersion: SIM + 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SIM_VERSION_MISMATCH");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("refuses when the season needs a newer engine than the server's", async () => {
    vi.mocked(activeLevelSeason).mockResolvedValueOnce({ id: 1, minLevelSimVersion: SIM + 1 });
    expect((await ticket({ season: 1, level: 1, simVersion: SIM })).status).toBe(409);
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("refuses a season that is not switched on", async () => {
    vi.mocked(activeLevelSeason).mockResolvedValueOnce(null);
    const res = await ticket({ season: 1, level: 1, simVersion: SIM });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SEASON_NOT_FOUND");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("refuses a live season with no generated manifest", async () => {
    vi.mocked(activeLevelSeason).mockResolvedValueOnce({ id: 2, minLevelSimVersion: 1 });
    const res = await ticket({ season: 2, level: 1, simVersion: SIM });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SEASON_NOT_FOUND");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("requires a signed-in, non-anonymous player", async () => {
    expect((await ticket({ season: 1, level: 1, simVersion: SIM }, null)).status).toBe(401);
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: "anon" } as never);
    expect((await ticket({ season: 1, level: 1, simVersion: SIM })).status).toBe(401);
    vi.mocked(verifyIdToken).mockRejectedValue(new Error("bad token"));
    expect((await ticket({ season: 1, level: 1, simVersion: SIM })).status).toBe(401);
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("maps lock and lives refusals to structured errors", async () => {
    vi.mocked(issueLevelTicket).mockRejectedValueOnce(
      new LevelError("OUT_OF_LIVES", "No lives left", { nextLifeAt: "2026-09-27T12:30:00.000Z" })
    );
    let res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "OUT_OF_LIVES", nextLifeAt: "2026-09-27T12:30:00.000Z" });

    vi.mocked(issueLevelTicket).mockRejectedValueOnce(new LevelError("LEVEL_LOCKED", "locked", { frontier: 3 }));
    res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "LEVEL_LOCKED", frontier: 3 });
  });

  it("never leaks a raw database error", async () => {
    vi.mocked(issueLevelTicket).mockRejectedValueOnce(new Error("relation users does not exist"));
    const res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("relation");
  });

  it("rate limits per user, season and level", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (opts) => ({
      allowed: opts.namespace !== "climb:level:ticket",
      degraded: false,
    }));
    const res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "climb:level:ticket", identifier: "u1:1:42" })
    );
    expect(issueLevelTicket).not.toHaveBeenCalled();
    vi.mocked(checkRateLimit).mockImplementation(async () => ({ allowed: true, degraded: false }));
  });
});

describe("POST /api/levels/result", () => {
  const result = (body: unknown, auth?: string | null) => postResult(req("/api/levels/result", body, auth));
  const CLEAR = { ticketId: TICKET, cleared: true, stars: 3, ticks: 900 };

  it("rolls star chests with the test secret outside production", async () => {
    await result(CLEAR);
    expect(vi.mocked(submitLevelResult).mock.calls[0][0].chestSecret).toBe(TEST_STAR_CHEST_SECRET);
  });

  it("opens no chests in production without STAR_CHEST_SECRET, and still saves the run", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STAR_CHEST_SECRET", "");
    try {
      const res = await result(CLEAR);
      expect(res.status).toBe(200);
      expect(vi.mocked(submitLevelResult).mock.calls[0][0].chestSecret).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("records the reported run against the ticket's level, not the request's", async () => {
    const res = await result({ ...CLEAR, season: 9, level: 300 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ level: 42, outcome: "cleared", stars: 3, bestTicks: 900, nextLifeAt: null });
    expect(submitLevelResult).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        ticketId: TICKET,
        run: { cleared: true, stars: 3, ticks: 900 },
        replayToken: null,
      })
    );
    expect(openTicketLevel).toHaveBeenCalledWith("u1", TICKET, expect.any(Date));
    // The per-level limit is keyed on the ticket's level, not the body's.
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "climb:level:result", identifier: "u1:1:42" })
    );
  });

  it("returns the unlockedAvatars the transaction computed, reading nothing else", async () => {
    vi.mocked(submitLevelResult).mockImplementationOnce(async () => ({
      season: 1, level: 42, outcome: "cleared", stars: 3, bestStars: 3, previousStars: 0, bestTicks: 900,
      newBest: true, lifeRefunded: true, lives: 5, nextLifeAt: null, xpGained: 510, xp: 510, playerLevel: 3, awards: [],
      unlockedAvatars: ["ibex"], atFrontier: true, streak: 1, failsAtLevel: 0, routeGhostAvailable: false,
      chestsOpened: [], lifetimeStars: 3, boosters: {},
    }));
    const res = await result(CLEAR);
    expect(res.status).toBe(200);
    expect((await res.json()).unlockedAvatars).toEqual(["ibex"]);
  });

  it("records a failed run", async () => {
    const res = await result({ ticketId: TICKET, cleared: false, stars: 0, ticks: 1200 });
    expect(res.status).toBe(200);
    expect(submitLevelResult).toHaveBeenCalledWith(
      expect.objectContaining({ run: { cleared: false, stars: 0, ticks: 1200 } })
    );
  });

  it("stores a well-formed replay with the run and refuses a malformed one", async () => {
    const inputs = Array.from({ length: 20 }, () => ({ moveX: 1, jump: false, climbY: 1, usePowerUp: false })) as PlayerInput[];
    const token = (await encodeRunReplay({ seed: "s1:level:42", peakY: 0, inputs }))!;
    expect((await result({ ...CLEAR, replayToken: token })).status).toBe(200);
    expect(submitLevelResult).toHaveBeenCalledWith(expect.objectContaining({ replayToken: token }));
    const bad = await result({ ...CLEAR, replayToken: 42 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("INVALID_RESULT");
  });

  it.each([
    [{ ticketId: TICKET, cleared: true, stars: 0, ticks: 900 }],
    [{ ticketId: TICKET, cleared: false, stars: 1, ticks: 900 }],
    [{ ticketId: TICKET, cleared: true, stars: 4, ticks: 900 }],
    [{ ticketId: TICKET, cleared: true, stars: 3, ticks: -5 }],
    [{ ticketId: TICKET, cleared: true, stars: 3, ticks: 1e9 }],
    [{ ticketId: TICKET, cleared: true, stars: 3 }],
    [{ ticketId: TICKET, stars: 3, ticks: 900 }],
  ])("refuses an inconsistent result %j before any lookup", async (body) => {
    const res = await result(body);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_RESULT");
    expect(openTicketLevel).not.toHaveBeenCalled();
    expect(submitLevelResult).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed ticket id before any lookup", async () => {
    for (const body of [{ cleared: true, stars: 3, ticks: 900 }, { ...CLEAR, ticketId: "../../x" }]) {
      const res = await result(body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_TICKET");
    }
    expect(openTicketLevel).not.toHaveBeenCalled();
  });

  it("maps ticket and wall-clock refusals", async () => {
    vi.mocked(openTicketLevel).mockRejectedValueOnce(new LevelError("TICKET_USED", "used"));
    expect((await result(CLEAR)).status).toBe(409);
    vi.mocked(openTicketLevel).mockRejectedValueOnce(new LevelError("TICKET_EXPIRED", "expired"));
    expect((await result(CLEAR)).status).toBe(410);
    vi.mocked(submitLevelResult).mockRejectedValueOnce(new LevelError("IMPLAUSIBLE_RUN", "too long"));
    const res = await result(CLEAR);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("IMPLAUSIBLE_RUN");
  });

  it("caps each player's results across all levels", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (opts) => ({
      allowed: opts.namespace !== "climb:level:result:total",
      degraded: false,
    }));
    expect((await result(CLEAR)).status).toBe(429);
    expect(submitLevelResult).not.toHaveBeenCalled();
    vi.mocked(checkRateLimit).mockImplementation(async () => ({ allowed: true, degraded: false }));
  });

  it.each([
    [L42_PARS.threeStarTicks, 3],
    [L42_PARS.threeStarTicks + 1, 2],
    [L42_PARS.twoStarTicks, 2],
    [L42_PARS.twoStarTicks + 1, 1],
    [L42_PARS.oneStarTicks, 1],
  ])("scores a clear in %i ticks at %i stars against the level's pars", async (ticks, stars) => {
    expect((await result({ ...CLEAR, ticks, stars })).status).toBe(200);
    // Every other star count is refused before the ticket is consumed.
    for (const wrong of [1, 2, 3].filter((s) => s !== stars)) {
      const res = await result({ ...CLEAR, ticks, stars: wrong });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_RESULT");
    }
    expect(submitLevelResult).toHaveBeenCalledTimes(1);
  });

  it("refuses a clear past the level's clock at any star count", async () => {
    for (const stars of [1, 2, 3]) {
      const res = await result({ ...CLEAR, ticks: L42_PARS.oneStarTicks + 1, stars });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_RESULT");
    }
    expect(submitLevelResult).not.toHaveBeenCalled();
    // The same run reported as a loss is recorded.
    expect((await result({ ...CLEAR, cleared: false, stars: 0, ticks: L42_PARS.oneStarTicks + 1 })).status).toBe(200);
  });

  it("refuses a ticket whose season has no manifest", async () => {
    vi.mocked(openTicketLevel).mockResolvedValueOnce({ season: 2, level: 42 });
    const res = await result(CLEAR);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SEASON_NOT_FOUND");
    expect(submitLevelResult).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    expect((await result(CLEAR, null)).status).toBe(401);
    expect(submitLevelResult).not.toHaveBeenCalled();
  });
});

describe("GET /api/levels/me", () => {
  it("returns the profile with ISO dates", async () => {
    vi.mocked(levelProfile).mockResolvedValueOnce({
      lives: 3,
      maxLives: 5,
      nextLifeAt: new Date("2026-09-27T12:30:00Z"),
      xp: 100,
      playerLevel: 2,
      xpIntoLevel: 40,
      xpForNextLevel: 153,
      season: 1,
      frontier: 4,
      totalStars: 7,
      levels: [{ level: 1, stars: 3, bestTicks: 900 }],
      streak: 3,
      nextStartPowerUp: { type: "rapid-climb", source: "streak" },
      stuck: { level: 4, fails: 5, routeGhostAvailable: true },
      boosters: { giant: 2 },
      chests: { lifetimeStars: 27, starsIntoChest: 7, perChest: 20, earned: 1 },
    });
    const res = await getMe(req("/api/levels/me?season=1"));
    expect(await res.json()).toMatchObject({
      lives: 3,
      nextLifeAt: "2026-09-27T12:30:00.000Z",
      frontier: 4,
      streak: 3,
      nextStartPowerUp: { type: "rapid-climb", source: "streak" },
      stuck: { level: 4, fails: 5, routeGhostAvailable: true },
    });
  });

  it("rejects a bad season and requires sign-in", async () => {
    expect((await getMe(req("/api/levels/me?season=abc"))).status).toBe(400);
    expect((await getMe(req("/api/levels/me?season=0"))).status).toBe(400);
    expect((await getMe(req("/api/levels/me", undefined, null))).status).toBe(401);
  });
});

describe("GET /api/levels/season", () => {
  const season = (q: string) => getSeason(req(`/api/levels/season${q}`, undefined, null));

  it("serves a live season's manifest, cacheable and without sign-in", async () => {
    const res = await season("?season=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    const body = await res.json();
    expect(body.season.id).toBe(1);
    expect(body.levels).toHaveLength(300);
    expect(body.levels[41]).toMatchObject({ level: 42, rev: 0, pars: L42_PARS });
  });

  it("hides a season that is not switched on or has no manifest", async () => {
    vi.mocked(activeLevelSeason).mockResolvedValueOnce(null);
    let res = await season("?season=1");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).code).toBe("SEASON_NOT_FOUND");
    vi.mocked(activeLevelSeason).mockResolvedValueOnce({ id: 2, minLevelSimVersion: 1 });
    res = await season("?season=2");
    expect(res.status).toBe(404);
  });

  it.each(["", "?season=0", "?season=abc", "?season=1.5", "?season=-1"])("rejects %s", async (q) => {
    const res = await season(q);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_SEASON");
    expect(activeLevelSeason).not.toHaveBeenCalled();
  });

  it("never leaks a raw database error", async () => {
    vi.mocked(activeLevelSeason).mockRejectedValueOnce(new Error("relation level_seasons does not exist"));
    const res = await season("?season=1");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("relation");
  });
});

describe("GET /api/levels/board", () => {
  const board = (q: string, token?: string | null) => getBoard(req(`/api/levels/board${q}`, undefined, token));
  const BOARD = {
    season: 1,
    level: 12,
    friendCount: 2,
    entries: [{ rank: 1, isMe: false, handle: "Ana", username: "ana", avatarId: null, stars: 3, bestTicks: 900 }],
  };

  it("returns the caller's friends board, keyed by the token's user only", async () => {
    vi.mocked(levelFriendsBoard).mockResolvedValueOnce(BOARD);
    const res = await board("?season=1&level=12&userId=someone-else");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual(BOARD);
    expect(levelFriendsBoard).toHaveBeenCalledWith("u1", 1, 12);
  });

  it.each([["?season=1"], ["?level=12"], ["?season=1&level=0"], ["?season=1&level=301"], ["?season=x&level=1"], ["?season=1&level=1.5"]])(
    "rejects %s",
    async (q) => {
      const res = await board(q);
      expect(res.status).toBe(400);
      expect(levelFriendsBoard).not.toHaveBeenCalled();
    }
  );

  it("refuses a season with no manifest", async () => {
    expect((await board("?season=2&level=1")).status).toBe(404);
    expect(levelFriendsBoard).not.toHaveBeenCalled();
  });

  it("requires a signed-in, non-anonymous player", async () => {
    expect((await board("?season=1&level=12", null)).status).toBe(401);
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: "anon" } as never);
    expect((await board("?season=1&level=12")).status).toBe(401);
    expect(levelFriendsBoard).not.toHaveBeenCalled();
  });

  it("uses the shared climb IP bucket and a per-user level cap", async () => {
    vi.mocked(levelFriendsBoard).mockResolvedValue(BOARD);
    await board("?season=1&level=12");
    const namespaces = vi.mocked(checkRateLimit).mock.calls.map(([o]) => o.namespace);
    expect(namespaces).toEqual(["climb", "climb:level:board:total"]);

    vi.mocked(checkRateLimit).mockImplementation(async (o) => ({ allowed: o.namespace !== "climb:level:board:total", degraded: false }));
    vi.mocked(levelFriendsBoard).mockClear();
    const res = await board("?season=1&level=12");
    expect(res.status).toBe(429);
    expect(levelFriendsBoard).not.toHaveBeenCalled();
    vi.mocked(checkRateLimit).mockImplementation(async () => ({ allowed: true, degraded: false }));
  });

  it("never leaks a raw database error", async () => {
    vi.mocked(levelFriendsBoard).mockRejectedValueOnce(new Error("relation friendships does not exist"));
    const res = await board("?season=1&level=12");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("friendships");
  });
});
