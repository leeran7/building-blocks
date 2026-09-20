/**
 * The single "can this query find anybody?" gate for user search, shared by the
 * route handler and both search UIs (web `src/components/Challenge/UserSearch`
 * and the Capacitor SPA's `mobile/src/components/challenge/UserSearchSection`,
 * which reaches this file through `@app/lib/userSearchQuery`).
 *
 * `GET /api/users/search` is exact-match only on email and username — an email
 * is PII and `contains`-style matching would let a caller enumerate addresses
 * (or handles) one character at a time. That makes the "is this input even
 * findable?" question identical on the client and the server, so it lives here
 * once: the clients use it to avoid burning a rate-limited request (60/hr) on a
 * half-typed query, and the route uses it to avoid touching the DB at all.
 *
 * Pure + deterministic (no DB, no Prisma import) so it is unit-testable and
 * safe to bundle into the mobile app.
 */

import { normalizeUsername } from "./username";

// Simple shape check — good enough to short-circuit obviously-incomplete input
// without hitting the DB. The real validation is the exact-match query itself:
// no shape of malformed input can ever match a real row.
export const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

/**
 * An exact-match `where` fragment for a raw query. Structural on purpose (no
 * `Prisma.UserWhereInput`) so the mobile bundle never pulls in the ORM types.
 */
export type UserSearchFilter =
  | { email: { equals: string; mode: "insensitive" } }
  | { username: string };

/**
 * The exact-match filter for a raw query, or null when the input is neither a
 * complete email nor a valid username (in which case we never touch the DB).
 *
 * Email is matched case-insensitively. Usernames are stored already normalised
 * (see `setUsername` in src/db/creator.ts, which only ever persists the output
 * of `normalizeUsername`), so normalising the query is what makes the username
 * lookup case-insensitive — `@Creator-1` and `creator-1` find the same row.
 */
export function exactMatchFilter(q: string): UserSearchFilter | null {
  if (EMAIL_SHAPE.test(q)) {
    return { email: { equals: q, mode: "insensitive" } };
  }
  const norm = normalizeUsername(q);
  // `valid` already implies `username` is set; the second check is what narrows
  // the optional field for the type system.
  if (norm.valid && norm.username) {
    return { username: norm.username };
  }
  return null;
}

/**
 * Does the input look like something the exact-match API could possibly find —
 * a complete email or a valid username? Exactly the server's gate, because it
 * *is* the server's gate.
 */
export function isSearchableQuery(q: string): boolean {
  return exactMatchFilter(q) !== null;
}

/** HTTP status returned by the search route when the caller is over budget. */
const STATUS_RATE_LIMITED = 429;

/**
 * User-facing copy for a failed search. Pass the response status, or null when
 * the request never completed (network/abort). Shared by both search UIs so the
 * two surfaces can never disagree about what a 429 means to the player.
 */
export function searchFailureMessage(status: number | null): string {
  if (status === null) return "Network error. Try again.";
  if (status === STATUS_RATE_LIMITED) {
    return "Too many searches. Try again in a little while.";
  }
  return "Could not search right now. Try again.";
}
