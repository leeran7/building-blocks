/**
 * POST /api/gems/apple { jws } — settle an App Store gem-pack purchase.
 *
 * `jws` is the StoreKit 2 transaction's jwsRepresentation. It is verified
 * against Apple's root and checked for this app, a gem-pack product, this
 * account's appAccountToken, and no refund (checkAppleGemTransaction). The
 * credit is idempotent on the transaction id, so the app may post the same
 * transaction again (a retry after a dropped response) and get `duplicate`;
 * either `credited` or `duplicate` means the app should finish the
 * transaction with StoreKit.
 *
 * 200 { outcome: "credited" | "duplicate", gems, packId }
 * 400 { code: INVALID_SIGNATURE | WRONG_APP | UNKNOWN_PRODUCT | WRONG_ACCOUNT | REVOKED | BAD_QUANTITY | SANDBOX }
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../src/lib/api/withAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { checkAppleGemTransaction } from "../../../../src/api/appleIap";
import { creditGemPack } from "../../../../src/db/gems";

export const runtime = "nodejs";

/** Refusals the app should stop retrying: the transaction will never credit. */
const REFUSAL_MESSAGES = {
  INVALID_SIGNATURE: "That purchase couldn't be verified with the App Store",
  WRONG_APP: "That purchase is for a different app",
  UNKNOWN_PRODUCT: "That purchase isn't a gem pack",
  WRONG_ACCOUNT: "That purchase was made on a different account",
  REVOKED: "That purchase was refunded",
  BAD_QUANTITY: "Buy one pack at a time",
  SANDBOX: "Test purchases don't add gems to this account",
} as const;

export const POST = withAuth(async (request: NextRequest, uid: string) => {
  const rl = await checkRateLimit({
    namespace: "gems:apple",
    identifier: uid,
    max: 30,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const jws = typeof body === "object" && body !== null ? (body as { jws?: unknown }).jws : undefined;

  const check = checkAppleGemTransaction(jws, uid);
  if (!check.ok) {
    console.warn(
      JSON.stringify({ type: "apple_gem_refused", uid, refusal: check.refusal, transaction_id: check.transactionId })
    );
    return NextResponse.json({ error: REFUSAL_MESSAGES[check.refusal], code: check.refusal }, { status: 400 });
  }

  try {
    const result = await creditGemPack({
      userId: uid,
      provider: "apple",
      externalId: check.transaction.transactionId,
      pack: check.pack,
    });
    console.log(
      JSON.stringify({
        type: "apple_gem_pack",
        uid,
        transaction_id: check.transaction.transactionId,
        environment: check.transaction.environment ?? null,
        pack_id: check.pack.id,
        outcome: result.outcome,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json({ outcome: result.outcome, gems: result.balance, packId: check.pack.id });
  } catch (err) {
    console.error("[POST /api/gems/apple]", err);
    return NextResponse.json({ error: "Couldn't add your gems. Please try again." }, { status: 500 });
  }
});
