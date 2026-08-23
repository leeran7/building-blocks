/**
 * POST /api/auth/sync
 *
 * Called by the client immediately after Firebase sign-in to upsert the User
 * row in the database. This is the only write path for User records.
 *
 * Rate limited via Redis to prevent abuse of the auth endpoint.
 *
 * Request:
 *   Authorization: Bearer <firebase-id-token>
 *
 * Response 200:
 *   { user: { id, email, emailVerified, createdAt } }
 *
 * Error responses follow { error: string, code: string } shape.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { prisma } from "../../../../src/db/client";
import { getRedis } from "../../../../src/lib/redis";

export const runtime = "nodejs";

// Rate limit: 20 requests per minute per UID to prevent hammering
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 20;

async function checkRateLimit(uid: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `rl:auth:sync:${uid}`;
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in window — set expiry
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count <= RATE_LIMIT_MAX;
  } catch (err) {
    // Redis unavailable — fail closed (W3: deny request rather than bypass rate limit)
    console.error("[POST /api/auth/sync] Rate limit check failed:", err);
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json(
      { error: "Authentication failed", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // Rate limit by verified UID (post-auth, so we know it's real)
  const allowed = await checkRateLimit(decoded.uid);
  if (!allowed) {
    console.warn(
      JSON.stringify({
        type: "rate_limit_hit",
        path: "/api/auth/sync",
        uid: decoded.uid,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  // Fail fast if token has no email (would create a uniqueness collision)
  if (!decoded.email) {
    return NextResponse.json(
      { error: "Firebase token has no email claim", code: "INVALID_TOKEN" },
      { status: 400 }
    );
  }

  try {
    // Upsert: create if not exists, update emailVerified on every sign-in
    const user = await prisma.user.upsert({
      where: { id: decoded.uid },
      create: {
        id: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified ?? false,
      },
      update: {
        emailVerified: decoded.email_verified ?? false,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    console.log(
      JSON.stringify({
        type: "auth_sync",
        method: "POST",
        path: "/api/auth/sync",
        status: 200,
        uid: decoded.uid,
        duration_ms: Date.now() - start,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({ user });
  } catch (error) {
    console.error("[POST /api/auth/sync] DB upsert failed:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
