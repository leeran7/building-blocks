/**
 * GET /api/users/search?q=<query> — Search users by username or display name.
 *
 * Returns up to 10 matches. Only users with a username are searchable.
 * Rate-limited to prevent enumeration.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { prisma } from "../../../../src/db/client";

export const runtime = "nodejs";

const RATE_MAX = 60;
const RATE_WINDOW = 3600;

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
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        username: { not: null },
        id: { not: uid },
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { display_name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        username: true,
        display_name: true,
      },
      take: 10,
      orderBy: { username: "asc" },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
      })),
    });
  } catch (err) {
    console.error("[GET /api/users/search] error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
