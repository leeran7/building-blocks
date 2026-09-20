/**
 * GET /api/users/search?q=<email|username> — Look up a user by their exact
 * email or their exact public username.
 *
 * Exact match only (never a partial/substring match) on BOTH fields: an email
 * is PII, and `contains`-style matching would let a caller enumerate other
 * users' full addresses (or handles) one character at a time. Finding someone
 * requires already knowing their complete email or complete username.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { normalizeUsername } from "../../../../src/lib/username";
import { prisma } from "../../../../src/db/client";

export const runtime = "nodejs";

const RATE_MAX = 60;
const RATE_WINDOW = 3600;

// Simple shape check — good enough to short-circuit obviously-incomplete
// input without hitting the DB. The real validation is the exact-match
// query itself: no shape of malformed input can ever match a real row.
const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

/**
 * The exact-match filter for a raw query, or null when the input is neither a
 * complete email nor a valid username (in which case we never touch the DB).
 *
 * Email is matched case-insensitively. Usernames are stored already normalised
 * (see `setUsername` in src/db/creator.ts, which only ever persists the output
 * of `normalizeUsername`), so normalising the query is what makes the username
 * lookup case-insensitive — `@Creator-1` and `creator-1` find the same row.
 */
function exactMatchFilter(
  q: string
): { email: { equals: string; mode: "insensitive" } } | { username: string } | null {
  if (EMAIL_SHAPE.test(q)) {
    return { email: { equals: q, mode: "insensitive" } };
  }
  const norm = normalizeUsername(q);
  if (norm.valid && norm.username) {
    return { username: norm.username };
  }
  return null;
}

export async function GET(request: NextRequest) {
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "users:search",
    identifier: uid,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const filter = exactMatchFilter(q);
  if (!filter) {
    return NextResponse.json({ users: [] });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        ...filter,
        id: { not: uid },
      },
      select: {
        id: true,
        username: true,
        display_name: true,
      },
    });

    return NextResponse.json({
      users: user
        ? [{ id: user.id, username: user.username, displayName: user.display_name }]
        : [],
    });
  } catch (err) {
    console.error("[GET /api/users/search] error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
