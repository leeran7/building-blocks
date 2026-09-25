/**
 * DELETE /api/account/delete.
 *
 * 1. Leaderboard cache revalidation. The route deletes the user's climbRecord
 *    and duelStats rows and anonymizes display_name outright, so both
 *    topFreeClimbers and topDuelStats stop matching them at the DB level
 *    immediately. But each is cached for up to 60s (unstable_cache, time-based
 *    only) — without an on-demand revalidateTag call, a deleted account stays
 *    publicly visible on both leaderboards until that window rolls over.
 *
 * 2. Erasure completeness. The User row is anonymized, not deleted, so
 *    onDelete: Cascade never fires — every user-owned table must be purged
 *    explicitly. The drift guard derives the set of models holding a User FK
 *    from Prisma's runtime schema, so a newly added user-owned table fails
 *    here until someone decides whether it is purged or deliberately retained.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u@e.com", email_verified: true })),
  adminAuth: { deleteUser: vi.fn(async () => {}) },
}));

// Recording prisma: every delegate call (e.g. prisma.pushToken.deleteMany(args))
// is captured as { model, op, args }, so the tests observe what the real route
// does rather than restating its logic.
const { calls, revalidateTag } = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; op: string; args: unknown }>,
  revalidateTag: vi.fn(),
}));
vi.mock("../../src/db/client", () => {
  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_t, op) =>
          typeof op === "string"
            ? (args: unknown) => {
                calls.push({ model, op, args });
                return {};
              }
            : undefined,
      }
    );
  const prisma = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop !== "string" || prop === "then") return undefined;
        if (prop === "$transaction") return async () => {};
        return delegate(prop);
      },
    }
  );
  return { prisma };
});

vi.mock("next/cache", () => ({
  revalidateTag,
  // ../../src/db/climb and ../../src/db/duel (imported below for their cache
  // tag constants) each wrap a query in unstable_cache at module load — a
  // passthrough here keeps those imports side-effect-free for this test.
  unstable_cache: (fn: unknown) => fn,
}));

import { DELETE } from "../../app/api/account/delete/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../src/db/duel";

// User-owned models deliberately NOT purged on account deletion. Keyed by
// Prisma delegate name; the value is why the rows must survive.
const RETAINED: Record<string, string> = {
  duel: "stake/settlement history, shared with the opponent",
  tournamentEntry: "prize and Stripe payout records",
  creditPurchase: "Stripe purchase records (money-record retention)",
  walletLedger: "append-only money ledger",
};

function del(): Promise<Response> {
  return DELETE(
    new NextRequest("http://localhost/api/account/delete", {
      method: "DELETE",
      headers: { authorization: "Bearer t" },
    })
  );
}

function deleteManyArgs(model: string): unknown {
  return calls.find((c) => c.model === model && c.op === "deleteMany")?.args;
}

beforeEach(() => {
  calls.length = 0;
  revalidateTag.mockClear();
});

describe("DELETE /api/account/delete leaderboard revalidation", () => {
  it("revalidates both the climb and duel leaderboard tags after a successful delete", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, { expire: 60 });
    expect(revalidateTag).toHaveBeenCalledWith(DUEL_LEADERBOARD_CACHE_TAG, { expire: 60 });
  });
});

describe("DELETE /api/account/delete erasure completeness", () => {
  it("purges the user's push tokens, notifications, challenges and friendships", async () => {
    const res = await del();
    expect(res.status).toBe(200);

    expect(deleteManyArgs("pushToken")).toEqual({ where: { user_id: "u1" } });
    expect(deleteManyArgs("notification")).toEqual({ where: { user_id: "u1" } });
    // Both sides of a pairwise relation belong to the deleted user.
    expect(deleteManyArgs("challenge")).toEqual({
      where: { OR: [{ sender_id: "u1" }, { recipient_id: "u1" }] },
    });
    expect(deleteManyArgs("friendship")).toEqual({
      where: { OR: [{ sender_id: "u1" }, { receiver_id: "u1" }] },
    });
  });

  it("purges or explicitly retains every model that holds a User foreign key", async () => {
    await del();
    const purged = new Set(calls.filter((c) => c.op === "deleteMany").map((c) => c.model));

    const userOwned = Prisma.dmmf.datamodel.models
      .filter((m) =>
        m.fields.some((f) => f.type === "User" && (f.relationFromFields?.length ?? 0) > 0)
      )
      .map((m) => m.name[0].toLowerCase() + m.name.slice(1));
    expect(userOwned.length).toBeGreaterThan(0);

    const unaccounted = userOwned.filter((m) => !purged.has(m) && !Object.hasOwn(RETAINED, m));
    expect(unaccounted).toEqual([]);

    // Keep the allow-list honest: a retained model must not also be purged,
    // and every entry must still be a real user-owned model.
    for (const model of Object.keys(RETAINED)) {
      expect(purged.has(model)).toBe(false);
      expect(userOwned).toContain(model);
    }
  });
});
