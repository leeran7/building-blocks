/**
 * GET /api/shop — the signed-in player's Shop state:
 *   { gems, ownedIds, appleAccountToken }
 *
 * `ownedIds` are the characters and skins bought with gems (catalogue ids).
 * `appleAccountToken` is the UUID the iOS app must pass as StoreKit's
 * appAccountToken when it buys a gem pack; POST /api/gems/apple refuses a
 * transaction bought under any other token. Prices and packs are static
 * (src/lib/avatars.ts, src/lib/gemPacks.ts) and ship in the app bundle.
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../src/lib/api/withAuth";
import { shopState } from "../../../src/db/gems";
import { appleAccountTokenFor } from "../../../src/api/appleIap";

export const runtime = "nodejs";

export const GET = withAuth(async (_request: NextRequest, uid: string) => {
  try {
    const state = await shopState(uid);
    return NextResponse.json({ ...state, appleAccountToken: appleAccountTokenFor(uid) });
  } catch (err) {
    console.error("[GET /api/shop]", err);
    return NextResponse.json({ error: "Couldn't load the Shop. Please try again." }, { status: 500 });
  }
});
