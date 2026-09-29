/**
 * POST /api/shop/buy { avatarId } — buy a character or skin with gems.
 *
 * The price, whether it is for sale, and whether a skin's character is
 * unlocked are all decided server-side (buyCharacter, src/db/gems.ts) from the
 * catalogue and stored rows; the body names only what to buy. Buying does not
 * equip: the app saves it with PUT /api/settings { avatarId } afterwards.
 *
 * 200 { gems, ownedIds }
 * 400 UNKNOWN_ITEM | NOT_FOR_SALE
 * 402 INSUFFICIENT_GEMS { gems }
 * 409 OWNED | CHARACTER_REQUIRED
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../src/lib/api/withAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { parseAvatarId } from "../../../../src/lib/avatars";
import { buyCharacter, GemError, type GemErrorCode } from "../../../../src/db/gems";

export const runtime = "nodejs";

const STATUS: Record<GemErrorCode, number> = {
  UNKNOWN_ITEM: 400,
  NOT_FOR_SALE: 400,
  INSUFFICIENT_GEMS: 402,
  OWNED: 409,
  CHARACTER_REQUIRED: 409,
  NO_USER: 404,
};

export const POST = withAuth(async (request: NextRequest, uid: string) => {
  // Fails CLOSED: this path moves gems.
  const rl = await checkRateLimit({
    namespace: "shop:buy",
    identifier: uid,
    max: 30,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const avatarId =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? parseAvatarId((body as { avatarId?: unknown }).avatarId)
      : null;
  if (avatarId === null) {
    return NextResponse.json({ error: "That isn't in the Shop", code: "UNKNOWN_ITEM" }, { status: 400 });
  }

  try {
    return NextResponse.json(await buyCharacter(uid, avatarId));
  } catch (err) {
    if (err instanceof GemError) {
      return NextResponse.json(
        { error: err.message, code: err.code, ...(err.balance === null ? {} : { gems: err.balance }) },
        { status: STATUS[err.code] }
      );
    }
    console.error("[POST /api/shop/buy]", err);
    return NextResponse.json({ error: "Couldn't complete the purchase. Please try again." }, { status: 500 });
  }
});
