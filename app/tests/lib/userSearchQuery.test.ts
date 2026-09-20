/**
 * app/src/lib/userSearchQuery.ts — the single "can this query find anybody?"
 * gate shared by the search route and both search UIs (web + mobile).
 *
 * Three things this file exists to prove, per the verifier dispatch that
 * flagged them as untested (software-engineer-2026-09-20T020500Z.json,
 * learnings[3]):
 *
 *  1. `searchFailureMessage` has three real callers (the route's 429 and both
 *     search UIs) and had zero direct tests.
 *  2. `isSearchableQuery(q) === (exactMatchFilter(q) !== null)` is the
 *     load-bearing equivalence behind the "pure extraction, client gate ==
 *     server gate" claim. It is definitionally true by the current
 *     implementation (isSearchableQuery is *literally* `exactMatchFilter(q)
 *     !== null`), so this suite locks that definition in place — if a future
 *     edit ever gives the two functions independent logic, this test still
 *     passes only if their behaviour actually agrees on every fixture below,
 *     not just by construction.
 *  3. The anti-enumeration invariant (no substring/partial match) holds on
 *     the extracted module directly, not only through the route's Prisma
 *     mock — `exactMatchFilter` never returns a filter for a prefix of a
 *     real value, and the filter it does return is always an equality
 *     (never `contains`) shape.
 */

import { describe, expect, it } from "vitest";
import {
  EMAIL_SHAPE,
  exactMatchFilter,
  isSearchableQuery,
  searchFailureMessage,
} from "../../src/lib/userSearchQuery";

describe("searchFailureMessage", () => {
  it("returns the rate-limit copy for 429", () => {
    expect(searchFailureMessage(429)).toBe("Too many searches. Try again in a little while.");
  });

  it("returns a generic server-error copy for 500", () => {
    expect(searchFailureMessage(500)).toBe("Could not search right now. Try again.");
  });

  it("returns a network-error copy for null (no response reached)", () => {
    expect(searchFailureMessage(null)).toBe("Network error. Try again.");
  });

  it("falls back to the generic copy for any other non-ok status (e.g. 401, 503)", () => {
    expect(searchFailureMessage(401)).toBe("Could not search right now. Try again.");
    expect(searchFailureMessage(503)).toBe("Could not search right now. Try again.");
  });

  it("the three messages are distinct, so a player can tell rate-limit from network from server error", () => {
    const messages = new Set([
      searchFailureMessage(429),
      searchFailureMessage(null),
      searchFailureMessage(500),
    ]);
    expect(messages.size).toBe(3);
  });
});

describe("isSearchableQuery agrees with exactMatchFilter on every fixture", () => {
  // Same fixture set tests/api/usersSearch.route.test.ts drives through the
  // route, plus the edge cases the dispatch called out explicitly, so the
  // client gate and the server gate are proven to agree — not just assumed
  // to, because they happen to call the same function today.
  const fixtures = [
    "", // empty
    "bob@example.com", // email-shaped, valid
    "BOB@EXAMPLE.COM", // email-shaped, mixed case
    "bob@example.co", // email-shaped but incomplete-looking (still matches EMAIL_SHAPE)
    "bobsmith", // username-shaped, valid
    "@BobSmith", // username-shaped, leading @, mixed case
    "bo", // too short (below USERNAME_MIN)
    "ab", // too short
    "has space", // malformed (contains a space)
    "bob@", // malformed / incomplete email
    "admin", // reserved word — shape-valid but rejected
    "-leading-dash", // malformed username (leading dash)
    "trailing-dash-", // malformed username (trailing dash)
    "a".repeat(31), // over USERNAME_MAX
  ];

  it.each(fixtures)("agrees for %j", (q) => {
    expect(isSearchableQuery(q)).toBe(exactMatchFilter(q) !== null);
  });

  it("is searchable for a valid username", () => {
    expect(isSearchableQuery("bobsmith")).toBe(true);
    expect(exactMatchFilter("bobsmith")).not.toBeNull();
  });

  it("is searchable for a complete email", () => {
    expect(isSearchableQuery("bob@example.com")).toBe(true);
    expect(exactMatchFilter("bob@example.com")).not.toBeNull();
  });

  it("is not searchable for a reserved word, even though it is shape-valid", () => {
    expect(isSearchableQuery("admin")).toBe(false);
    expect(exactMatchFilter("admin")).toBeNull();
  });

  it("is not searchable for too-short or malformed input", () => {
    for (const q of ["bo", "ab", "has space", "bob@", ""]) {
      expect(isSearchableQuery(q)).toBe(false);
      expect(exactMatchFilter(q)).toBeNull();
    }
  });
});

