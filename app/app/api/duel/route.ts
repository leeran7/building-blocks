/**
 * POST /api/duel — Create a 1v1 duel challenge link.
 *
 * Trust boundary: seed is generated server-side and NEVER returned here
 * (R-5: seed oracle prevention). The seed is only revealed to player2 on join.
 *
 * Only one pending challenge per user is allowed; a 409 is returned if one
 * already exists so the client can surface the existing link instead of
 * creating a ghost row.
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { newRunSeed } from "../../../src/game/rng";
import { CATEGORY_BY_SLUG } from "../../../src/lib/categories";
import { createDuel, getDuelsByPlayer1 } from "../../../src/db/duel";
import { ensureUser } from "../../../src/db/user";
import { DuelStatus } from "@prisma/client";

export const runtime = "nodejs";

const RATE_MAX = 10;
const RATE_WINDOW_SECONDS = 3600; // 1 hour

interface Body {
  categorySlug?: unknown;
}

export async function POST(request: NextRequest) {
  // Auth: required
  let uid: string;
  let userEmail: string | undefined;
  let emailVerified: boolean | undefined;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
    userEmail = decoded.email;
    emailVerified = decoded.email_verified;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Ensure the user row exists in the DB — the duels table foreign-keys to
  // users(id), and auth/sync is fire-and-forget so it may not have run yet.
  if (userEmail) {
    await ensureUser({
      id: uid,
      email: userEmail,
      emailVerified: emailVerified ?? false,
    }).catch(() => {
      // Best-effort: if this fails, createDuel will fail too and surface a 500.
    });
  }

  // Rate limit: 10 per hour per uid
  const rl = await checkRateLimit({
    namespace: "duel:create",
    identifier: uid,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  // Parse + validate body
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const categorySlug =
    typeof body.categorySlug === "string" ? body.categorySlug.toLowerCase().trim() : null;

  if (!categorySlug) {
    return NextResponse.json(
      { error: "categorySlug is required", code: "MISSING_FIELD", field: "categorySlug" },
      { status: 400 }
    );
  }

  // Allow-list: reject slugs not in the curated set
  if (!Object.hasOwn(CATEGORY_BY_SLUG, categorySlug)) {
    return NextResponse.json(
      {
        error: "Unknown category",
        code: "INVALID_CATEGORY",
        field: "categorySlug",
      },
      { status: 400 }
    );
  }

  try {
    // Exactly one pending challenge per user (R: open-duel limit)
    const existing = await getDuelsByPlayer1(uid, DuelStatus.pending);
    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: "You have an open challenge",
          code: "DUEL_ALREADY_PENDING",
          existingId: existing[0].id,
        },
        { status: 409 }
      );
    }

    const id = nanoid(8);
    const seed = newRunSeed();

    await createDuel(uid, categorySlug, id, seed);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.BASE_URL ?? "";
    return NextResponse.json(
      { id, link: `${baseUrl}/duel/${id}` },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/duel] DB error:", err);
    return NextResponse.json(
      { error: "Could not create your challenge. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
