/**
 * GET /api/shop — the signed-in player's Shop state:
 *   { gems, ownedIds, appleAccountToken, webCheckout, adFree }
 *
 * `ownedIds` are the characters and skins bought with gems (catalogue ids).
 * `appleAccountToken` is the UUID the iOS app must pass as StoreKit's
 * appAccountToken when it buys a gem pack; POST /api/gems/apple refuses a
 * transaction bought under any other token. `webCheckout` lets the iOS Shop
 * also offer each pack at its web price through Stripe (US storefront only,
 * checked on device); `adFree` is true once the player has paid for any gem
 * pack, and turns interstitial ads off for them. IOS_WEB_CHECKOUT=off turns that off without an app
 * release, for example if App Review objects. Prices and packs are static
 * (src/lib/avatars.ts, src/lib/gemPacks.ts) and ship in the app bundle.
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../src/lib/api/withAuth";
import { hasBoughtGems, shopState } from "../../../src/db/gems";
import { appleAccountTokenFor } from "../../../src/api/appleIap";

export const runtime = "nodejs";

export const GET = withAuth(async (_request: NextRequest, uid: string) => {
  try {
    const [state, adFree] = await Promise.all([shopState(uid), hasBoughtGems(uid)]);
    return NextResponse.json({
      ...state,
      adFree,
      appleAccountToken: appleAccountTokenFor(uid),
      webCheckout: process.env.IOS_WEB_CHECKOUT !== "off",
    });
  } catch (err) {
    console.error("[GET /api/shop]", err);
    return NextResponse.json({ error: "Couldn't load the Shop. Please try again." }, { status: 500 });
  }
});
