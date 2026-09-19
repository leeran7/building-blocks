/**
 * topFreeClimbers is the actual public leaderboard read (GET
 * /api/climb/leaderboard). Guideline 5.1.2 requires that revoking consent
 * removes a player from the public listing, not just gates future writes —
 * a unit test of the write-time check alone would still show a stale
 * opted-out row here forever.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

interface FakeRow {
  userId: string;
  peak_y: number;
  wins: number;
  user: {
    display_name: string | null;
    username: string | null;
    leaderboard_consent_at: Date | null;
  };
}

// vi.mock factories are hoisted above top-level consts, so shared mock state
// has to be declared via vi.hoisted to be visible inside the factory below.
const { findMany } = vi.hoisted(() => {
  const rows: FakeRow[] = [
    {
      userId: "u-consented",
      peak_y: 500,
      wins: 3,
      user: { display_name: "Aria", username: "aria", leaderboard_consent_at: new Date("2026-01-01") },
    },
    {
      // Higher peak than the consented climber — proves exclusion isn't
      // incidentally hidden behind a low rank/limit, it's a real filter.
      userId: "u-opted-out",
      peak_y: 900,
      wins: 9,
      user: { display_name: "Ghost", username: null, leaderboard_consent_at: null },
    },
  ];

  const findMany = vi.fn(
    async ({ where }: { where: { category_slug: string; user?: { leaderboard_consent_at?: { not: null } } } }) => {
      const requiresConsent = where.user?.leaderboard_consent_at?.not === null;
      return rows
        .filter((r) => !requiresConsent || r.user.leaderboard_consent_at !== null)
        .sort((a, b) => b.peak_y - a.peak_y)
        .map((r) => ({
          userId: r.userId,
          peak_y: r.peak_y,
          wins: r.wins,
          user: { display_name: r.user.display_name, username: r.user.username },
        }));
    }
  );

  return { rows, findMany };
});

vi.mock("../../src/db/client", () => ({
  prisma: { climbRecord: { findMany } },
}));

import { topFreeClimbers } from "../../src/db/climb";

describe("topFreeClimbers", () => {
  it("excludes a climber who has not consented to appear on the public leaderboard", async () => {
    const result = await topFreeClimbers(50);
    expect(result.map((r) => r.userId)).not.toContain("u-opted-out");
    expect(result.map((r) => r.userId)).toContain("u-consented");
  });

  it("does not let a higher, opted-out peak claim rank 1 over a consented climber", async () => {
    const result = await topFreeClimbers(50);
    expect(result[0]).toMatchObject({ userId: "u-consented", rank: 1 });
  });

  it("queries with a where clause that actually gates on consent, not a no-op filter", async () => {
    await topFreeClimbers(50);
    const call = findMany.mock.calls.at(-1)![0] as { where: { user?: unknown } };
    expect(call.where.user).toEqual({ leaderboard_consent_at: { not: null } });
  });
});