describe("exactMatchFilter — anti-enumeration invariant on the extracted module", () => {
  it("never matches a prefix of a real username as if it were a full match — it returns an equality filter, not a substring one", () => {
    const filter = exactMatchFilter("bobsmit"); // one char short of "bobsmith"
    // normalizeUsername accepts this shape (3-30 chars, valid charset), so the
    // filter IS an equality filter on the literal (truncated) string — proving
    // the mechanism is exact-equality, never `contains`, is what the DB-level
    // route test (usersSearch.route.test.ts) confirms never returns the real
    // "bobsmith" row for this input.
    expect(filter).toEqual({ username: "bobsmit" });
    expect(filter).not.toEqual({ username: "bobsmith" });
  });

  it("never emits a `contains` shape for a valid username", () => {
    const filter = exactMatchFilter("bobsmith");
    expect(filter).toEqual({ username: "bobsmith" });
    expect(filter && "contains" in (filter as Record<string, unknown>)).toBeFalsy();
  });

  it("never emits a `contains` shape for a valid email — only case-insensitive equality", () => {
    const filter = exactMatchFilter("Bob@Example.com");
    expect(filter).toEqual({ email: { equals: "Bob@Example.com", mode: "insensitive" } });
  });

  it("normalises a leading @ and case before building the username filter (so @BobSmith and bobsmith produce the identical filter)", () => {
    expect(exactMatchFilter("@BobSmith")).toEqual(exactMatchFilter("bobsmith"));
  });

  it("returns null (never touches a filter shape) for input that is neither a complete email nor a valid username", () => {
    for (const q of ["bo", "has space", "bob@", "-leading-dash", "admin"]) {
      expect(exactMatchFilter(q)).toBeNull();
    }
  });
});

describe("exactMatchFilter / isSearchableQuery — adversarial fixtures (per security-reviewer-2026-09-20T021500Z.json learnings)", () => {
  // Malformed, partial, and injection-shaped inputs that must never reach a
  // filter shape at all — proving the negative guard against real positive
  // fixtures of the strings it must reject, not just against empty input.
  const adversarial = [
    "bob%", // SQL LIKE wildcard
    "%", // bare wildcard
    "'; DROP TABLE users;--", // SQL injection shape
    '{"$ne":null}', // NoSQL-operator-shaped string
    "bob@example", // incomplete email (no TLD)
    "../../etc/passwd", // path traversal shape
    "admin", // reserved username
    "official", // reserved username
    "a".repeat(31), // over USERNAME_MAX
  ];

  it.each(adversarial)("rejects %j before it can become a filter", (q) => {
    expect(exactMatchFilter(q)).toBeNull();
    expect(isSearchableQuery(q)).toBe(false);
  });

  it("never emits a partial-match operator (contains/startsWith/endsWith/search) for any fixture, adversarial or valid", () => {
    const allFixtures = [...adversarial, "bobsmith", "bob@example.com", "@BobSmith"];
    for (const q of allFixtures) {
      const filter = exactMatchFilter(q);
      if (filter === null) continue;
      const serialized = JSON.stringify(filter);
      expect(serialized).not.toMatch(/contains|startsWith|endsWith|search/i);
    }
  });
});

describe("EMAIL_SHAPE — the DB-free shape pre-check", () => {
  it("accepts a plausible email shape", () => {
    expect(EMAIL_SHAPE.test("a@b.co")).toBe(true);
  });

  it("rejects a username-shaped (no @) query", () => {
    expect(EMAIL_SHAPE.test("bobsmith")).toBe(false);
  });

  it("rejects an incomplete email with no domain suffix", () => {
    expect(EMAIL_SHAPE.test("bob@")).toBe(false);
  });
});
