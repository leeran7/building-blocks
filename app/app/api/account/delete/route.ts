/**
 * DELETE /api/account/delete — permanently remove the signed-in user's account.
 *
 * Steps:
 * 1. Cancel any open/pending duels where this user is player1 (Restrict FK would
 *    otherwise block the user-row anonymization step).
 * 2. Anonymize PII in the users row: replace email with a tombstone address and
 *    clear the display name. The row is kept because completed duel records
 *    (financial history) still reference player1_id. Access is revoked by
 *    deleting the Firebase account in step 4.
 * 3. Clear the public creator username so the handle is freed immediately.
 * 4. Delete the Firebase account — all issued tokens for this UID become invalid
 *    and the client is signed out.
 *
 * Auth required (Firebase Bearer token). Rate-limited to 3 requests / hour per UID.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { adminAuth } from "../../../../src/lib/firebaseAdmin";
import { prisma } from "../../../../src/db/client";
import { clearUsername } from "../../../../src/db/creator";
import { checkRateLimit } from "../../../../src/lib/rateLimit";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tight rate limit — deletion is irreversible; the low cap prevents abuse.
  const rl = await checkRateLimit({
    namespace: "account_delete",
    identifier: uid,
    max: 3,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  try {
    // 1. Cancel open duels where this user is player1 (non-settled; Restrict FK).
    await prisma.duel.deleteMany({
      where: {
        player1_id: uid,
        status: { in: ["pending", "active"] },
      },
    });

    // 2. Anonymize PII. Email gets a deterministic tombstone so the unique
    //    constraint is preserved without leaking the original address.
    const tombstoneEmail = `deleted-${uid}@deleted.invalid`;
    await prisma.user.update({
      where: { id: uid },
      data: {
        email: tombstoneEmail,
        emailVerified: false,
        display_name: null,
        username: null,
        savedUrls: { deleteMany: {} },
        socialHandles: { deleteMany: {} },
      },
    });

    // 3. Free the public creator username so it can be claimed by another user.
    await clearUsername(uid).catch(() => {});

    // 4. Delete the Firebase account — all tokens for this UID become invalid.
    await adminAuth.deleteUser(uid);

    console.info(
      JSON.stringify({
        type: "account_deleted",
        uid,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/account/delete]", err);
    return NextResponse.json(
      { error: "Could not delete your account. Please try again or contact support." },
      { status: 500 }
    );
  }
}
