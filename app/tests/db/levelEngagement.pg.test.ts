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
import type { BoosterType } from "../../src/levels/engagement";
import { TEST_STAR_CHEST_SECRET, rollStarChest } from "../../src/levels/starChestServer";
import { levelBoosterTypes } from "../../src/levels/catalog";
import { grantBonusLife, levelFriendsBoard, recordDailyRewards } from "../../src/db/levelExtras";
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

  async function user(id: string, extra: { streak?: number; lives?: number; displayName?: string } = {}) {
    await prisma.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        level_streak: extra.streak ?? 0,
        lives: extra.lives ?? 5,
        lives_updated_at: extra.lives !== undefined && extra.lives < 5 ? T0 : null,
        display_name: extra.displayName ?? null,
      },
    });
  }

  // Each run is started at `now` and reported five minutes later, so every
  // run fits the wall clock and none is a bad start.
  let clock = 0;
  const tick = () => at((clock += 10));

  const start = (userId: string, level: number, opts: { now?: Date; booster?: BoosterType } = {}) =>
    issueLevelTicket({
      userId,
      season: 1,
      level,
      simVersion: 1,
      allowedBoosters: levelBoosterTypes(1, level) ?? [],
      booster: opts.booster ?? null,
      now: opts.now ?? tick(),
    });

  let chestSecret: string | null = TEST_STAR_CHEST_SECRET;
  const submit = (userId: string, ticketId: string, run: ReportedRun, now = tick()) =>
    submitLevelResult({ userId, ticketId, run, replayToken: null, chestSecret, now });

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
    chestSecret = TEST_STAR_CHEST_SECRET;
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

    it("grants a super jump from 5 past the early levels, else the rapid climb", async () => {
      await user("a");
      await clearThrough("a", 5);
      // L6 does not allow the super jump yet (unlocked at L11).
      expect((await start("a", 6)).startPowerUp).toEqual({ type: "rapid-climb", source: "streak" });
      await prisma.levelRunTicket.updateMany({ where: { used_at: null }, data: { used_at: T0, outcome: "cleared" } });
      await clearThrough("a", 10);
      // L11 unlocks it, but no early level (L1-L45) starts with one.
      expect((await start("a", 11)).startPowerUp).toEqual({ type: "rapid-climb", source: "streak" });
      await prisma.levelRunTicket.updateMany({ where: { used_at: null }, data: { used_at: T0, outcome: "cleared" } });
      await clearThrough("a", 45);
      const t = await start("a", 46);
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

    it("the preview closes an open frontier ticket like the next issue will", async () => {
      await user("a");
      await clearThrough("a", 3);
      const open = await start("a", 4, { now: at(3000) });
      expect(open.startPowerUp).toMatchObject({ type: "rapid-climb", source: "streak" });

      // Within the quick-restart window the open ticket is a neutral bad start.
      const quick = new Date(at(3000).getTime() + 2_000);
      expect((await levelProfile("a", 1, quick)).nextStartPowerUp).toMatchObject({ type: "rapid-climb" });

      // Past it, the next issue abandons the frontier ticket: the streak resets.
      const later = at(3010);
      const p = await levelProfile("a", 1, later);
      expect(p).toMatchObject({ streak: 3, frontier: 4, nextStartPowerUp: null, stuck: { level: 4, fails: 1 } });
      // Read-only: the ticket is still open and the stored streak unchanged.
      expect(await prisma.levelRunTicket.findUniqueOrThrow({ where: { id: open.ticketId } })).toMatchObject({
        used_at: null,
      });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: "a" } })).level_streak).toBe(3);
      // And it agrees with the ticket the next start actually issues.
      expect(await start("a", 4, { now: later })).toMatchObject({ streak: 0, startPowerUp: null, failsAtLevel: 1 });
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
  describe("bonus life and Daily XP", () => {
    const row = (id: string) =>
      prisma.user.findUniqueOrThrow({ where: { id }, select: { lives: true, xp: true, bonus_life_day: true, player_level: true } });

    it("adds one life once per UTC day, shared by the Daily and duels", async () => {
      await user("a", { lives: 2 });
      expect(await grantBonusLife("a", at(1))).toBe(true);
      expect(await grantBonusLife("a", at(2))).toBe(false);
      const daily = await recordDailyRewards({ userId: "a", day: "2026-09-27", floors: 0, now: at(3) });
      expect(daily.lifeGranted).toBe(false);
      expect(await row("a")).toMatchObject({ lives: 3, bonus_life_day: "2026-09-27" });
      // The next UTC day pays again (lives set low again: 12 h would refill them).
      const nextDay = new Date("2026-09-28T00:00:01Z");
      await prisma.user.update({ where: { id: "a" }, data: { lives: 1, lives_updated_at: nextDay } });
      expect(await grantBonusLife("a", nextDay)).toBe(true);
      expect(await row("a")).toMatchObject({ lives: 2, bonus_life_day: "2026-09-28" });
    });

    it("pays exactly once under concurrent finishes", async () => {
      await user("a", { lives: 1 });
      const paid = await Promise.all(Array.from({ length: 8 }, () => grantBonusLife("a", at(1))));
      expect(paid.filter(Boolean)).toHaveLength(1);
      expect((await row("a")).lives).toBe(2);
    });

    it("keeps the day's bonus for later when lives are full", async () => {
      await user("a");
      expect(await grantBonusLife("a", at(1))).toBe(false);
      expect(await row("a")).toMatchObject({ lives: 5, bonus_life_day: null });
    });

    it("never pays or creates a row for guests or unknown players", async () => {
      expect(await grantBonusLife("guest:abc", at(1))).toBe(false);
      expect(await grantBonusLife("nobody", at(1))).toBe(false);
      expect(await recordDailyRewards({ userId: "nobody", day: "2026-09-27", floors: 40, now: at(1) })).toEqual({
        xpGained: 0,
        dailyXp: 0,
        lifeGranted: false,
      });
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.xpGrant.count()).toBe(0);
    });

    it("raises the day's XP to its best floor count, paying only the rise", async () => {
      await user("a");
      const day = "2026-09-27";
      expect(await recordDailyRewards({ userId: "a", day, floors: 20, now: at(1) })).toMatchObject({ xpGained: 20, dailyXp: 20 });
      expect(await recordDailyRewards({ userId: "a", day, floors: 35, now: at(2) })).toMatchObject({ xpGained: 15, dailyXp: 35 });
      expect(await recordDailyRewards({ userId: "a", day, floors: 10, now: at(3) })).toMatchObject({ xpGained: 0, dailyXp: 35 });
      expect(await recordDailyRewards({ userId: "a", day, floors: 250, now: at(4) })).toMatchObject({ xpGained: 65, dailyXp: 100 });
      expect((await row("a")).xp).toBe(100);
      expect(await prisma.xpGrant.findMany({ where: { userId: "a" }, select: { key: true, amount: true } })).toEqual([
        { key: "daily:2026-09-27", amount: 100 },
      ]);
      // Another day is its own grant.
      await recordDailyRewards({ userId: "a", day: "2026-09-28", floors: 5, now: at(5) });
      expect((await row("a")).xp).toBe(105);
      expect((await row("a")).player_level).toBe(2);
    });

    it("never double-pays a day under concurrent submits", async () => {
      await user("a");
      await Promise.all(
        [12, 30, 30, 18, 30, 7].map((floors) => recordDailyRewards({ userId: "a", day: "2026-09-27", floors, now: at(1) }))
      );
      expect((await row("a")).xp).toBe(30);
      expect(await prisma.xpGrant.count({ where: { userId: "a" } })).toBe(1);
    });
  });

  describe("friends-only level boards", () => {
    async function friends(a: string, b: string, status: "accepted" | "pending" | "declined" | "blocked") {
      await prisma.friendship.create({ data: { sender_id: a, receiver_id: b, status } });
    }
    async function progress(userId: string, level: number, bestTicks: number, stars: number) {
      await prisma.levelProgress.create({
        data: { userId, season: 1, level, stars, best_ticks: bestTicks, sim_version: 1, updated_at: T0 },
      });
    }

    it("ranks the caller and accepted friends only, fastest first", async () => {
      for (const id of ["me", "f1", "f2", "pend", "decl", "blk", "stranger", "both"]) {
        await user(id, { displayName: id.toUpperCase() });
      }
      await friends("me", "f1", "accepted");
      await friends("f2", "me", "accepted");
      await friends("me", "pend", "pending");
      await friends("decl", "me", "declined");
      await friends("blk", "me", "blocked");
      // An accepted row one way and a block the other: the block wins.
      await friends("me", "both", "accepted");
      await friends("both", "me", "blocked");
      for (const [id, ticks] of [["me", 1000], ["f1", 900], ["f2", 1200], ["pend", 500], ["decl", 500], ["blk", 500], ["stranger", 400], ["both", 300]] as const) {
        await progress(id, 12, ticks, 2);
      }
      await progress("f1", 13, 100, 3);

      const board = await levelFriendsBoard("me", 1, 12);
      expect(board.friendCount).toBe(2);
      expect(board.entries.map((e) => [e.handle, e.bestTicks, e.isMe, e.rank])).toEqual([
        ["F1", 900, false, 1],
        ["ME", 1000, true, 2],
        ["F2", 1200, false, 3],
      ]);
    });

    it("shows only the caller before any friend has cleared the level", async () => {
      await user("me");
      await user("f1");
      await friends("me", "f1", "accepted");
      expect((await levelFriendsBoard("me", 1, 12)).entries).toEqual([]);
      await progress("me", 12, 1000, 1);
      expect((await levelFriendsBoard("me", 1, 12)).entries).toMatchObject([{ isMe: true, bestTicks: 1000 }]);
    });
  });
  describe("star chests and boosters", () => {
    const inventory = async (id: string) =>
      Object.fromEntries(
        (await prisma.userBooster.findMany({ where: { userId: id }, select: { type: true, count: true } })).map((r) => [
          r.type,
          r.count,
        ])
      );
    const livesOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).lives;
    const three = () => cleared(1000, 3);
    async function clearThroughWith3(userId: string, n: number) {
      const results = [];
      for (let level = 1; level <= n; level++) results.push(await play(userId, level, three()));
      return results;
    }
    /** Set the owned count of one booster (clears may already have opened chests). */
    async function give(userId: string, type: BoosterType, count: number) {
      await prisma.userBooster.upsert({
        where: { user_booster_type: { userId, type } },
        create: { userId, type, count },
        update: { count },
      });
    }

    it("opens chest 1 at 20 lifetime stars with its HMAC roll, once", async () => {
      await user("a");
      const results = await clearThroughWith3("a", 7);
      expect(results.slice(0, 6).every((r) => r.chestsOpened.length === 0)).toBe(true);
      const opened = results[6];
      // Pool: the boosters unlocked at the highest cleared level (L7).
      const expected = rollStarChest(TEST_STAR_CHEST_SECRET, "a", 1, ["rapid-climb", "sprint-burst"]);
      expect(opened).toMatchObject({ lifetimeStars: 21, chestsOpened: [{ chestNumber: 1, boosters: expected }] });
      const counts: Record<string, number> = {};
      for (const t of expected) counts[t] = (counts[t] ?? 0) + 1;
      expect(await inventory("a")).toEqual(counts);
      expect(opened.boosters).toEqual(counts);
      // A replay that earns nothing new opens nothing.
      expect((await play("a", 1, three())).chestsOpened).toEqual([]);
      expect(await prisma.starChest.count({ where: { userId: "a" } })).toBe(1);
    });

    it("keeps chests closed without a secret and catches up once it is set", async () => {
      await user("a");
      chestSecret = null;
      const results = await clearThroughWith3("a", 7);
      expect(results[6]).toMatchObject({ lifetimeStars: 21, chestsOpened: [] });
      expect(await prisma.starChest.count()).toBe(0);
      chestSecret = TEST_STAR_CHEST_SECRET;
      const next = await play("a", 8, cleared(1200, 1));
      expect(next.chestsOpened.map((c) => c.chestNumber)).toEqual([1]);
    });

    it("the profile shows the inventory and chest progress, read-only", async () => {
      await user("a");
      await clearThroughWith3("a", 5);
      await give("a", "giant", 2);
      expect(await levelProfile("a", 1, tick())).toMatchObject({
        boosters: { giant: 2 },
        chests: { lifetimeStars: 15, starsIntoChest: 15, perChest: 20, earned: 0 },
      });
    });

    it("equips an owned booster: spent in the ticket, stored as its start power-up", async () => {
      await user("a");
      await clearThroughWith3("a", 10);
      await play("a", 11, failed());
      await give("a", "sprint-burst", 2);
      const t = await start("a", 11, { booster: "sprint-burst" });
      expect(t).toMatchObject({ startPowerUp: { type: "sprint-burst", source: "booster" }, boosters: { "sprint-burst": 1 } });
      expect(await prisma.levelRunTicket.findUniqueOrThrow({ where: { id: t.ticketId } })).toMatchObject({
        start_power_up: "sprint-burst",
        booster: "sprint-burst",
      });
    });

    it("refuses a booster that is not owned or not unlocked, and writes nothing", async () => {
      await user("a");
      await clearThroughWith3("a", 10);
      await play("a", 11, failed());
      const lives = await livesOf("a");
      expect(await codeOf(start("a", 11, { booster: "giant" }))).toBe("BOOSTER_NOT_ALLOWED");
      // Unlocked at L11, but kept out of early-level starts.
      await give("a", "super-jump", 1);
      expect(await codeOf(start("a", 11, { booster: "super-jump" }))).toBe("BOOSTER_NOT_ALLOWED");
      expect(await codeOf(start("a", 11, { booster: "rapid-climb" }))).toBe("BOOSTER_NOT_OWNED");
      expect(await livesOf("a")).toBe(lives);
      expect(await prisma.levelRunTicket.count({ where: { used_at: null } })).toBe(0);

      // A streak run already starts with a free rapid climb: a rapid climb
      // booster would only refresh it, so it is kept (and said so), not spent.
      await user("b", { streak: 3 });
      await clearThroughWith3("b", 3);
      await give("b", "rapid-climb", 1);
      const t = await start("b", 4, { booster: "rapid-climb" });
      expect(t).toMatchObject({
        startPowerUp: { type: "rapid-climb", source: "streak" },
        startPowerUps: [{ type: "rapid-climb", source: "streak" }],
        boosterKept: "rapid-climb",
        boosters: { "rapid-climb": 1 },
      });
      expect(await prisma.levelRunTicket.findUniqueOrThrow({ where: { id: t.ticketId } })).toMatchObject({ booster: null });
      expect(await inventory("b")).toEqual({ "rapid-climb": 1 });
    });

    it("refuses a kept booster that is not owned, and writes nothing", async () => {
      await user("a", { streak: 3 });
      await clearThroughWith3("a", 3);
      const lives = await livesOf("a");
      expect(await codeOf(start("a", 4, { booster: "rapid-climb" }))).toBe("BOOSTER_NOT_OWNED");
      expect(await livesOf("a")).toBe(lives);
      expect(await prisma.levelRunTicket.count({ where: { used_at: null } })).toBe(0);
    });

    it("starts with the free power-up AND a booster of another type, spending the booster", async () => {
      await user("a");
      // Six first clears in a row: L7 starts with a free rapid climb.
      await clearThroughWith3("a", 6);
      await prisma.userBooster.deleteMany({ where: { userId: "a" } });
      await give("a", "sprint-burst", 2);
      const t = await start("a", 7, { booster: "sprint-burst", now: at(900) });
      expect(t).toMatchObject({
        startPowerUp: { type: "rapid-climb", source: "streak" },
        startPowerUps: [
          { type: "rapid-climb", source: "streak" },
          { type: "sprint-burst", source: "booster" },
        ],
        boosterKept: null,
        boosters: { "sprint-burst": 1 },
      });
      // start_power_up keeps the free one; the booster column the spent one.
      expect(await prisma.levelRunTicket.findUniqueOrThrow({ where: { id: t.ticketId } })).toMatchObject({
        start_power_up: "rapid-climb",
        booster: "sprint-burst",
      });
      // A bad start still gives the booster back.
      await submit("a", t.ticketId, failed(30), new Date(at(900).getTime() + 2_000));
      expect(await inventory("a")).toEqual({ "sprint-burst": 2 });
    });

    it("refunds the booster only on a bad start", async () => {
      await user("a");
      await clearThroughWith3("a", 10);
      await play("a", 11, failed());
      await give("a", "rapid-climb", 3);
      // Clearing L1-10 opened chest 1, so other boosters may be owned too.
      const owned = await inventory("a");
      expect(owned["rapid-climb"]).toBe(3);

      const bad = await start("a", 11, { booster: "rapid-climb", now: at(900) });
      await submit("a", bad.ticketId, failed(30), new Date(at(900).getTime() + 2_000));
      expect(await inventory("a")).toEqual(owned);

      await start("a", 11, { booster: "rapid-climb", now: at(950) });
      // Quick restart: the booster ticket closes as a bad start.
      const quick = await start("a", 11, { now: new Date(at(950).getTime() + 3_000) });
      expect(await inventory("a")).toEqual(owned);
      // Also a bad start, so the fail tally stays under stuck help's free booster.
      await submit("a", quick.ticketId, failed(30), new Date(at(950).getTime() + 5_000));

      const lost = await start("a", 11, { booster: "rapid-climb" });
      await submit("a", lost.ticketId, failed());
      const won = await start("a", 11, { booster: "rapid-climb" });
      await submit("a", won.ticketId, cleared());
      expect((await inventory("a"))["rapid-climb"]).toBe(1);
    });

    it("never spends one booster twice under concurrent starts", async () => {
      await user("a");
      await clearThroughWith3("a", 10);
      await play("a", 11, failed());
      await give("a", "sprint-burst", 1);
      const codes = await Promise.all(
        Array.from({ length: 6 }, () => codeOf(start("a", 11, { booster: "sprint-burst", now: at(3000) })))
      );
      // Starts at the same instant: each one closes the previous ticket as a
      // bad start, which hands its booster back before the next spend. So
      // they may all succeed, but the ledger must net exactly one booster.
      expect(codes.every((c) => c === "resolved" || c === "BOOSTER_NOT_OWNED")).toBe(true);
      expect(codes).toContain("resolved");
      expect((await inventory("a"))["sprint-burst"]).toBe(0);
      const open = await prisma.levelRunTicket.findMany({ where: { userId: "a", used_at: null } });
      expect(open).toHaveLength(1);
      expect(open[0]?.booster).toBe("sprint-burst");
      const closed = await prisma.levelRunTicket.findMany({ where: { userId: "a", level: 11, booster: "sprint-burst", used_at: { not: null } } });
      expect(closed.every((t) => t.outcome === "bad_start")).toBe(true);
      expect(closed).toHaveLength(codes.filter((c) => c === "resolved").length - 1);
    });

    it("never opens a chest twice under concurrent submits", async () => {
      await user("a");
      await clearThroughWith3("a", 6);
      const t = await start("a", 7);
      await Promise.all(Array.from({ length: 6 }, () => codeOf(submit("a", t.ticketId, three()))));
      expect(await prisma.starChest.count({ where: { userId: "a" } })).toBe(1);
      const total = Object.values(await inventory("a")).reduce((a, b) => a + b, 0);
      expect(total).toBe((await prisma.starChest.findFirstOrThrow({ where: { userId: "a" } })).boosters.length);
    });
  });
});
