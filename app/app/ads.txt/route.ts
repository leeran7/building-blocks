/**
 * GET /ads.txt — the IAB ads.txt that AdSense requires before it serves ads
 * on doomstack.lol (web placement A, src/lib/ads/h5Ads.ts). Built from
 * NEXT_PUBLIC_ADSENSE_CLIENT; 404 while web ads are off.
 */

import { NextResponse } from "next/server";
import { parseAdsenseClient } from "../../src/lib/ads/h5Ads";

/** Google's fixed certification authority id for AdSense lines. */
const GOOGLE_TAG_ID = "f08c47fec0942fa0";

export function GET(): NextResponse {
  const client = parseAdsenseClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);
  if (!client) return new NextResponse("Not found", { status: 404 });
  const publisher = client.replace(/^ca-/, "");
  return new NextResponse(`google.com, ${publisher}, DIRECT, ${GOOGLE_TAG_ID}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
