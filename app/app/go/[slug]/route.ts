/**
 * GET /go/[slug] — tracked outbound redirect.
 *
 * The value a paid listing delivers is *clicks to its destination* (a website or
 * a creator's social profile). Outbound links route through here so each real
 * human click is counted (Block.clicks) before forwarding.
 *
 * Security: the redirect target is always the block's own stored `url` (set +
 * validated at creation), never a query param — so there is no open-redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBlockBySlug, incrementClicks } from "../../../src/db/blocks";
import { isBot } from "../../../src/views/botList";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;

  const block = await getBlockBySlug(slug);
  // 404 for missing OR hidden blocks. `getBlockBySlug` deliberately returns
  // hidden blocks for the permanent /b/[slug] record page, but the tracked
  // redirect must NOT forward to them: `hidden_at` is set on unpaid listings
  // and is the admin abuse-remediation switch (a scam/phishing url stays
  // reachable via /go otherwise). Slugs are low-entropy/guessable, so this
  // guard is load-bearing, not cosmetic.
  if (!block || block.hidden_at !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Count only real human clicks — mirror the view pipeline's bot filter so
  // crawlers/preview-unfurlers don't inflate the number. Non-blocking.
  if (!isBot(request.headers.get("user-agent"))) {
    incrementClicks(block.id).catch(() => {
      /* best-effort — a counter miss must never break the redirect */
    });
  }

  return NextResponse.redirect(block.url, 302);
}
