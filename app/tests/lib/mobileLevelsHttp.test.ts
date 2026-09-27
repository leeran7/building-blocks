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
  parseLevelProfile,
  parseServerResult,
  parseTicket,
  refusalFor,
} from "../../mobile/src/lib/levels/httpClient";
import { mockLevelNode } from "../../mobile/src/lib/levels/mockClient";
import type { LevelCatalog, LevelRunReport } from "../../mobile/src/lib/levels/model";

const catalog: LevelCatalog = {
  season: 1,
  name: "Season 1",
  count: 300,
  level: (n) => {
    const { stars: _s, bestMs: _b, ...info } = mockLevelNode(n);
    return info;
  },
};

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

const RUN: LevelRunReport = { finished: true, finishedTick: 450, peakFt: 90, replayToken: "token" };

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
    expect(refusalFor(503, "LEVELS_UNAVAILABLE")).toBe("NETWORK");
    expect(refusalFor(429, "RATE_LIMITED")).toBe("NETWORK");
    expect(refusalFor(403, "SOMETHING_ELSE")).toBe("NETWORK");
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
      body: { ticketId: TICKET.ticketId, cleared: true, finishTicks: 450, peakFt: 90 },
    });
    expect(result).toMatchObject({
      level: 3,
      cleared: true,
      stars: 2,
      previousStars: 0,
      timeMs: 15_000,
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
      peakFt: 41.6,
    });
    expect(calls[0].body).toEqual({ ticketId: TICKET.ticketId, cleared: false, finishTicks: null, peakFt: 42 });
    expect(result).toMatchObject({ cleared: false, stars: 0, timeMs: null, newPlayerLevel: null });
  });

  it("never reports a finish time for a run that did not finish", async () => {
    const { fetch, calls } = fakeServer({
      "/api/levels/result": () => json(200, { ...RESULT, outcome: "failed", stars: 0, xpGained: 0 }),
    });
    await createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, { ...RUN, finished: false });
    expect(calls[0].body).toMatchObject({ cleared: false, finishTicks: null });
  });

  it("throws on a rejected run", async () => {
    const { fetch } = fakeServer({ "/api/levels/result": () => json(409, { code: "TICKET_USED" }) });
    await expect(createHttpLevelsClient({ catalog, fetch }).submitResult(TICKET.ticketId, RUN)).rejects.toThrow(
      "TICKET_USED",
    );
  });
});
