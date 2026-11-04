/**
 * GET /ads.txt — the IAB ads.txt that AdSense checks before it approves and
 * serves ads on doomstack.lol (web placement A, src/lib/ads/h5Ads.ts). It
 * names Doomstack's publisher id as a direct Google seller, and is served
 * whether or not ads are switched on, so AdSense can verify the site first.
 */

import { NextResponse } from "next/server";
import { DOOMSTACK_ADSENSE_CLIENT } from "../../src/lib/ads/h5Ads";

/** Google's fixed certification authority id for AdSense lines. */
const GOOGLE_TAG_ID = "f08c47fec0942fa0";

export function GET(): NextResponse {
  const publisher = DOOMSTACK_ADSENSE_CLIENT.replace(/^ca-/, "");
  return new NextResponse(`google.com, ${publisher}, DIRECT, ${GOOGLE_TAG_ID}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
