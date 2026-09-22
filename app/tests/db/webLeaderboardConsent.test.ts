/**
 * grantWebLeaderboardConsent stamps web users into the public leaderboard on
 * sign-in (web has no iOS-style consent prompt). It MUST be monotonic: the
 * `where: { leaderboard_consent_at: null }` guard is what stops a returning
 * user's sign-in from re-stamping (and so resetting the grant time, or — once
 * a web opt-out exists — silently re-consenting a user who turned it off).
 *
 * The fake `updateMany` below honours that where-clause against a positive
 * fixture (a user who already consented) so the test fails if the guard is
 * dropped, rather than only when the function is renamed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeUser {
  id: string;
  leaderboard_consent_at: Date | null;
}

// vi.mock factories are hoisted; the store is a module-level const the factory
// closes over, reset per-test in beforeEach.
const store: { users: FakeUser[] } = { users: [] };

vi.mock("../../src/db/client", () => ({
  prisma: {
    user: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; leaderboard_consent_at: null };
          data: { leaderboard_consent_at: Date };
        }) => {
          let count = 0;
          for (const u of store.users) {
            const matchesId = u.id === where.id;
            // Honour the null guard exactly as Postgres would: only rows whose
            // consent is still null are eligible.
            const matchesGuard =
              where.leaderboard_consent_at === null
                ? u.leaderboard_consent_at === null
                : true;
            if (matchesId && matchesGuard) {
              u.leaderboard_consent_at = data.leaderboard_consent_at;
              count++;
            }
          }
          return { count };
        }
      ),
    },
  },
}));

import { grantWebLeaderboardConsent } from "../../src/db/user";

describe("grantWebLeaderboardConsent", () => {
  beforeEach(() => {
    store.users = [];
  });

  it("stamps consent for a web user who has none yet", async () => {
    store.users.push({ id: "u-new", leaderboard_consent_at: null });
    await grantWebLeaderboardConsent("u-new");
    expect(store.users[0].leaderboard_consent_at).toBeInstanceOf(Date);
  });

  it("does not overwrite an existing consent time on a returning sign-in", async () => {
    const original = new Date("2026-01-01T00:00:00.000Z");
    store.users.push({ id: "u-returning", leaderboard_consent_at: original });
    await grantWebLeaderboardConsent("u-returning");
    // Monotonic: the earliest grant time survives; the guard rejected the write.
    expect(store.users[0].leaderboard_consent_at).toBe(original);
  });

  it("only touches the target user", async () => {
    store.users.push(
      { id: "u-target", leaderboard_consent_at: null },
      { id: "u-other", leaderboard_consent_at: null }
    );
    await grantWebLeaderboardConsent("u-target");
    expect(store.users.find((u) => u.id === "u-target")!.leaderboard_consent_at).toBeInstanceOf(Date);
    expect(store.users.find((u) => u.id === "u-other")!.leaderboard_consent_at).toBeNull();
  });
});
