/**
 * Apple App Site Association (AASA) — served at
 * https://www.doomstack.lol/.well-known/apple-app-site-association
 *
 * iOS fetches this to verify Universal Links. When the Doomstack app is
 * installed, tapping a challenge link (/duel/:id) opens it directly in the
 * app's native race room; otherwise it falls through to the web page.
 *
 * A route handler (not a static file) is used so the content-type is exactly
 * `application/json` and served with NO file extension, as Apple requires.
 *
 * Set APPLE_APP_ID_PREFIX to the Apple Developer Team ID in the deploy env.
 * The full appID is `<TeamID>.<bundleID>`; the bundle id is `lol.doomstack.app`
 * (see capacitor.config.ts appId). Until the real Team ID is set this serves a
 * placeholder that will NOT verify.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Apple Developer Team ID (10 chars, e.g. "AB12CD34EF"). MUST be set in prod.
const TEAM_ID = process.env.APPLE_APP_ID_PREFIX ?? "TEAMID_PLACEHOLDER";
const BUNDLE_ID = "lol.doomstack.app";

export function GET() {
  if (TEAM_ID === "TEAMID_PLACEHOLDER") {
    // Fail loud: serving the placeholder means iOS Universal Links will NOT
    // verify and challenge links will open the browser instead of the app.
    console.warn(
      "[AASA] APPLE_APP_ID_PREFIX is unset — serving placeholder; Universal Links will not verify.",
    );
  }
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${TEAM_ID}.${BUNDLE_ID}`],
            // Only the challenge race links open in the app; everything else
            // stays on the web.
            components: [
              { "/": "/duel/*", comment: "1v1 challenge race links" },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "content-type": "application/json",
        // Apple caches the AASA aggressively via its CDN; keep our own cache
        // modest so a Team ID / path change propagates within a day.
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
