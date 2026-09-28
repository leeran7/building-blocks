/**
 * Level engagement on a REAL Postgres: win streaks (§6.3), stuck help (§5c),
 * the daily bonus life and Daily XP, friends-only level boards, and star
 * chests with the booster inventory (§6.4). The guarantees are row locks,
 * conditional updates and unique indexes, which a mocked Prisma cannot show.
 *
 * Opt-in, against a THROWAWAY local database, like levels.pg.test.ts:
 *
 *   L=postgresql://postgres@127.0.0.1:55432/leveltest
 *   DATABASE_URL=$L DIRECT_URL=$L pnpm prisma db push --skip-generate
 *   LEVELS_PG_URL=$L pnpm vitest run tests/db/levelEngagement.pg.test.ts
 *
 * The suite TRUNCATEs users and the level tables, so it refuses any
 * LEVELS_PG_URL that is not on a loopback host. CI has no Postgres service,
 * so there it is skipped.
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

import { LevelError, issueLevelTicket, levelProfile, submitLevelResult } from "../../src/db/levels";
import type { ReportedRun } from "../../src/levels/rules";
import { levelBoosterTypes } from "../../src/levels/catalog";
import { isLocalDbUrl } from "../../scripts/localDbGuard";

const T0 = new Date("2026-09-27T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function cleared(ticks = 1200, stars: 1 | 2 | 3 = 1): ReportedRun {
  return { cleared: true, stars, ticks };
}

function failed(ticks = 400): ReportedRun {
  return { cleared: false, stars: 0, ticks };
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

describe.skipIf(!PG_URL)("level engagement on Postgres", () => {
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
      'TRUNCATE "xp_grants", "level_progress", "level_run_tickets", "level_seasons", "users" CASCADE'
    );
  });

  async function user(id: string, extra: { streak?: number } = {}) {
    await prisma.user.create({
      data: { id, email: `${id}@example.test`, level_streak: extra.streak ?? 0 },
    });
  }

  // Each run is started at `now` and reported five minutes later, so every
  // run fits the wall clock and none is a bad start.
  let clock = 0;
  const tick = () => at((clock += 10));

  const start = (userId: string, level: number, opts: { now?: Date } = {}) =>
    issueLevelTicket({
      userId,
      season: 1,
      level,
      simVersion: 1,
      allowedBoosters: levelBoosterTypes(1, level) ?? [],
      now: opts.now ?? tick(),
    });

  const submit = (userId: string, ticketId: string, run: ReportedRun, now = tick()) =>
    submitLevelResult({ userId, ticketId, run, replayToken: null, now });

  async function play(userId: string, level: number, run: ReportedRun) {
    const t = await start(userId, level);
    return submit(userId, t.ticketId, run);
  }

  async function clearThrough(userId: string, n: number) {
    for (let level = 1; level <= n; level++) await play(userId, level, cleared());
  }

  const streakOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { level_streak: true } })).level_streak;

  beforeEach(() => {
    clock = 0;
  });

  describe("win streaks", () => {
    it("counts first clears at the frontier and grants a rapid climb from 3", async () => {
      await user("a");
      await clearThrough("a", 3);
      expect(await streakOf("a")).toBe(3);
      const t = await start("a", 4);
      expect(t.startPowerUp).toEqual({ type: "rapid-climb", source: "streak" });
      const row = await prisma.levelRunTicket.findUniqueOrThrow({ where: { id: t.ticketId } });
      expect(row.start_power_up).toBe("rapid-climb");
    });

    it("grants nothing below 3 in a row", async () => {
      await user("a");
      await clearThrough("a", 4);
      await play("a", 5, failed());
      await play("a", 5, cleared());
      await play("a", 6, cleared());
      expect(await streakOf("a")).toBe(2);
      expect((await start("a", 7)).startPowerUp).toBeNull();
    });

    it("grants a super jump from 5 once it is unlocked, else the rapid climb", async () => {
      await user("a");
      await clearThrough("a", 5);
      // L6 does not allow the super jump yet (unlocked at L11).
      expect((await start("a", 6)).startPowerUp).toEqual({ type: "rapid-climb", source: "streak" });
      await prisma.levelRunTicket.updateMany({ where: { used_at: null }, data: { used_at: T0, outcome: "cleared" } });
      await clearThrough("a", 10);
      const t = await start("a", 11);
      expect(t.startPowerUp).toEqual({ type: "super-jump", source: "streak" });
    });

    it("replays neither count nor break the streak", async () => {
      await user("a");
      await clearThrough("a", 3);
      const replayWin = await play("a", 1, cleared());
      expect(replayWin).toMatchObject({ atFrontier: false, streak: 3 });
      const replayLoss = await play("a", 2, failed());
      expect(replayLoss).toMatchObject({ atFrontier: false, streak: 3 });
      // A replay ticket never starts with the streak's power-up.
      expect((await start("a", 3)).startPowerUp).toBeNull();
    });

    it("a fail at the frontier resets it", async () => {
      await user("a");
      await clearThrough("a", 3);
      expect(await play("a", 4, failed())).toMatchObject({ atFrontier: true, streak: 0 });
      expect((await start("a", 4)).startPowerUp).toBeNull();
    });

    it("an abandoned frontier ticket resets it, before the next ticket is decided", async () => {
      await user("a");
      await clearThrough("a", 3);
      const open = await start("a", 4);
      expect(open.startPowerUp).not.toBeNull();
      const next = await start("a", 4);
      expect(next).toMatchObject({ streak: 0, startPowerUp: null });
    });

    it("an abandoned replay ticket leaves it alone", async () => {
      await user("a");
      await clearThrough("a", 3);
      await start("a", 1);
      expect(await start("a", 4)).toMatchObject({ streak: 3, startPowerUp: { type: "rapid-climb" } });
    });

    it("a bad start is neutral, reported or by a quick restart", async () => {
      await user("a");
      await clearThrough("a", 3);
      const t = await start("a", 4, { now: at(1000) });
      const bad = await submit("a", t.ticketId, failed(30), new Date(at(1000).getTime() + 2_000));
      expect(bad).toMatchObject({ outcome: "bad_start", streak: 3 });
      await start("a", 4, { now: at(2000) });
      const restart = await start("a", 4, { now: new Date(at(2000).getTime() + 3_000) });
      expect(restart).toMatchObject({ streak: 3, startPowerUp: { type: "rapid-climb" } });
    });

    it("the profile previews the frontier's streak power-up without writing", async () => {
      await user("a");
      await clearThrough("a", 3);
      const p = await levelProfile("a", 1, tick());
      expect(p).toMatchObject({ streak: 3, frontier: 4, nextStartPowerUp: { type: "rapid-climb", source: "streak" } });
      expect(await prisma.levelRunTicket.count({ where: { used_at: null } })).toBe(0);
    });
  });
  describe("stuck help", () => {
    const failsOf = async (id: string) =>
      prisma.user.findUniqueOrThrow({
        where: { id },
        select: { level_fail_season: true, level_fail_level: true, level_fail_count: true },
      });

    it("grants a free allowed booster from the 3rd fail at the frontier", async () => {
      await user("a");
      await clearThrough("a", 6);
      await play("a", 7, failed());
      await play("a", 7, failed());
      expect((await start("a", 7)).startPowerUp).toBeNull();
      await prisma.levelRunTicket.updateMany({ where: { used_at: null }, data: { used_at: T0, outcome: "bad_start" } });
      const third = await play("a", 7, failed());
      expect(third).toMatchObject({ failsAtLevel: 3, routeGhostAvailable: false });
      // L7 allows rapid climb and sprint burst: the rotation starts with rapid climb.
      const t = await start("a", 7);
      expect(t).toMatchObject({ failsAtLevel: 3, startPowerUp: { type: "rapid-climb", source: "stuck_help" } });
      expect(await prisma.levelRunTicket.findUniqueOrThrow({ where: { id: t.ticketId } })).toMatchObject({
        start_power_up: "rapid-climb",
      });
    });

    it("counts an abandoned frontier ticket as a fail", async () => {
      await user("a");
      await clearThrough("a", 6);
      await start("a", 7);
      await start("a", 7);
      await start("a", 7);
      const t = await start("a", 7);
      expect(t).toMatchObject({ failsAtLevel: 3, startPowerUp: { source: "stuck_help" } });
    });

    it("offers the route ghost from the 5th fail", async () => {
      await user("a");
      await clearThrough("a", 6);
      for (let i = 0; i < 4; i++) await play("a", 7, failed());
      const fifth = await play("a", 7, failed());
      expect(fifth).toMatchObject({ failsAtLevel: 5, routeGhostAvailable: true });
      expect(await levelProfile("a", 1, tick())).toMatchObject({
        stuck: { level: 7, fails: 5, routeGhostAvailable: true },
        nextStartPowerUp: { source: "stuck_help" },
      });
      expect(await start("a", 7)).toMatchObject({ routeGhostAvailable: true });
    });

    it("resets on the clear, and replays and bad starts never count", async () => {
      await user("a");
      await clearThrough("a", 6);
      await play("a", 7, failed());
      await play("a", 7, failed());
      await play("a", 3, failed());
      const t = await start("a", 7, { now: at(5000) });
      await submit("a", t.ticketId, failed(20), new Date(at(5000).getTime() + 2_000));
      expect(await failsOf("a")).toEqual({ level_fail_season: 1, level_fail_level: 7, level_fail_count: 2 });
      await play("a", 7, cleared());
      expect(await failsOf("a")).toEqual({ level_fail_season: null, level_fail_level: null, level_fail_count: 0 });
    });

    it("a level with no power-ups gets no stuck help", async () => {
      await user("a");
      await clearThrough("a", 2);
      for (let i = 0; i < 3; i++) await play("a", 3, failed());
      // L3 allows no power-ups: stuck help has nothing to give.
      expect((await start("a", 3)).startPowerUp).toBeNull();
    });
  });
});
