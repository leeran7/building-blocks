/**
 * DELETE /api/account/delete — erase the signed-in user's personal + gameplay
 * data, then revoke all access.
 *
 * Deletes everything that is personal or gameplay identity:
 *   - ClimbRun (run history), ClimbRecord (leaderboard peak scores),
 *   - DuelStats (win/loss record),
 *   - SavedUrl + SavedSocialHandle (creator-page links).
 *
 * Retains — deliberately — the financial/audit trail, because destroying it
 * would breach money-record retention obligations for a paid product:
 *   - CreditPurchase (Stripe purchase records),
 *   - WalletLedger (append-only money ledger),
 *   - Duel rows (stakes/settlement history; also shared with the opponent).
 *
 * Because those tables `onDelete: Cascade` off the user row, the row itself is
 * NOT hard-deleted — it is anonymized instead (tombstone email, null
 * display_name / username), so the financial FKs survive while all PII is gone.
 * Access is revoked by deleting the Firebase account (step 4), so the tombstone
 * row can never be signed into again. Duels are left untouched — no refund is
 * issued and no in-flight match is destroyed, so an opponent's stake is never
 * stranded.
 *
 * Steps 1–2 run in one transaction. Auth required (Firebase Bearer token).
 * Rate-limited to 3 requests / hour per UID.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { adminAuth } from "../../../../src/lib/firebaseAdmin";
import { prisma } from "../../../../src/db/client";
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
    const tombstoneEmail = `deleted-${uid}@deleted.invalid`;

    // 1. Delete all personal + gameplay records; 2. anonymize the retained row.
    //    One transaction so a mid-way failure can't leave a half-scrubbed account.
    await prisma.$transaction([
      prisma.climbRun.deleteMany({ where: { userId: uid } }),
      prisma.climbRecord.deleteMany({ where: { userId: uid } }),
      prisma.duelStats.deleteMany({ where: { user_id: uid } }),
      prisma.savedUrl.deleteMany({ where: { userId: uid } }),
      prisma.savedSocialHandle.deleteMany({ where: { userId: uid } }),
      prisma.user.updateMany({
        where: { id: uid },
        data: {
          email: tombstoneEmail,
          emailVerified: false,
          display_name: null,
          username: null,
        },
      }),
    ]);

    // Delete the Firebase account — all tokens for this UID become invalid, so
    // the anonymized row can never be accessed again. Tolerate an already-absent
    // account so the endpoint is idempotent.
    await adminAuth.deleteUser(uid).catch((err) => {
      if ((err as { code?: string })?.code !== "auth/user-not-found") throw err;
    });

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
