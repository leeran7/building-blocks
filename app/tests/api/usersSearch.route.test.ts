/**
 * GET /api/users/search — exact-match lookup by email OR username.
 *
 * The anti-enumeration property that must never regress: a partial/substring
 * query for a real user's email or username must never return that user, and
 * a query that isn't shaped like a complete email or a valid username must
 * never even reach the database. These tests drive the real route handler
 * (never re-implement the matching logic in the test) and a Prisma mock that
 * only "matches" on exact value equality, so a passing test proves the route
 * asks Prisma for an exact match rather than a `contains`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "me-1", email: "me@e.com", email_verified: true })),
}));

const REAL_USER = {
  id: "friend-1",
  email: "bob@example.com",
  username: "bobsmith",
  display_name: "Bob",
  avatar_id: "wolf" as string | null,
};

// Returns only the selected columns, like Prisma: a field the route forgets to
// select is absent from the row, so its mapping cannot pass by accident.
function pick(row: Record<string, unknown>, select: Record<string, boolean> | undefined) {
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([k]) => select[k] === true));
}

// Faithfully simulates the two Prisma string-filter shapes that matter here,
// so a route change from equality to `contains` is caught by an actual
// behavioral difference in this mock, not by an incidental shape mismatch.
function matches(value: string, filter: unknown): boolean {
  if (typeof filter === "string") return filter === value;
  if (filter && typeof filter === "object") {
    const f = filter as { equals?: string; contains?: string; mode?: string };
    const v = f.mode === "insensitive" ? value.toLowerCase() : value;
    if (f.equals !== undefined) {
      const q = f.mode === "insensitive" ? f.equals.toLowerCase() : f.equals;
      return v === q;
    }
    if (f.contains !== undefined) {
      const q = f.mode === "insensitive" ? f.contains.toLowerCase() : f.contains;
      return v.includes(q);
    }
  }
  return false;
}

const findFirst = vi.fn(
  async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    if (where.email !== undefined) {
      return matches(REAL_USER.email, where.email) ? pick(REAL_USER, select) : null;
    }
    if (where.username !== undefined) {
      return matches(REAL_USER.username, where.username) ? pick(REAL_USER, select) : null;
    }
    return null;
  }
);

vi.mock("../../src/db/client", () => ({
  prisma: { user: { findFirst: (...args: unknown[]) => findFirst(...(args as [never])) } },
}));

import { GET } from "../../app/api/users/search/route";
import { checkRateLimit } from "../../src/lib/rateLimit";

function search(q: string): Promise<Response> {
  return GET(
    new NextRequest(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`, {
      headers: { authorization: "Bearer t" },
    })
  );
}

describe("GET /api/users/search", () => {
  beforeEach(() => {
    findFirst.mockClear();
    vi.mocked(checkRateLimit).mockClear();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, degraded: false });
  });

  it("finds the user by exact, case-insensitive email", async () => {
    const res = await search("BOB@EXAMPLE.COM");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([
      { id: "friend-1", username: "bobsmith", displayName: "Bob", avatarId: "wolf" },
    ]);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("finds the user by exact, case-insensitive username (leading @ tolerated)", async () => {
    const res = await search("@BobSmith");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([
      { id: "friend-1", username: "bobsmith", displayName: "Bob", avatarId: "wolf" },
    ]);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not match a partial/substring email — never leaks a partial hit", async () => {
    const res = await search("bob@example.co");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    // The query reached the DB (it was a valid email shape) but the equality
    // filter correctly found nothing — proving no `contains` semantics.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not match a substring of a real username", async () => {
    const res = await search("bobsmit");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed/too-short input before ever touching the DB", async () => {
    for (const q of ["bo", "ab", "has space", "bob@", ""]) {
      findFirst.mockClear();
      const res = await search(q);
      const body = await res.json();
      expect(body.users).toEqual([]);
      expect(findFirst).not.toHaveBeenCalled();
    }
  });

  it("still applies the 60/hr fail-closed rate limit to a username-shaped query", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, degraded: false });
    const res = await search("bobsmith");
    expect(res.status).toBe(429);
    expect(findFirst).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "users:search", failMode: "closed", max: 60 })
    );
  });

  it.each(["retired-avatar", "__proto__", "WOLF"])(
    "returns avatarId null (never the raw column) for a non-catalogue avatar %j",
    async (stored) => {
      const prev = REAL_USER.avatar_id;
      REAL_USER.avatar_id = stored;
      try {
        const body = await (await search("bobsmith")).json();
        expect(body.users).toEqual([{ id: "friend-1", username: "bobsmith", displayName: "Bob", avatarId: null }]);
      } finally {
        REAL_USER.avatar_id = prev;
      }
    }
  );

  it("excludes the caller themself even on the username path", async () => {
    findFirst.mockImplementationOnce(async ({ where }) => {
      expect(where.id).toEqual({ not: "me-1" });
      return null;
    });
    await search("bobsmith");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
