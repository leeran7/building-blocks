/**
 * The mobile level client against the server's route contracts
 * (app/api/levels/me, /ticket, /result). The server is faked at the fetch
 * seam; every assertion is on what the screens receive.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../mobile/src/lib/api", () => ({ apiFetch: vi.fn() }));

import { LEVEL_SIM_VERSION } from "../../src/game/simVersion";
import {
  createHttpLevelsClient,
  parseBoosterInventory,
  parseChestProgress,
  parseLevelBoard,
  parseOpenedChests,
  parseLevelProfile,
  parseServerResult,
  parseStartPowerUp,
  parseTicket,
  refusalFor,
} from "../../mobile/src/lib/levels/httpClient";
import { season1Catalog } from "../../mobile/src/lib/levels/catalog";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import { withMockFallback } from "../../mobile/src/lib/levels/fallbackClient";
import type { LevelRunReport } from "../../mobile/src/lib/levels/model";

const catalog = season1Catalog();

const PROFILE = {
  lives: 3,
  maxLives: 5,
  nextLifeAt: "2026-09-27T12:30:00.000Z",
  xp: 130,
  playerLevel: 2,
  xpIntoLevel: 70,
  xpForNextLevel: 153,
  season: 1,
  frontier: 3,
  totalStars: 5,
  levels: [
    { level: 1, stars: 3, bestTicks: 600 },
    { level: 2, stars: 2, bestTicks: 900 },
  ],
};

const TICKET = {
  ticketId: "abcdefghij0123456789_",
  season: 1,
  level: 3,
  simVersion: LEVEL_SIM_VERSION,
  specVersion: 1,
  expiresAt: "2026-09-27T13:00:00.000Z",
  lifeSpent: false,
  lives: 3,
  nextLifeAt: "2026-09-27T12:30:00.000Z",
};

const RESULT = {
  season: 1,
  level: 3,
  outcome: "cleared",
  stars: 2,
  bestStars: 2,
  previousStars: 0,
  bestTicks: 450,
  newBest: true,
  lifeRefunded: false,
  lives: 3,
  nextLifeAt: "2026-09-27T12:30:00.000Z",
  xpGained: 115,
  xp: 245,
  playerLevel: 2,
  awards: [{ key: "first_clear:1:3", amount: 65 }],
};

// Level 3's pars are 812 ticks for 3 stars and 999 for 2 (season-1.json): 900 ticks is 2 stars.
const RUN: LevelRunReport = {
  level: 3,
  finished: true,
  finishedTick: 900,
  raceTicks: 900,
  peakFt: 90,
  replayToken: "token",
  outOfTime: false,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeServer(routes: Record<string, () => Response>) {
  const calls: { path: string; body: unknown }[] = [];
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new TypeError("offline");
    return routes[key]();
  });
  return { fetch, calls };
}

describe("parsers", () => {
  it("accept the server's shapes", () => {
    expect(parseLevelProfile(PROFILE)?.levels).toHaveLength(2);
    expect(parseTicket(TICKET)?.ticketId).toBe(TICKET.ticketId);
    expect(parseServerResult(RESULT)?.outcome).toBe("cleared");
    expect(parseServerResult({ ...RESULT, outcome: "failed", stars: 0 })?.stars).toBe(0);
  });

  it("reject bodies that break the contract", () => {
    expect(parseLevelProfile({ ...PROFILE, lives: 6 })).toBeNull();
    expect(parseLevelProfile({ ...PROFILE, nextLifeAt: "soon" })).toBeNull();
    expect(parseLevelProfile({ ...PROFILE, levels: [{ level: 1, stars: 4, bestTicks: 1 }] })).toBeNull();
    expect(parseLevelProfile({ ...PROFILE, xp: "130" })).toBeNull();
    expect(parseTicket({ ...TICKET, ticketId: "../../x" })).toBeNull();
    expect(parseTicket({ ...TICKET, lives: -1 })).toBeNull();
    expect(parseServerResult({ ...RESULT, outcome: "won" })).toBeNull();
    // A clear always earns a star, and a loss never does.
    expect(parseServerResult({ ...RESULT, stars: 0 })).toBeNull();
    expect(parseServerResult({ ...RESULT, outcome: "failed" })).toBeNull();
    expect(parseServerResult({ ...RESULT, xpGained: 999 })).toBeNull();
    expect(parseServerResult(null)).toBeNull();
  });

  it("word each refusal", () => {
    expect(refusalFor(403, "LEVEL_LOCKED")).toBe("LOCKED");
    expect(refusalFor(409, "OUT_OF_LIVES")).toBe("OUT_OF_LIVES");
    expect(refusalFor(409, "SIM_VERSION_MISMATCH")).toBe("UPDATE_REQUIRED");
    expect(refusalFor(404, "LEVEL_NOT_FOUND")).toBe("UPDATE_REQUIRED");
    // The season is not switched on yet: a server state, not an old app.
    expect(refusalFor(404, "SEASON_NOT_FOUND")).toBe("NETWORK");
    expect(refusalFor(503, "LEVELS_UNAVAILABLE")).toBe("NETWORK");
    expect(refusalFor(429, "RATE_LIMITED")).toBe("NETWORK");
    expect(refusalFor(403, "SOMETHING_ELSE")).toBe("NETWORK");
  });
});

describe("win streaks and start power-ups", () => {
  it("parse a start power-up, and read an absent one as none", () => {
    expect(parseStartPowerUp({ type: "rapid-climb", source: "streak" })).toEqual({ type: "rapid-climb", source: "streak" });
    expect(parseStartPowerUp(undefined)).toBeNull();
    expect(parseStartPowerUp(null)).toBeNull();
  });

  it.each([
    [{ type: "random", source: "streak" }],
    [{ type: "rapid-climb", source: "gift" }],
    [{ type: "rapid-climb", source: "toString" }],
    [{ type: "rapid-climb" }],
    ["rapid-climb"],
  ])("reject a malformed start power-up %j", (raw) => {
    expect(parseStartPowerUp(raw)).toBeUndefined();
    expect(parseTicket({ ...TICKET, startPowerUp: raw })).toBeNull();
  });

  it("read the streak from the profile and the result, and refuse a bad one", () => {
    expect(parseLevelProfile({ ...PROFILE, streak: 4, nextStartPowerUp: { type: "rapid-climb", source: "streak" } })).toMatchObject({
      streak: 4,
      nextStartPowerUp: { type: "rapid-climb", source: "streak" },
    });
    expect(parseLevelProfile(PROFILE)).toMatchObject({ streak: 0, nextStartPowerUp: null });
    expect(parseLevelProfile({ ...PROFILE, streak: -1 })).toBeNull();
    expect(parseServerResult({ ...RESULT, streak: 2, atFrontier: true })).toMatchObject({ streak: 2, atFrontier: true });
    expect(parseServerResult(RESULT)).toMatchObject({ streak: null, atFrontier: false });
    expect(parseServerResult({ ...RESULT, streak: "2" })).toBeNull();
    expect(parseServerResult({ ...RESULT, atFrontier: 1 })).toBeNull();
  });

  it("read stuck help from the profile and the result", () => {
    expect(parseLevelProfile({ ...PROFILE, stuck: { level: 3, fails: 5, routeGhostAvailable: true } })?.stuck).toEqual({
      level: 3,
      fails: 5,
      routeGhostAvailable: true,
    });
    expect(parseLevelProfile({ ...PROFILE, stuck: { level: 3, fails: "5", routeGhostAvailable: true } })).toBeNull();
    expect(parseLevelProfile({ ...PROFILE, stuck: { level: 3, fails: 5 } })).toBeNull();
    expect(parseServerResult({ ...RESULT, outcome: "failed", stars: 0, failsAtLevel: 3, routeGhostAvailable: false })).toMatchObject({
      failsAtLevel: 3,
      routeGhostAvailable: false,
    });
    expect(parseServerResult({ ...RESULT, failsAtLevel: -1 })).toBeNull();
    expect(parseServerResult({ ...RESULT, routeGhostAvailable: "yes" })).toBeNull();
  });

  it("hands the ticket's power-up to the run", async () => {
    const { fetch } = fakeServer({
      "/api/levels/ticket": () => json(200, { ...TICKET, level: 12, startPowerUp: { type: "super-jump", source: "streak" } }),
    });
    const res = await createHttpLevelsClient({ catalog, fetch }).startLevel(12);
    expect(res).toMatchObject({ ok: true, ticket: { startPowerUp: { type: "super-jump", source: "streak" } } });
  });

  it("asks for an update when the power-up is not allowed on this app's level", async () => {
    // Level 3 allows no power-ups in season 1.
    const { fetch } = fakeServer({
      "/api/levels/ticket": () => json(200, { ...TICKET, startPowerUp: { type: "rapid-climb", source: "streak" } }),
    });
    expect(await createHttpLevelsClient({ catalog, fetch }).startLevel(3)).toEqual({ ok: false, code: "UPDATE_REQUIRED" });
  });
});

describe("friends board", () => {
  const BOARD = {
    season: 1,
    level: 12,
    friendCount: 1,
    entries: [
      { rank: 1, isMe: false, handle: "Ana", username: "ana", avatarId: null, stars: 3, bestTicks: 900 },
      { rank: 2, isMe: true, handle: "Me", username: null, avatarId: null, stars: 2, bestTicks: 1200 },
    ],
  };

  it("parses the board into times", () => {
    expect(parseLevelBoard(BOARD)).toEqual({
      level: 12,
      friendCount: 1,
      entries: [
        { rank: 1, isMe: false, handle: "Ana", stars: 3, timeMs: 30_000 },
        { rank: 2, isMe: true, handle: "Me", stars: 2, timeMs: 40_000 },
      ],
    });
  });

  it.each([
    ["a zero-star row", { ...BOARD, entries: [{ ...BOARD.entries[0], stars: 0 }] }],
    ["a missing handle", { ...BOARD, entries: [{ ...BOARD.entries[0], handle: "" }] }],
    ["a string time", { ...BOARD, entries: [{ ...BOARD.entries[0], bestTicks: "900" }] }],
    ["no entries", { ...BOARD, entries: null }],
  ])("rejects %s", (_, body) => {
    expect(parseLevelBoard(body)).toBeNull();
  });

  it("loads the level's board and refuses one for another level", async () => {
    const { fetch, calls } = fakeServer({ "/api/levels/board": () => json(200, BOARD) });
    const board = await createHttpLevelsClient({ catalog, fetch }).getBoard(12);
    expect(calls[0].path).toBe("/api/levels/board?season=1&level=12");
    expect(board.entries).toHaveLength(2);
    await expect(createHttpLevelsClient({ catalog, fetch }).getBoard(13)).rejects.toThrow();
  });
});

describe("createHttpLevelsClient", () => {
  it("merges the server's progress onto the season's levels", async () => {
    const { fetch, calls } = fakeServer({ "/api/levels/me": () => json(200, PROFILE) });
    const season = await createHttpLevelsClient({ catalog, fetch }).getSeason();

    expect(calls[0].path).toBe("/api/levels/me?season=1");
    expect(season.levels).toHaveLength(300);
    expect(season.levels[0]).toMatchObject({ level: 1, stars: 3, bestMs: 20_000, seed: catalog.level(1).seed });
    expect(season.levels[1]).toMatchObject({ stars: 2, bestMs: 30_000 });
    expect(season.levels[2]).toMatchObject({ stars: 0, bestMs: null });
    expect(season.frontier).toBe(3);
    expect(season.player).toEqual({
      lives: 3,
      maxLives: 5,
      nextLifeAt: Date.parse(PROFILE.nextLifeAt),
      xp: 130,
      playerLevel: 2,
      xpIntoLevel: 70,
      xpForNext: 153,
    });
  });

  it("fails the load on an error or a malformed body", async () => {
    const down = fakeServer({ "/api/levels/me": () => json(503, { code: "LEVELS_UNAVAILABLE" }) });
    await expect(createHttpLevelsClient({ catalog, fetch: down.fetch }).getSeason()).rejects.toThrow("503");
    const bad = fakeServer({ "/api/levels/me": () => json(200, { ...PROFILE, frontier: 0 }) });
    await expect(createHttpLevelsClient({ catalog, fetch: bad.fetch }).getSeason()).rejects.toThrow();
    const other = fakeServer({ "/api/levels/me": () => json(200, { ...PROFILE, season: 2 }) });
    await expect(createHttpLevelsClient({ catalog, fetch: other.fetch }).getSeason()).rejects.toThrow();
  });

  it("starts a level with the engine version and returns the ticket", async () => {
    const { fetch, calls } = fakeServer({
      "/api/levels/me": () => json(200, PROFILE),
      "/api/levels/ticket": () => json(200, TICKET),
    });
    const client = createHttpLevelsClient({ catalog, fetch });
    await client.getSeason();
    const res = await client.startLevel(3);

    expect(calls[1]).toEqual({
      path: "/api/levels/ticket",
      body: { season: 1, level: 3, simVersion: LEVEL_SIM_VERSION },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ticket).toMatchObject({ id: TICKET.ticketId, level: 3, seed: catalog.level(3).seed });
    // XP comes from the last profile; lives from the ticket.
    expect(res.ticket.player).toMatchObject({ lives: 3, xp: 130, playerLevel: 2 });
  });

  it("turns refusals into the start card's codes", async () => {
    const cases: [number, unknown, string][] = [
      [403, { code: "LEVEL_LOCKED", frontier: 3 }, "LOCKED"],
      [409, { code: "SIM_VERSION_MISMATCH" }, "UPDATE_REQUIRED"],
      [503, { code: "LEVELS_UNAVAILABLE" }, "NETWORK"],
      [200, { ...TICKET, level: 4 }, "NETWORK"],
    ];
    for (const [status, body, code] of cases) {
      const { fetch } = fakeServer({ "/api/levels/ticket": () => json(status, body) });
      expect(await createHttpLevelsClient({ catalog, fetch }).startLevel(3)).toEqual({ ok: false, code });
    }
    const offline = fakeServer({});
    expect(await createHttpLevelsClient({ catalog, fetch: offline.fetch }).startLevel(3)).toEqual({
      ok: false,
      code: "NETWORK",
    });
  });

  it("shows when the next life comes on out of lives", async () => {
    const at = "2026-09-27T12:10:00.000Z";
    const { fetch } = fakeServer({ "/api/levels/ticket": () => json(409, { code: "OUT_OF_LIVES", nextLifeAt: at }) });
    const res = await createHttpLevelsClient({ catalog, fetch }).startLevel(12);
    expect(res).toMatchObject({ ok: false, code: "OUT_OF_LIVES", player: { lives: 0, nextLifeAt: Date.parse(at) } });
  });

  it("submits the ticket and the run's outcome, and shows the server's verdict", async () => {
    const { fetch, calls } = fakeServer({ "/api/levels/result": () => json(200, RESULT) });
    const result = await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, RUN);

    expect(calls[0]).toEqual({
      path: "/api/levels/result",
      body: { ticketId: TICKET.ticketId, cleared: true, stars: 2, ticks: 900, replayToken: "token" },
    });
    expect(result).toMatchObject({
      level: 3,
      cleared: true,
      stars: 2,
      previousStars: 0,
      timeMs: 30_000,
      peakFt: 90,
      xpGained: 115,
      goalFt: catalog.level(3).goalFt,
    });
    // 130 XP is level 2; 245 passes 60 + 153 = 213, so this run reached level 3.
    expect(result.player.playerLevel).toBe(3);
    expect(result.newPlayerLevel).toBe(3);
  });

  it("reports no level up when XP stays inside the player level", async () => {
    const { fetch } = fakeServer({ "/api/levels/result": () => json(200, { ...RESULT, xp: 150, xpGained: 20 }) });
    const result = await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, RUN);
    expect(result.newPlayerLevel).toBeNull();
    expect(result.player.playerLevel).toBe(2);
  });

  it("shows a loss with no time", async () => {
    const { fetch, calls } = fakeServer({
      "/api/levels/result": () => json(200, { ...RESULT, outcome: "failed", stars: 0, xpGained: 0 }),
    });
    const result = await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, {
      ...RUN,
      finished: false,
      finishedTick: null,
      raceTicks: 612.4,
      peakFt: 41.6,
      replayToken: null,
      outOfTime: false,
    });
    // A loss reports how long the run lasted, no stars, and no replay it does not have.
    expect(calls[0].body).toEqual({ ticketId: TICKET.ticketId, cleared: false, stars: 0, ticks: 612 });
    expect(result).toMatchObject({ cleared: false, stars: 0, timeMs: null, newPlayerLevel: null });
  });

  it("reports a run the clock ended as a plain loss and shows it ran out of time", async () => {
    const { fetch, calls } = fakeServer({
      "/api/levels/result": () => json(200, { ...RESULT, outcome: "failed", stars: 0, xpGained: 0 }),
    });
    const result = await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, {
      ...RUN,
      finished: false,
      finishedTick: null,
      raceTicks: 900,
      replayToken: null,
      outOfTime: true,
    });
    expect(calls[0].body).toEqual({ ticketId: TICKET.ticketId, cleared: false, stars: 0, ticks: 900 });
    expect(result).toMatchObject({ cleared: false, stars: 0, outOfTime: true });
  });

  it("never reports a finish time for a run that did not finish", async () => {
    const { fetch, calls } = fakeServer({
      "/api/levels/result": () => json(200, { ...RESULT, outcome: "failed", stars: 0, xpGained: 0 }),
    });
    await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, { ...RUN, finished: false });
    expect(calls[0].body).toMatchObject({ cleared: false, stars: 0, ticks: 900 });
  });

  it("scores 3 stars at or under the 3-star par and 1 star past the 2-star par", async () => {
    const pars = catalog.level(3).pars;
    const cases: [number, number][] = [
      [Math.floor((pars.threeStarMs / 1000) * 30), 3],
      [Math.ceil((pars.twoStarMs / 1000) * 30) + 30, 1],
    ];
    for (const [ticks, stars] of cases) {
      const { fetch, calls } = fakeServer({ "/api/levels/result": () => json(200, RESULT) });
      await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, {
        ...RUN,
        finishedTick: ticks,
        raceTicks: ticks,
      });
      expect(calls[0].body).toMatchObject({ cleared: true, stars, ticks });
    }
  });

  it("refuses a verdict for a different level", async () => {
    const { fetch } = fakeServer({ "/api/levels/result": () => json(200, { ...RESULT, level: 4 }) });
    await expect(createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, RUN)).rejects.toThrow();
  });

  it("throws on a rejected run", async () => {
    const { fetch } = fakeServer({ "/api/levels/result": () => json(409, { code: "TICKET_USED" }) });
    await expect(createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, RUN)).rejects.toThrow(
      "TICKET_USED",
    );
  });
});

describe("withMockFallback", () => {
  const mockClient = () => createMockLevelsClient({ load: () => null, save: () => {} });

  it("uses local data when the level routes are not deployed", async () => {
    // A bare 404 (no level error code) is the route itself missing.
    const { fetch } = fakeServer({ "/api/levels/me": () => new Response("Not Found", { status: 404 }) });
    const client = withMockFallback(createHttpLevelsClient({ catalog, fetch }), mockClient);
    const season = await client.getSeason();
    expect(season.player.lives).toBe(5);
    const start = await client.startLevel(1);
    expect(start.ok).toBe(true);
    await client.getSeason();
    // Every later call stays on the local store, never the server.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a real server error an error", async () => {
    const failures = [
      () => json(404, { code: "SEASON_NOT_FOUND" }),
      () => json(503, { code: "LEVELS_UNAVAILABLE" }),
      () => new Response("Bad Gateway", { status: 502 }),
    ];
    for (const res of failures) {
      const { fetch } = fakeServer({ "/api/levels/me": res });
      const fallback = vi.fn(mockClient);
      const client = withMockFallback(createHttpLevelsClient({ catalog, fetch }), fallback);
      await expect(client.getSeason()).rejects.toThrow();
      expect(fallback).not.toHaveBeenCalled();
    }
    const offline = fakeServer({});
    const fallback = vi.fn(mockClient);
    const client = withMockFallback(createHttpLevelsClient({ catalog, fetch: offline.fetch }), fallback);
    await expect(client.getSeason()).rejects.toThrow();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("stays on the server when it answers", async () => {
    const { fetch } = fakeServer({
      "/api/levels/me": () => json(200, PROFILE),
      "/api/levels/ticket": () => json(200, TICKET),
    });
    const client = withMockFallback(createHttpLevelsClient({ catalog, fetch }), mockClient);
    expect((await client.getSeason()).player.xp).toBe(130);
    const start = await client.startLevel(3);
    expect(start.ok && start.ticket.id).toBe(TICKET.ticketId);
  });
});

describe("star chests and boosters", () => {
  const CHESTS = { lifetimeStars: 47, starsIntoChest: 7, perChest: 20, earned: 2 };

  it("read the inventory and chest progress from the profile, and none from an older server", () => {
    expect(parseLevelProfile({ ...PROFILE, boosters: { giant: 2, "slow-lava": 1 }, chests: CHESTS })).toMatchObject({
      boosters: { giant: 2, "slow-lava": 1 },
      chests: { lifetimeStars: 47, starsIntoChest: 7, perChest: 20 },
    });
    expect(parseLevelProfile(PROFILE)).toMatchObject({ boosters: {}, chests: null });
    // Empty counts are dropped, not shown as "×0".
    expect(parseBoosterInventory({ giant: 0, jetpack: 1 })).toEqual({ jetpack: 1 });
  });

  it("refuse a malformed inventory or chest block, and leave out types this app does not know", () => {
    // A newer server's type (or a non-booster) is left out, never written.
    expect(parseBoosterInventory({ random: 1, "time-freeze": 2, giant: 1 })).toEqual({ giant: 1 });
    const hostile = parseBoosterInventory(JSON.parse('{"__proto__": 1, "constructor": 2, "giant": 1}'));
    expect(hostile).toEqual({ giant: 1 });
    expect(Object.hasOwn(hostile ?? {}, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(hostile)).toBe(Object.prototype);
    expect(parseLevelProfile({ ...PROFILE, boosters: { "time-freeze": 1 } })?.boosters).toEqual({});
    expect(parseBoosterInventory({ giant: -1 })).toBeUndefined();
    expect(parseBoosterInventory({ giant: 1.5 })).toBeUndefined();
    expect(parseBoosterInventory(["giant"])).toBeUndefined();
    expect(parseLevelProfile({ ...PROFILE, boosters: { giant: "1" } })).toBeNull();
    expect(parseChestProgress({ ...CHESTS, starsIntoChest: 20 })).toBeUndefined();
    expect(parseChestProgress({ ...CHESTS, starsIntoChest: 6 })).toBeUndefined();
    expect(parseChestProgress({ ...CHESTS, perChest: 0 })).toBeUndefined();
    expect(parseLevelProfile({ ...PROFILE, chests: { ...CHESTS, lifetimeStars: "47" } })).toBeNull();
  });

  it("read the chests a clear opened, and refuse chests on a loss or with bad contents", () => {
    const opened = [{ chestNumber: 2, boosters: ["giant", "giant"] }];
    expect(parseServerResult({ ...RESULT, chestsOpened: opened, boosters: { giant: 3 } })).toMatchObject({
      chestsOpened: opened,
      boosters: { giant: 3 },
    });
    expect(parseServerResult(RESULT)).toMatchObject({ chestsOpened: [], boosters: null });
    expect(parseOpenedChests([{ chestNumber: 1, boosters: [] }])).toBeUndefined();
    expect(parseOpenedChests([{ chestNumber: 1, boosters: ["giant", "giant", "giant"] }])).toBeUndefined();
    expect(parseOpenedChests([{ chestNumber: 1, boosters: [7] }])).toBeUndefined();
    // A newer server's type is left out of the reveal, not the whole result.
    expect(parseOpenedChests([{ chestNumber: 1, boosters: ["random"] }, { chestNumber: 2, boosters: ["time-freeze", "giant"] }])).toEqual([
      { chestNumber: 2, boosters: ["giant"] },
    ]);
    expect(parseOpenedChests([{ chestNumber: 0, boosters: ["giant"] }])).toBeUndefined();
    expect(parseServerResult({ ...RESULT, outcome: "failed", stars: 0, chestsOpened: opened })).toBeNull();
  });

  it("send an equipped booster with the ticket request, and nothing when none is chosen", async () => {
    const { fetch, calls } = fakeServer({
      "/api/levels/ticket": () => json(200, { ...TICKET, level: 12, startPowerUp: { type: "rapid-climb", source: "booster" } }),
    });
    const client = createHttpLevelsClient({ catalog, fetch });
    const res = await client.startLevel(12, { booster: "rapid-climb" });
    expect(calls[0]?.body).toEqual({ season: 1, level: 12, simVersion: LEVEL_SIM_VERSION, booster: "rapid-climb" });
    expect(res).toMatchObject({ ok: true, ticket: { startPowerUp: { type: "rapid-climb", source: "booster" } } });
    await client.startLevel(12, { booster: null });
    expect(calls[1]?.body).not.toHaveProperty("booster");
  });

  it("word every booster refusal as one the card can explain", async () => {
    for (const [status, code] of [
      [400, "INVALID_BOOSTER"],
      [409, "BOOSTER_NOT_ALLOWED"],
      [409, "BOOSTER_NOT_OWNED"],
    ] as const) {
      expect(refusalFor(status, code)).toBe("BOOSTER_UNAVAILABLE");
      const { fetch } = fakeServer({ "/api/levels/ticket": () => json(status, { code }) });
      expect(await createHttpLevelsClient({ catalog, fetch }).startLevel(12, { booster: "giant" })).toEqual({
        ok: false,
        code: "BOOSTER_UNAVAILABLE",
      });
    }
    expect(refusalFor(400, "BOOSTER_NOT_OWNED")).toBe("NETWORK");
  });
});
