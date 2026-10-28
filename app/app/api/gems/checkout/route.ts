/**
 * POST /api/gems/checkout { packId, returnTo? } — buy a gem pack with Stripe
 * Checkout (web, and native builds where App Store purchases are unavailable).
 *
 * `returnTo: "play"` (the website's app at /play) brings the buyer back there;
 * anything else returns to the home page. The return URLs are built from the
 * configured site URL, never from the request.
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
import { checkoutReturnPath, gemPackById } from "../../../../src/lib/gemPacks";

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
  const fields = typeof body === "object" && body !== null ? (body as { packId?: unknown; returnTo?: unknown }) : null;
  const pack = gemPackById(fields?.packId ?? null);
  if (pack === null) {
    return NextResponse.json({ error: "Unknown gem pack", code: "UNKNOWN_PACK" }, { status: 400 });
  }

  try {
    const baseUrl = resolveBaseUrl();
    const returnPath = checkoutReturnPath(fields?.returnTo);
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
      success_url: `${baseUrl}${returnPath}?gems=1`,
      cancel_url: `${baseUrl}${returnPath}?gems=0`,
    });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("[POST /api/gems/checkout]", err);
    return NextResponse.json({ error: "Could not start checkout", code: "INTERNAL_ERROR" }, { status: 500 });
  }
});
