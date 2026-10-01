/**
 * POST /api/gems/checkout { packId } — buy a gem pack with Stripe Checkout
 * (web, and native builds where App Store purchases are unavailable).
 *
 * The server prices the session from the pack table (src/lib/gemPacks.ts);
 * the body names only the pack. The webhook (metadata.type = "gem_pack")
 * re-reads the pack by id, checks the amount Stripe charged, and credits
 * idempotently on the session id.
 *
 * 200 { checkoutUrl }
 * 400 UNKNOWN_PACK
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../src/lib/api/withAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getStripe } from "../../../../src/api/stripe";
import { resolveBaseUrl } from "../../../../src/config/public";
import { formatGems } from "../../../../src/lib/avatars";
import { gemPackById } from "../../../../src/lib/gemPacks";

export const runtime = "nodejs";

/**
 * Stripe's product tax code for a gem pack: "Video Games - downloaded - non
 * subscription - with permanent rights". The account has Managed Payments on
 * (Stripe is merchant of record and handles sales tax/VAT), which refuses any
 * line item without an eligible digital-goods tax code. Gems never expire,
 * hence permanent rights.
 */
const GEM_PACK_TAX_CODE = "txcd_10201000";

export const POST = withAuth(async (request: NextRequest, uid: string) => {
  const rl = await checkRateLimit({
    namespace: "gems:checkout",
    identifier: uid,
    max: 20,
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
  const pack = gemPackById(typeof body === "object" && body !== null ? (body as { packId?: unknown }).packId : null);
  if (pack === null) {
    return NextResponse.json({ error: "Unknown gem pack", code: "UNKNOWN_PACK" }, { status: 400 });
  }

  try {
    const baseUrl = resolveBaseUrl();
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: uid,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: pack.usdCents,
            product_data: {
              name: `${formatGems(pack.gems)} Doomstack gems`,
              description: "Gems for characters, skins and lives in Doomstack. Non-refundable and not cashable.",
              tax_code: GEM_PACK_TAX_CODE,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { type: "gem_pack", user_id: uid, pack_id: pack.id },
      success_url: `${baseUrl}/?gems=1`,
      cancel_url: `${baseUrl}/?gems=0`,
    });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("[POST /api/gems/checkout]", err);
    return NextResponse.json({ error: "Could not start checkout", code: "INTERNAL_ERROR" }, { status: 500 });
  }
});
