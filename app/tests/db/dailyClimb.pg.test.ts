/**
 * src/db/dailyClimb.ts against a REAL Postgres: the atomic GREATEST upsert,
 * consent filtered at read, board order, rank beyond the top 50, and the
 * friends board. The upsert is hand-written SQL (prisma.$queryRaw), so a
 * mocked Prisma cannot say anything about it; only a database can.
 *
 * Opt-in. Set DAILY_CLIMB_PG_URL to a THROWAAWAY local database that has had
 * `prisma migrate deploy` run against it, e.g.
 *
 *   DAILY_CLIMB_PG_URL=postgresql://postgres@127.0.0.1:55432/dailytest pnpm vitest run tests/db/dailyClimb.pg.test.ts
 *
 * The suite TRUNCATEs users, friendships and daily_climb_scores, so it refuses
 * any host that is not localhost / 127.0.0.1 / ::1. It never reads
 * DATABASE_URL. CI has no Postgres service, so there it is skipped.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const PG_URL = process.env.DAILY_CLIMB_PG_URL ?? "";

const db = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../src/db/client", () => ({
  get prisma() {
    return db.client;
  },
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import {
  DAILY_BOARD_LIMIT,
  dailyClimberCount,
  dailyStandingFor,
  friendsDailyLeaderboard,
  recordDailyClimb,
  topDailyClimbers,
} from "../../src/db/dailyClimb";

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`DAILY_CLIMB_PG_URL must point at a local throwaway database, got host ${host}`);
  }
}

const DAY = "2026-09-26";
const CONSENTED = new Date("2026-01-01T00:00:00Z");

describe.skipIf(!PG_URL)("dailyClimb on Postgres", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    assertLocal(PG_URL);
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
    await prisma.$executeRawUnsafe('TRUNCATE "daily_climb_scores", "friendships", "users" CASCADE');
  });

  async function user(id: string, consent: Date | null = CONSENTED, name: string | null = null) {
    await prisma.user.create({
      data: { id, email: `${id}@example.test`, leaderboard_consent_at: consent, display_name: name },
    });
  }

  const write = (userId: string, peakY: number, extra: Partial<{ day: string; ticks: number; token: string }> = {}) =>
    recordDailyClimb({
      userId,
      day: extra.day ?? DAY,
      peakY,
      ticks: extra.ticks ?? Math.round(peakY * 10),
      replayToken: extra.token ?? `tok-${peakY}`,
      simVersion: 1,
    });

  const row = (userId: string, day = DAY) =>
    prisma.dailyClimbScore.findUnique({ where: { daily_climb_user_day: { userId, day } } });

  describe("recordDailyClimb", () => {
    it("inserts the first run of the day as the best", async () => {
      await user("a");
      expect(await write("a", 12.5)).toEqual({ peakY: 12.5, improved: true, attempts: 1 });
      expect(await row("a")).toMatchObject({ peak_y: 12.5, attempts: 1, ticks: 125, replay_token: "tok-12.5" });
    });

    it("never lowers the best; a worse run only adds an attempt", async () => {
      await user("a");
      await write("a", 20);
      const before = await row("a");
      expect(await write("a", 5)).toEqual({ peakY: 20, improved: false, attempts: 2 });
      const after = await row("a");
      expect(after).toMatchObject({ peak_y: 20, attempts: 2, ticks: 200, replay_token: "tok-20" });
      expect(after?.updated_at.getTime()).toBe(before?.updated_at.getTime());
    });

    it("raises the best and moves ticks / replay / updated_at to the better run", async () => {
      await user("a");
      await write("a", 5);
      const before = await row("a");
      await new Promise((r) => setTimeout(r, 5));
      expect(await write("a", 9)).toEqual({ peakY: 9, improved: true, attempts: 2 });
      const after = await row("a");
      expect(after).toMatchObject({ peak_y: 9, attempts: 2, ticks: 90, replay_token: "tok-9" });
      expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
    });

    it("an equal run is not an improvement and keeps the earlier timestamp (tie order)", async () => {
      await user("a");
      await write("a", 7, { token: "first" });
      const before = await row("a");
      await new Promise((r) => setTimeout(r, 5));
      expect(await write("a", 7, { token: "second" })).toEqual({ peakY: 7, improved: false, attempts: 2 });
      const after = await row("a");
      expect(after).toMatchObject({ replay_token: "first" });
      expect(after!.updated_at.getTime()).toBe(before!.updated_at.getTime());
    });

    it("clamps a negative peak to 0", async () => {
      await user("a");
      expect((await write("a", -3)).peakY).toBe(0);
    });

    it("partitions by day: another day is a separate row", async () => {
      await user("a");
      await write("a", 30, { day: "2026-09-25" });
      expect(await write("a", 4)).toEqual({ peakY: 4, improved: true, attempts: 1 });
      expect((await row("a", "2026-09-25"))?.peak_y).toBe(30);
    });

    it("concurrent submissions on a NEW row keep the max and count every attempt", async () => {
      await user("a");
      const peaks = [3, 17, 8, 41.5, 12, 0.5, 29, 41.4, 6, 22, 1, 35];
      const results = await Promise.all(peaks.map((p) => write("a", p)));
      const stored = await row("a");
      expect(stored?.peak_y).toBe(41.5);
      expect(stored?.attempts).toBe(peaks.length);
      expect(stored?.replay_token).toBe("tok-41.5");
      // Every returned best is a real stored value and none exceeds the max.
      for (const r of results) expect(peaks).toContain(r.peakY);
      expect(new Set(results.map((r) => r.attempts)).size).toBe(peaks.length);
    });

    it("concurrent submissions on an EXISTING row never lower it", async () => {
      await user("a");
      await write("a", 50);
      await Promise.all(Array.from({ length: 16 }, (_, i) => write("a", i)));
      expect(await row("a")).toMatchObject({ peak_y: 50, attempts: 17, replay_token: "tok-50" });
    });
  });

  describe("public board + standing", () => {
    it("filters consent at READ time: revoking hides an existing row", async () => {
      await user("a", CONSENTED, "Aria");
      await user("b", CONSENTED, "Bo");
      await user("c", null, "Ghost");
      await write("a", 10);
      await write("b", 20);
      await write("c", 99); // stored (written while hidden), never shown

      let board = await topDailyClimbers(DAY);
      expect(board.climbers.map((x) => [x.userId, x.rank, x.peakY])).toEqual([
        ["b", 1, 20],
        ["a", 2, 10],
      ]);
      expect(board.totalClimbers).toBe(2);
      expect(await dailyClimberCount(DAY)).toBe(2);
      expect(await dailyStandingFor("c", DAY)).toEqual({ rank: null, peakY: 99, attempts: 1 });

      await prisma.user.update({ where: { id: "b" }, data: { leaderboard_consent_at: null } });

      board = await topDailyClimbers(DAY);
      expect(board.climbers.map((x) => x.userId)).toEqual(["a"]);
      expect(board.totalClimbers).toBe(1);
      expect(await dailyStandingFor("b", DAY)).toEqual({ rank: null, peakY: 20, attempts: 1 });
      expect(await dailyStandingFor("a", DAY)).toEqual({ rank: 1, peakY: 10, attempts: 1 });
      // The row itself survives revocation (re-consenting restores it).
      expect((await row("b"))?.peak_y).toBe(20);
    });

    it("orders ties by who reached the height first, then by user id", async () => {
      for (const id of ["z", "m", "a"]) await user(id);
      await write("z", 10);
      await new Promise((r) => setTimeout(r, 5));
      await write("m", 10);
      await write("a", 15);
      // Force an exact timestamp tie between m and a second user to hit the id tiebreak.
      await user("b");
      await write("b", 10);
      const m = await row("m");
      await prisma.dailyClimbScore.update({
        where: { daily_climb_user_day: { userId: "b", day: DAY } },
        data: { updated_at: m!.updated_at },
      });
      const board = await topDailyClimbers(DAY);
      expect(board.climbers.map((x) => x.userId)).toEqual(["a", "z", "b", "m"]);
      // Rank from the count query agrees with the list position for everyone.
      let checked = 0;
      for (const c of board.climbers) {
        expect((await dailyStandingFor(c.userId, DAY))?.rank).toBe(c.rank);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    it("caps the list at 50 and still ranks a player outside it", async () => {
      const ids = Array.from({ length: DAILY_BOARD_LIMIT + 5 }, (_, i) => `u${String(i).padStart(3, "0")}`);
      for (const id of ids) await user(id);
      // u000 highest ... u054 lowest.
      await Promise.all(ids.map((id, i) => write(id, 1000 - i)));
      const board = await topDailyClimbers(DAY);
      expect(board.climbers).toHaveLength(DAILY_BOARD_LIMIT);
      expect(board.totalClimbers).toBe(ids.length);
      expect(board.climbers.some((c) => c.userId === "u052")).toBe(false);
      expect(await dailyStandingFor("u052", DAY)).toEqual({ rank: 53, peakY: 948, attempts: 1 });
    });

    it("returns null standing for a player with no run that day", async () => {
      await user("a");
      await write("a", 3, { day: "2026-09-25" });
      expect(await dailyStandingFor("a", DAY)).toBeNull();
    });

    it("never exposes an email as the handle", async () => {
      await user("a", CONSENTED, null);
      await write("a", 3);
      const [only] = (await topDailyClimbers(DAY)).climbers;
      expect(only.handle).not.toContain("@");
    });
  });

  describe("friendsDailyLeaderboard", () => {
    it("is me plus accepted, consented friends, with hidden and not-climbed counts", async () => {
      await user("me", null); // the caller sees their own row even while hidden
      await user("f-climbed");
      await user("f-idle");
      await user("f-hidden", null);
      await user("f-pending");
      await user("stranger");
      const accepted = (sender_id: string, receiver_id: string) =>
        prisma.friendship.create({ data: { sender_id, receiver_id, status: "accepted" } });
      await accepted("me", "f-climbed");
      await accepted("f-idle", "me");
      await accepted("me", "f-hidden");
      await prisma.friendship.create({ data: { sender_id: "me", receiver_id: "f-pending", status: "pending" } });

      await write("me", 5);
      await write("f-climbed", 9);
      await write("f-hidden", 50);
      await write("f-pending", 60);
      await write("stranger", 70);
      await write("f-idle", 80, { day: "2026-09-25" }); // yesterday doesn't count

      const board = await friendsDailyLeaderboard("me", DAY);
      expect(board.climbers.map((c) => [c.userId, c.rank])).toEqual([
        ["f-climbed", 1],
        ["me", 2],
      ]);
      expect(board.hiddenCount).toBe(1);
      expect(board.notClimbedCount).toBe(1);
    });
  });
});
