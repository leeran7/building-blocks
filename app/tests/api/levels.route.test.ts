/**
 * /api/levels routes: ticket, result and me.
 *
 * The DB layer is mocked (its locking and uniqueness are covered against
 * Postgres in tests/db/levels.pg.test.ts). The level catalog is a fake with a
 * spy `verify`, so these tests pin what the ROUTES own: every refusal before
 * a life is spent, the level coming from the ticket and never the request,
 * and verdicts flowing straight from the server's re-simulation.
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
    openTicketSpec: vi.fn(),
    submitLevelResult: vi.fn(),
    levelProfile: vi.fn(),
  };
});
vi.mock("../../src/levels/catalog", () => ({ getLevelCatalog: vi.fn() }));

import { POST as postTicket } from "../../app/api/levels/ticket/route";
import { POST as postResult } from "../../app/api/levels/result/route";
import { GET as getMe } from "../../app/api/levels/me/route";
import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { checkRateLimit } from "../../src/lib/rateLimit";
import {
  LevelError,
  activeLevelSeason,
  issueLevelTicket,
  levelProfile,
  openTicketSpec,
  submitLevelResult,
} from "../../src/db/levels";
import { getLevelCatalog, type LevelCatalog, type LevelVerdict } from "../../src/levels/catalog";
import { encodeRunReplay, type RunReplay } from "../../src/game/runReplay";
import type { PlayerInput } from "../../src/game/types";

const SIM = 7;
const HASH = "manifest-hash";
const T_ISSUED = new Date("2026-09-27T12:00:00Z");

const OK_VERDICT: LevelVerdict = {
  ok: true,
  finished: true,
  finishTicks: 1000,
  raceTicks: 1000,
  allGems: true,
  pars: { twoStarTicks: 1250, threeStarTicks: 1050 },
  inputHash: "abc",
  inputSegments: 30,
};

function fakeCatalog(verify = vi.fn((): LevelVerdict => OK_VERDICT)): LevelCatalog & { verify: typeof verify } {
  return {
    simVersion: SIM,
    season: (id: number) =>
      id === 1 ? { id: 1, levelCount: 300, manifestHash: HASH, specVersion: (level: number) => 100 + level } : null,
    verify,
  };
}

function req(path: string, body?: unknown, token: string | null = "tok"): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const inputs: PlayerInput[] = Array.from({ length: 50 }, (_, i) => ({
  moveX: (i % 3) - 1,
  jump: i % 7 === 0,
  climbY: 1,
  usePowerUp: false,
})) as PlayerInput[];

let catalog: ReturnType<typeof fakeCatalog>;

beforeEach(() => {
  catalog = fakeCatalog();
  vi.mocked(getLevelCatalog).mockReturnValue(catalog);
  vi.mocked(verifyIdToken).mockResolvedValue({ uid: "u1", email: "u1@example.test", email_verified: true } as never);
  vi.mocked(activeLevelSeason).mockResolvedValue({ id: 1, manifestHash: HASH, minLevelSimVersion: 1 });
  vi.mocked(issueLevelTicket).mockResolvedValue({
    ticketId: "ticket_abcdefghijk",
    expiresAt: new Date(T_ISSUED.getTime() + 86_400_000),
    lifeSpent: true,
    lives: 4,
    nextLifeAt: new Date(T_ISSUED.getTime() + 1_800_000),
  });
  vi.mocked(openTicketSpec).mockResolvedValue({
    season: 1,
    level: 42,
    simVersion: SIM,
    specVersion: 142,
    startPowerUp: null,
  });
  vi.mocked(submitLevelResult).mockImplementation(async (input) => ({
    season: 1,
    level: 42,
    outcome: "cleared",
    stars: 3,
    bestStars: 3,
    previousStars: 0,
    bestTicks: input.verdict.finishTicks,
    newBest: true,
    lifeRefunded: true,
    lives: 5,
    nextLifeAt: null,
    xpGained: 510,
    xp: 510,
    playerLevel: 3,
    awards: [],
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/levels/ticket", () => {
  const ticket = (body: unknown, token?: string | null) => postTicket(req("/api/levels/ticket", body, token));

  it("issues a ticket pinned to the server's sim and spec versions", async () => {
    const res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ticketId: "ticket_abcdefghijk",
      season: 1,
      level: 42,
      simVersion: SIM,
      specVersion: 142,
      lifeSpent: true,
      lives: 4,
    });
    expect(issueLevelTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", season: 1, level: 42, simVersion: SIM, specVersion: 142 })
    );
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

  it("answers 503 and spends nothing while the level engine is not wired", async () => {
    vi.mocked(getLevelCatalog).mockReturnValue(null);
    const res = await ticket({ season: 1, level: 42, simVersion: SIM });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("LEVELS_UNAVAILABLE");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("tells a stale app to update before a life is spent", async () => {
    const res = await ticket({ season: 1, level: 42, simVersion: SIM - 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SIM_VERSION_MISMATCH");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("refuses a season the server has no manifest for, or that is not active", async () => {
    expect((await ticket({ season: 2, level: 1, simVersion: SIM })).status).toBe(404);
    vi.mocked(activeLevelSeason).mockResolvedValue(null);
    const res = await ticket({ season: 1, level: 1, simVersion: SIM });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SEASON_NOT_FOUND");
    expect(issueLevelTicket).not.toHaveBeenCalled();
  });

  it("refuses a level beyond the season's level count", async () => {
    catalog.season = () => ({ id: 1, levelCount: 20, manifestHash: HASH, specVersion: () => 1 });
    const res = await ticket({ season: 1, level: 21, simVersion: SIM });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("LEVEL_NOT_FOUND");
  });

  it("refuses to issue when the activation row pins a different manifest or a newer engine", async () => {
    vi.mocked(activeLevelSeason).mockResolvedValue({ id: 1, manifestHash: "other", minLevelSimVersion: 1 });
    expect((await ticket({ season: 1, level: 1, simVersion: SIM })).status).toBe(503);
    vi.mocked(activeLevelSeason).mockResolvedValue({ id: 1, manifestHash: HASH, minLevelSimVersion: SIM + 1 });
    expect((await ticket({ season: 1, level: 1, simVersion: SIM })).status).toBe(503);
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
  let token: string;

  beforeEach(async () => {
    token = (await encodeRunReplay({ seed: "s1:level:42:1", peakY: 0, inputs }))!;
  });

  const result = (body: unknown, auth?: string | null) => postResult(req("/api/levels/result", body, auth));

  it("verifies against the ticket's level, not anything in the request", async () => {
    const res = await result({ ticketId: "ticket_abcdefghijk", replayToken: token, season: 9, level: 300, stars: 3 });
    expect(res.status).toBe(200);
    expect(catalog.verify).toHaveBeenCalledTimes(1);
    const [spec, replay] = catalog.verify.mock.calls[0] as unknown as [unknown, RunReplay];
    expect(spec).toEqual({ season: 1, level: 42, simVersion: SIM, specVersion: 142, startPowerUp: null });
    expect(replay.inputs).toHaveLength(inputs.length);
    expect(openTicketSpec).toHaveBeenCalledWith("u1", "ticket_abcdefghijk", expect.any(Date));
  });

  it("stores the server's verdict and returns the result", async () => {
    const res = await result({ ticketId: "ticket_abcdefghijk", replayToken: token });
    expect(await res.json()).toMatchObject({ outcome: "cleared", stars: 3, bestTicks: 1000, lives: 5, nextLifeAt: null });
    expect(submitLevelResult).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", ticketId: "ticket_abcdefghijk", verdict: OK_VERDICT, replayToken: token })
    );
  });

  it("rejects a run the re-simulation refuses, and records nothing", async () => {
    catalog.verify.mockReturnValueOnce({ ok: false, code: "REPLAY_MISMATCH", reason: "seed is not this level" });
    const res = await result({ ticketId: "ticket_abcdefghijk", replayToken: token });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("REPLAY_MISMATCH");
    expect(submitLevelResult).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed ticket id or replay before any lookup", async () => {
    for (const body of [
      { replayToken: token },
      { ticketId: "../../x", replayToken: token },
      { ticketId: "ticket_abcdefghijk" },
      { ticketId: "ticket_abcdefghijk", replayToken: "not-a-replay" },
    ]) {
      expect((await result(body)).status).toBe(400);
    }
    expect(submitLevelResult).not.toHaveBeenCalled();
  });

  it("refuses when the ticket was issued under another engine", async () => {
    vi.mocked(openTicketSpec).mockResolvedValueOnce({
      season: 1,
      level: 42,
      simVersion: SIM - 1,
      specVersion: 142,
      startPowerUp: null,
    });
    const res = await result({ ticketId: "ticket_abcdefghijk", replayToken: token });
    expect(res.status).toBe(409);
    expect(catalog.verify).not.toHaveBeenCalled();
  });

  it("maps ticket and replay-claim refusals", async () => {
    vi.mocked(openTicketSpec).mockRejectedValueOnce(new LevelError("TICKET_USED", "used"));
    expect((await result({ ticketId: "ticket_abcdefghijk", replayToken: token })).status).toBe(409);
    vi.mocked(openTicketSpec).mockRejectedValueOnce(new LevelError("TICKET_EXPIRED", "expired"));
    expect((await result({ ticketId: "ticket_abcdefghijk", replayToken: token })).status).toBe(410);
    vi.mocked(submitLevelResult).mockRejectedValueOnce(new LevelError("REPLAY_REUSED", "reused"));
    const res = await result({ ticketId: "ticket_abcdefghijk", replayToken: token });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("REPLAY_REUSED");
  });

  it("answers 503 while the level engine is not wired", async () => {
    vi.mocked(getLevelCatalog).mockReturnValue(null);
    expect((await result({ ticketId: "ticket_abcdefghijk", replayToken: token })).status).toBe(503);
    expect(openTicketSpec).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    expect((await result({ ticketId: "ticket_abcdefghijk", replayToken: token }, null)).status).toBe(401);
  });
});

describe("GET /api/levels/me", () => {
  it("returns a fresh profile for a player with no row, without creating one", async () => {
    vi.mocked(levelProfile).mockResolvedValueOnce(null);
    const res = await getMe(req("/api/levels/me?season=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ lives: 5, xp: 0, playerLevel: 1, frontier: 1, levels: [] });
  });

  it("returns the stored profile with ISO dates", async () => {
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
    });
    const res = await getMe(req("/api/levels/me?season=1"));
    expect(await res.json()).toMatchObject({ lives: 3, nextLifeAt: "2026-09-27T12:30:00.000Z", frontier: 4 });
  });

  it("rejects a bad season and requires sign-in", async () => {
    expect((await getMe(req("/api/levels/me?season=abc"))).status).toBe(400);
    expect((await getMe(req("/api/levels/me?season=0"))).status).toBe(400);
    expect((await getMe(req("/api/levels/me", undefined, null))).status).toBe(401);
  });
});
