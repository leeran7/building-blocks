/**
 * friendsLeaderboard backs GET /api/climb/leaderboard/friends. Opted-out
 * friends must never be ranked (only counted), non-accepted friendships must
 * not leak a stranger onto the board, and the caller always sees themself.
 *
 * The prisma mock evaluates each query's `where` against in-memory tables, so
 * a dropped filter in production changes the returned rows, not just a call.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

interface FakeUser {
  id: string;
  display_name: string | null;
  username: string | null;
  leaderboard_consent_at: Date | null;
}
interface FakeFriendship {
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
}
interface FakeRecord {
  userId: string;
  category_slug: string;
  peak_y: number;
  wins: number;
  updated_at: Date;
}
interface InFilter {
  in: string[];
}

const db = vi.hoisted(() => ({
  users: [] as FakeUser[],
  friendships: [] as FakeFriendship[],
  records: [] as FakeRecord[],
}));

const { friendshipFindMany, userFindMany, climbRecordFindMany } = vi.hoisted(() => {
  const friendshipFindMany = vi.fn(
    async ({
      where,
    }: {
      where: { status?: string; OR?: Array<{ sender_id?: string; receiver_id?: string }> };
    }) =>
      db.friendships
        .filter((f) => where.status === undefined || f.status === where.status)
        .filter(
          (f) =>
            !where.OR ||
            where.OR.some(
              (c) =>
                (c.sender_id === undefined || c.sender_id === f.sender_id) &&
                (c.receiver_id === undefined || c.receiver_id === f.receiver_id)
            )
        )
        .map((f) => ({ sender_id: f.sender_id, receiver_id: f.receiver_id }))
  );

  const userFindMany = vi.fn(async ({ where }: { where: { id: InFilter } }) =>
    db.users
      .filter((u) => where.id.in.includes(u.id))
      .map((u) => ({ id: u.id, leaderboard_consent_at: u.leaderboard_consent_at }))
  );

  // Applies the query's own orderBy (insertion order when absent), so dropping
  // or reordering production's sort keys changes the ranks this returns.
  const compareBy =
    (orderBy: Array<Partial<Record<"peak_y" | "updated_at", "asc" | "desc">>>) =>
    (a: FakeRecord, b: FakeRecord): number => {
      for (const clause of orderBy) {
        for (const [field, dir] of Object.entries(clause) as Array<["peak_y" | "updated_at", "asc" | "desc"]>) {
          const av = field === "peak_y" ? a.peak_y : a.updated_at.getTime();
          const bv = field === "peak_y" ? b.peak_y : b.updated_at.getTime();
          if (av !== bv) return dir === "asc" ? av - bv : bv - av;
        }
      }
      return 0;
    };

  const climbRecordFindMany = vi.fn(
    async ({
      where,
      orderBy = [],
    }: {
      where: { category_slug: string; userId: InFilter; user?: { leaderboard_consent_at?: { not: null } } };
      orderBy?: Array<Partial<Record<"peak_y" | "updated_at", "asc" | "desc">>>;
    }) => {
      const requiresConsent = where.user?.leaderboard_consent_at?.not === null;
      const consented = (id: string) => db.users.find((u) => u.id === id)?.leaderboard_consent_at != null;
      return db.records
        .filter((r) => r.category_slug === where.category_slug && where.userId.in.includes(r.userId))
        .filter((r) => !requiresConsent || consented(r.userId))
        .sort(compareBy(orderBy))
        .map((r) => {
          const u = db.users.find((x) => x.id === r.userId)!;
          return {
            userId: r.userId,
            peak_y: r.peak_y,
            wins: r.wins,
            user: { display_name: u.display_name, username: u.username },
          };
        });
    }
  );

  return { friendshipFindMany, userFindMany, climbRecordFindMany };
});

vi.mock("../../src/db/client", () => ({
  prisma: {
    friendship: { findMany: friendshipFindMany },
    user: { findMany: userFindMany },
    climbRecord: { findMany: climbRecordFindMany },
  },
}));

import { friendsLeaderboard } from "../../src/db/climb";
import { FREE_STACK_SLUG } from "../../src/game/freeStack";

const CONSENTED = new Date("2026-01-01");

function user(id: string, consent: boolean, name: string | null = id): FakeUser {
  return { id, display_name: name, username: null, leaderboard_consent_at: consent ? CONSENTED : null };
}

function record(userId: string, peak_y: number, updatedAt = "2026-02-01", slug = FREE_STACK_SLUG): FakeRecord {
  return { userId, category_slug: slug, peak_y, wins: 0, updated_at: new Date(updatedAt) };
}

const accepted = (sender_id: string, receiver_id: string): FakeFriendship => ({
  sender_id,
  receiver_id,
  status: "accepted",
});

beforeEach(() => {
  db.users = [];
  db.friendships = [];
  db.records = [];
  vi.clearAllMocks();
});

describe("friendsLeaderboard", () => {
  it("ranks accepted friends from either side of the friendship, never pending or declined ones", async () => {
    db.users = [
      user("me", true),
      user("sent-by-me", true),
      user("sent-to-me", true),
      user("pending", true),
      user("declined", true),
      user("stranger", true),
    ];
    db.friendships = [
      accepted("me", "sent-by-me"),
      accepted("sent-to-me", "me"),
      { sender_id: "pending", receiver_id: "me", status: "pending" },
      { sender_id: "me", receiver_id: "declined", status: "declined" },
      accepted("stranger", "someone-else"),
    ];
    db.records = [
      record("me", 100),
      record("sent-by-me", 200),
      record("sent-to-me", 300),
      record("pending", 900),
      record("declined", 800),
      record("stranger", 700),
    ];

    const board = await friendsLeaderboard("me");

    expect(board.climbers.map((c) => c.userId)).toEqual(["sent-to-me", "sent-by-me", "me"]);
    expect(board).toMatchObject({ hiddenCount: 0, notClimbedCount: 0 });
  });

  it("excludes an opted-out friend with the highest peak and counts them as hidden", async () => {
    db.users = [user("me", true), user("ghost", false), user("aria", true)];
    db.friendships = [accepted("me", "ghost"), accepted("aria", "me")];
    db.records = [record("me", 100), record("ghost", 5000), record("aria", 400)];

    const board = await friendsLeaderboard("me");

    expect(board.climbers.map((c) => c.userId)).toEqual(["aria", "me"]);
    expect(board.climbers[0]).toMatchObject({ userId: "aria", rank: 1 });
    expect(board.hiddenCount).toBe(1);
  });

  it("includes the caller even when the caller opted out of the public board", async () => {
    db.users = [user("me", false), user("aria", true)];
    db.friendships = [accepted("me", "aria")];
    db.records = [record("me", 900), record("aria", 400)];

    const board = await friendsLeaderboard("me");

    expect(board.climbers.map((c) => c.userId)).toEqual(["me", "aria"]);
    expect(board.hiddenCount).toBe(0);
  });

  it("shows the caller alone when they have no friends yet", async () => {
    db.users = [user("me", true)];
    db.records = [record("me", 250)];

    const board = await friendsLeaderboard("me");

    expect(board).toEqual({
      climbers: [{ rank: 1, userId: "me", handle: "me", username: null, peakY: 250, wins: 0 }],
      hiddenCount: 0,
      notClimbedCount: 0,
    });
  });

  it("counts a consented friend with no free-stack record as not climbed, not hidden", async () => {
    db.users = [user("me", true), user("fresh", true), user("other-stack", true), user("ghost", false)];
    db.friendships = [accepted("me", "fresh"), accepted("me", "other-stack"), accepted("me", "ghost")];
    db.records = [record("me", 100), record("other-stack", 999, "2026-02-01", "some-other-stack")];

    const board = await friendsLeaderboard("me");

    expect(board.climbers.map((c) => c.userId)).toEqual(["me"]);
    expect(board).toMatchObject({ hiddenCount: 1, notClimbedCount: 2 });
  });

  it("ranks 1..n by peak, breaking ties by who reached the height first", async () => {
    db.users = [user("me", true), user("early", true), user("late", true), user("top", true)];
    db.friendships = [accepted("me", "early"), accepted("late", "me"), accepted("me", "top")];
    db.records = [
      record("late", 500, "2026-03-01"),
      record("me", 100),
      record("early", 500, "2026-01-15"),
      record("top", 800),
    ];

    const board = await friendsLeaderboard("me");

    expect(board.climbers.map((c) => [c.rank, c.userId])).toEqual([
      [1, "top"],
      [2, "early"],
      [3, "late"],
      [4, "me"],
    ]);
  });

  it("uses the display name for the handle and never exposes the consent timestamp", async () => {
    db.users = [user("me", true, "Golden Heron"), { ...user("aria", true), username: "aria" }];
    db.friendships = [accepted("me", "aria")];
    db.records = [record("me", 100), record("aria", 200)];

    const board = await friendsLeaderboard("me");

    expect(board.climbers[0]).toEqual({ rank: 1, userId: "aria", handle: "aria", username: "aria", peakY: 200, wins: 0 });
    expect(board.climbers[1].handle).toBe("Golden Heron");
    expect(JSON.stringify(board)).not.toContain("leaderboard_consent_at");
  });
});
