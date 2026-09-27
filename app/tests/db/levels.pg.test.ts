/**
 * src/db/levels.ts against a REAL Postgres: lives spent and refunded once,
 * the ticket consumed once under concurrent submits, XP keys paid once,
 * frontier locking, replay claims and the episode award. The guarantees are
 * row locks, conditional updates and unique indexes, which a mocked Prisma
 * cannot say anything about.
 *
 * Opt-in, against a THROWAWAY local database, like dailyClimb.pg.test.ts:
 *
 *   L=postgresql://postgres@127.0.0.1:55432/leveltest
 *   DATABASE_URL=$L DIRECT_URL=$L pnpm db:migrate:local
 *   LEVELS_PG_URL=$L pnpm vitest run tests/db/levels.pg.test.ts
 *
 * The suite TRUNCATEs users and the level tables, so it refuses any
 * LEVELS_PG_URL that is not on a loopback host. It never reads DATABASE_URL.
 * CI has no Postgres service, so there it is skipped.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const PG_URL = process.env.LEVELS_PG_URL ?? "";

const db = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../src/db/client", () => ({
  get prisma() {
    return db.client;
  },
}));

import {
  LevelError,
  activeLevelSeason,
  issueLevelTicket,
  levelProfile,
  openTicketSpec,
  submitLevelResult,
  type SubmitResultInput,
} from "../../src/db/levels";
import { firstClearXp, EPISODE_XP, LIFE_REFILL_MS, STAR_XP } from "../../src/levels/rules";
import { isLocalDbUrl } from "../../scripts/localDbGuard";

const T0 = new Date("2026-09-27T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const PARS = { twoStarTicks: 1250, threeStarTicks: 1050 };

type Verdict = SubmitResultInput["verdict"];

function cleared(finishTicks: number, hash = `h-${finishTicks}`): Verdict {
  return {
    ok: true,
    finished: true,
    finishTicks,
    raceTicks: finishTicks,
    allGems: true,
    pars: PARS,
    inputHash: hash,
    inputSegments: 40,
  };
}

function failed(raceTicks: number): Verdict {
  return { ...cleared(0, `fail-${raceTicks}`), finished: false, finishTicks: null, raceTicks };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (err) {
    if (err instanceof LevelError) return err.code;
    throw err;
  }
}

describe.skipIf(!PG_URL)("levels on Postgres", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!isLocalDbUrl(PG_URL)) {
      throw new Error("LEVELS_PG_URL must be a postgresql:// URL on a local throwaway database");
    }
    const url = new URL(PG_URL);
    url.searchParams.set("connection_limit", "16");
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    db.client = prisma;
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "xp_grants", "level_replay_claims", "level_progress", "level_run_tickets", "level_seasons", "users" CASCADE'
    );
  });

  async function user(id: string, extra: { lives?: number; livesUpdatedAt?: Date | null; xp?: number } = {}) {
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        lives: extra.lives ?? 5,
        lives_updated_at: extra.livesUpdatedAt ?? null,
        xp: extra.xp ?? 0,
      },
    });
  }

  const start = (userId: string, level: number, now = T0, season = 1) =>
    issueLevelTicket({ userId, season, level, simVersion: 1, specVersion: 1, now });

  const submit = (userId: string, ticketId: string, verdict: Verdict, now = T0) =>
    submitLevelResult({ userId, ticketId, verdict, replayToken: `tok-${ticketId}`, now });

  const livesOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { lives: true } })).lives;

  /** Clear levels 1..n for `userId` (free levels, no lives spent). */
  async function clearThrough(userId: string, n: number) {
    for (let level = 1; level <= n; level++) {
      const t = await start(userId, level);
      await submit(userId, t.ticketId, cleared(1200, `${userId}-${level}`));
    }
  }

  describe("tickets and lives", () => {
    it("L1-10 cost no life", async () => {
      await user("a");
      const t = await start("a", 1);
      expect(t).toMatchObject({ lifeSpent: false, lives: 5, nextLifeAt: null });
      expect(await livesOf("a")).toBe(5);
    });

    it("L11 spends a life and starts the refill timer", async () => {
      await user("a");
      await clearThrough("a", 10);
      const t = await start("a", 11);
      expect(t).toMatchObject({ lifeSpent: true, lives: 4 });
      expect(t.nextLifeAt).toEqual(new Date(T0.getTime() + LIFE_REFILL_MS));
      const row = await prisma.user.findUniqueOrThrow({ where: { id: "a" } });
      expect(row).toMatchObject({ lives: 4, lives_updated_at: T0 });
    });

    it("refuses a level past the frontier", async () => {
      await user("a");
      expect(await codeOf(start("a", 2))).toBe("LEVEL_LOCKED");
      await clearThrough("a", 1);
      expect(await codeOf(start("a", 3))).toBe("LEVEL_LOCKED");
      expect(await codeOf(start("a", 2))).toBe("resolved");
    });

    it("refuses at 0 lives with the next life time, and writes nothing", async () => {
      await user("a");
      await clearThrough("a", 10);
      await prisma.user.update({ where: { id: "a" }, data: { lives: 0, lives_updated_at: at(-10) } });
      try {
        await start("a", 11);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(LevelError);
        expect((err as LevelError).code).toBe("OUT_OF_LIVES");
        expect((err as LevelError).details.nextLifeAt).toBe(at(20).toISOString());
      }
      expect(await prisma.levelRunTicket.count({ where: { level: 11 } })).toBe(0);
    });

    it("a life comes back after 30 minutes and can be spent", async () => {
      await user("a");
      await clearThrough("a", 10);
      await prisma.user.update({ where: { id: "a" }, data: { lives: 0, lives_updated_at: T0 } });
      const t = await start("a", 11, at(31));
      expect(t).toMatchObject({ lifeSpent: true, lives: 0 });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: "a" } });
      // The timer moved one whole step, keeping the extra minute.
      expect(row.lives_updated_at).toEqual(at(30));
    });

    it("a new ticket abandons the open one without a refund", async () => {
      await user("a");
      await clearThrough("a", 10);
      const first = await start("a", 11);
      await start("a", 11);
      expect(await livesOf("a")).toBe(3);
      expect(await prisma.levelRunTicket.findUnique({ where: { id: first.ticketId } })).toMatchObject({
        outcome: "abandoned",
      });
      expect(await codeOf(submit("a", first.ticketId, cleared(1000)))).toBe("TICKET_USED");
      expect(await livesOf("a")).toBe(3);
    });

    it("one player's ticket is not found for another", async () => {
      await user("a");
      await user("b");
      const t = await start("a", 1);
      expect(await codeOf(openTicketSpec("b", t.ticketId, T0))).toBe("TICKET_NOT_FOUND");
      expect(await codeOf(submit("b", t.ticketId, cleared(1000)))).toBe("TICKET_NOT_FOUND");
    });

    it("an expired ticket cannot be submitted", async () => {
      await user("a");
      const t = await start("a", 1);
      expect(await codeOf(submit("a", t.ticketId, cleared(1000), at(24 * 60)))).toBe("TICKET_EXPIRED");
    });
  });

  describe("results", () => {
    it("a clear refunds the life, records stars and pays first-clear + star XP", async () => {
      await user("a");
      await clearThrough("a", 10);
      const xpBefore = (await prisma.user.findUniqueOrThrow({ where: { id: "a" } })).xp;
      const t = await start("a", 11);
      const r = await submit("a", t.ticketId, cleared(1100));
      expect(r).toMatchObject({
        outcome: "cleared",
        stars: 2,
        bestStars: 2,
        previousStars: 0,
        bestTicks: 1100,
        newBest: true,
        lifeRefunded: true,
        lives: 5,
        xpGained: firstClearXp(11) + 2 * STAR_XP,
      });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: "a" } });
      expect(row.xp).toBe(xpBefore + firstClearXp(11) + 2 * STAR_XP);
      expect(row.lives).toBe(5);
    });

    it("a fail keeps the life spent; a bad start (< 3 s) refunds it", async () => {
      await user("a");
      await clearThrough("a", 10);
      const t1 = await start("a", 11);
      expect(await submit("a", t1.ticketId, failed(400))).toMatchObject({ outcome: "failed", lifeRefunded: false, lives: 4 });
      const t2 = await start("a", 11);
      expect(await submit("a", t2.ticketId, failed(60))).toMatchObject({ outcome: "bad_start", lifeRefunded: true, lives: 4 });
    });

    it("concurrent submits of one ticket refund and pay exactly once", async () => {
      await user("a");
      await clearThrough("a", 10);
      await prisma.user.update({ where: { id: "a" }, data: { lives: 1, lives_updated_at: T0 } });
      const t = await start("a", 11);
      expect(await livesOf("a")).toBe(0);
      const xpBefore = (await prisma.user.findUniqueOrThrow({ where: { id: "a" } })).xp;

      const codes = await Promise.all(Array.from({ length: 8 }, () => codeOf(submit("a", t.ticketId, cleared(1000)))));
      expect(codes.filter((c) => c === "resolved")).toHaveLength(1);
      expect(codes.filter((c) => c === "TICKET_USED")).toHaveLength(7);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: "a" } });
      expect(row.lives).toBe(1);
      expect(row.xp).toBe(xpBefore + firstClearXp(11) + 3 * STAR_XP);
      expect(await prisma.xpGrant.count({ where: { userId: "a", key: { startsWith: "star:1:11:" } } })).toBe(3);
    });

    it("replaying a level pays only new stars, never the first clear again", async () => {
      await user("a");
      const t1 = await start("a", 1);
      await submit("a", t1.ticketId, cleared(1300, "slow"));
      const t2 = await start("a", 1);
      const r = await submit("a", t2.ticketId, cleared(1000, "fast"));
      expect(r).toMatchObject({ stars: 3, previousStars: 1, bestStars: 3, xpGained: 2 * STAR_XP, bestTicks: 1000 });
      expect(r.awards.map((a) => a.key)).toEqual(["star:1:1:2", "star:1:1:3"]);
      const t3 = await start("a", 1);
      const worse = await submit("a", t3.ticketId, cleared(1200, "mid"));
      expect(worse).toMatchObject({ stars: 2, bestStars: 3, bestTicks: 1000, newBest: false, xpGained: 0 });
      const progress = await prisma.levelProgress.findFirstOrThrow({ where: { userId: "a", level: 1 } });
      expect(progress).toMatchObject({ stars: 3, best_ticks: 1000, replay_token: `tok-${t2.ticketId}` });
    });

    it("refuses another account's cleared run and leaves the ticket open", async () => {
      await user("a");
      await user("b");
      const ta = await start("a", 1);
      await submit("a", ta.ticketId, cleared(1000, "same-log"));
      const tb = await start("b", 1);
      expect(await codeOf(submit("b", tb.ticketId, cleared(1000, "same-log")))).toBe("REPLAY_REUSED");
      expect(await prisma.levelRunTicket.findUnique({ where: { id: tb.ticketId } })).toMatchObject({ used_at: null });
      expect(await prisma.levelProgress.count({ where: { userId: "b" } })).toBe(0);
      // The owner resubmitting their own run is fine.
      const ta2 = await start("a", 1);
      expect(await codeOf(submit("a", ta2.ticketId, cleared(1000, "same-log")))).toBe("resolved");
    });

    it("low-entropy cleared runs are not claimed", async () => {
      await user("a");
      await user("b");
      const low = (): Verdict => ({ ...cleared(1000, "held"), inputSegments: 2 });
      const ta = await start("a", 1);
      await submit("a", ta.ticketId, low());
      const tb = await start("b", 1);
      expect(await codeOf(submit("b", tb.ticketId, low()))).toBe("resolved");
    });

    it("clearing all 15 levels of an episode pays the episode once", async () => {
      await user("a");
      await clearThrough("a", 14);
      expect(await prisma.xpGrant.count({ where: { source: "episode" } })).toBe(0);
      const t = await start("a", 15);
      const r = await submit("a", t.ticketId, cleared(1200, "ep"));
      expect(r.awards).toContainEqual({ key: "episode:1:1", amount: EPISODE_XP });
      const again = await start("a", 15);
      const r2 = await submit("a", again.ticketId, cleared(1000, "ep2"));
      expect(r2.awards.map((a) => a.key)).not.toContain("episode:1:1");
    });

    it("keeps player_level in step with xp", async () => {
      await user("a", { xp: 55 });
      const t = await start("a", 1);
      await submit("a", t.ticketId, cleared(1300));
      const row = await prisma.user.findUniqueOrThrow({ where: { id: "a" } });
      expect(row.xp).toBe(55 + firstClearXp(1) + STAR_XP);
      expect(row.player_level).toBe(2);
    });
  });

  describe("reads", () => {
    it("levelProfile applies the refill without writing it", async () => {
      await user("a", { lives: 2, livesUpdatedAt: T0, xp: 60 });
      const p = await levelProfile("a", 1, at(65));
      expect(p).toMatchObject({ lives: 4, nextLifeAt: at(90), xp: 60, playerLevel: 2, frontier: 1, totalStars: 0 });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ lives: 2, lives_updated_at: T0 });
    });

    it("levelProfile creates nothing for an unknown user", async () => {
      expect(await levelProfile("ghost", 1, T0)).toBeNull();
      expect(await prisma.user.count()).toBe(0);
    });

    it("activeLevelSeason ignores seasons that have not started", async () => {
      await prisma.levelSeason.create({ data: { id: 1, name: "S1", manifest_hash: "abc", starts_at: at(10) } });
      expect(await activeLevelSeason(1, T0)).toBeNull();
      expect(await activeLevelSeason(1, at(10))).toEqual({ id: 1, manifestHash: "abc", minLevelSimVersion: 1 });
      expect(await activeLevelSeason(2, at(10))).toBeNull();
    });
  });
});
