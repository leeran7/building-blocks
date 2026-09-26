/**
 * SEC-DC-16: a daily run's replay token must not reach the public creator
 * page (/c/[username]) while that day's board can still accept it. The
 * owner's dashboard keeps every token.
 *
 * Exercised through the real callers: getCreatorProfileByUsername (the only
 * producer of /c/[username]'s data) and buildDashboardPayload (the owner's
 * dashboard). Prisma is an in-memory stand-in holding climb_runs rows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRun {
  id: string;
  userId: string;
  peak_y: number;
  created_at: Date;
  replay_token: string | null;
  seed: string;
}

const runs: FakeRun[] = [];

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../../src/db/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { username?: string; id?: string } }) =>
        where.username === "climber" || where.id === "u1"
          ? { id: "u1", display_name: null, username: "climber", avatar_id: null, beta_waitlist_joined_at: null }
          : null,
      ),
    },
    climbRun: {
      findMany: vi.fn(async ({ where, take }: { where: { userId: string }; take: number }) =>
        runs
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, take),
      ),
    },
    climbRecord: { findUnique: vi.fn(async () => null) },
    savedSocialHandle: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("../../src/db/duel", () => ({
  getDuelStats: vi.fn(async () => null),
  getRecentDuelsForUser: vi.fn(async () => []),
}));

import { getCreatorProfileByUsername } from "../../src/db/creator";
import { buildDashboardPayload } from "../../src/db/dashboard";
import { DAILY_REPLAY_PUBLIC_DELAY_MS, isReplayTokenPublic } from "../../src/db/climb";
import { isDailySeedShape, MS_PER_DAY } from "../../src/lib/dailyDay";

const DAILY_SEED = `daily1-${"Ab3_-".repeat(4)}xy`;
const ENDLESS_SEED = "0f1e2d3c4b5a6978";
/** Saved mid-morning on 2026-09-26; the day started at 00:00 UTC. */
const DAILY_SAVED_AT = new Date("2026-09-26T08:00:00Z");
const DAY_START_MS = Date.parse("2026-09-26T00:00:00Z");

function addRun(id: string, seed: string, createdAt: Date, token: string | null = `tok-${id}`): void {
  runs.push({ id, userId: "u1", peak_y: 42, created_at: createdAt, replay_token: token, seed });
}

async function publicTokens(): Promise<Record<string, string | null>> {
  const profile = await getCreatorProfileByUsername("climber");
  expect(profile).not.toBeNull();
  return Object.fromEntries((profile?.replays ?? []).map((r) => [r.id, r.replayToken]));
}

async function ownerTokens(): Promise<Record<string, string | null>> {
  const payload = await buildDashboardPayload("u1", "u1@example.com");
  return Object.fromEntries(payload.replays.map((r) => [r.id, r.replayToken]));
}

describe("public creator replays hide open daily runs (SEC-DC-16)", () => {
  beforeEach(() => {
    runs.length = 0;
    vi.useFakeTimers({ toFake: ["Date"] });
    addRun("daily", DAILY_SEED, DAILY_SAVED_AT);
    addRun("endless", ENDLESS_SEED, DAILY_SAVED_AT);
  });

  it("preconditions: the fixture seeds are one daily, one not; the delay is 48 h", () => {
    expect(isDailySeedShape(DAILY_SEED)).toBe(true);
    expect(isDailySeedShape(ENDLESS_SEED)).toBe(false);
    expect(DAILY_REPLAY_PUBLIC_DELAY_MS).toBe(2 * MS_PER_DAY);
  });

  it("while the day's board is open, the daily token is hidden and the endless token shown", async () => {
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    expect(await publicTokens()).toEqual({ daily: null, endless: "tok-endless" });
  });

  it("still hidden in the next day's grace window and until 1 ms before the 48 h mark", async () => {
    vi.setSystemTime(new Date("2026-09-27T00:05:00Z"));
    expect((await publicTokens()).daily).toBeNull();
    vi.setSystemTime(DAY_START_MS + DAILY_REPLAY_PUBLIC_DELAY_MS - 1);
    expect((await publicTokens()).daily).toBeNull();
  });

  it("shown from 48 h after the saved day's UTC start", async () => {
    vi.setSystemTime(DAY_START_MS + DAILY_REPLAY_PUBLIC_DELAY_MS);
    expect(await publicTokens()).toEqual({ daily: "tok-daily", endless: "tok-endless" });
  });

  it("the delay counts from the day's start, not from created_at", async () => {
    // Saved one minute before midnight: its board closes 24h10m after the day
    // started, so 48 h from the day start is enough, and 48 h from created_at
    // is not required.
    runs.length = 0;
    addRun("late", DAILY_SEED, new Date("2026-09-26T23:59:00Z"));
    vi.setSystemTime(DAY_START_MS + DAILY_REPLAY_PUBLIC_DELAY_MS);
    expect((await publicTokens()).late).toBe("tok-late");
  });

  it("the run itself is still listed while its token is hidden", async () => {
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    const profile = await getCreatorProfileByUsername("climber");
    expect(profile?.replays.map((r) => r.id)).toEqual(["daily", "endless"]);
  });

  it("the owner's dashboard shows every token, daily included, while the board is open", async () => {
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    expect(await ownerTokens()).toEqual({ daily: "tok-daily", endless: "tok-endless" });
  });
});

describe("isReplayTokenPublic fails closed (SEC-DC-16)", () => {
  const openBoard = new Date("2026-09-26T12:00:00Z");
  const muchLater = new Date("2027-01-01T00:00:00Z");

  it("non-daily runs are always public", () => {
    expect(isReplayTokenPublic(ENDLESS_SEED, DAILY_SAVED_AT, openBoard)).toBe(true);
  });

  it("an undatable daily run stays hidden forever", () => {
    expect(isReplayTokenPublic(DAILY_SEED, new Date(Number.NaN), muchLater)).toBe(false);
  });

  it("a NaN clock hides it", () => {
    expect(isReplayTokenPublic(DAILY_SEED, DAILY_SAVED_AT, Number.NaN)).toBe(false);
  });

  it("a malformed seed carrying the daily prefix is treated as daily", () => {
    const malformed = "daily1-short";
    expect(isDailySeedShape(malformed)).toBe(false);
    expect(isReplayTokenPublic(malformed, DAILY_SAVED_AT, openBoard)).toBe(false);
    expect(isReplayTokenPublic(malformed, DAILY_SAVED_AT, muchLater)).toBe(true);
  });
});
