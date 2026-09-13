/**
 * Android Digital Asset Links — served at
 * https://www.doomstack.lol/.well-known/assetlinks.json
 *
 * Android verifies this to grant the app the right to auto-open verified
 * https links (App Links). With it in place and the manifest's
 * android:autoVerify intent-filter, tapping a challenge link (/duel/:id) opens
 * the app directly when installed, and the browser otherwise.
 *
 * Set ANDROID_SHA256_FINGERPRINTS in the deploy env to a comma-separated list
 * of the app signing certificate SHA-256 fingerprints (upper-case hex, colon-
 * separated). Include BOTH the Play App Signing cert and your upload cert if
 * they differ. Get them via:
 *   keytool -list -v -keystore <keystore> -alias <alias>
 * or from Play Console → Setup → App signing. Until set, this serves a
 * placeholder that will NOT verify.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PACKAGE_NAME = "lol.doomstack.app";

function fingerprints(): string[] {
  const raw = process.env.ANDROID_SHA256_FINGERPRINTS;
  if (!raw) return ["SHA256_FINGERPRINT_PLACEHOLDER"];
  return raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

export function GET() {
  const prints = fingerprints();
  if (prints[0] === "SHA256_FINGERPRINT_PLACEHOLDER") {
    // Fail loud: without real fingerprints Android App Links won't verify and
    // challenge links will open the browser instead of the app.
    console.warn(
      "[assetlinks] ANDROID_SHA256_FINGERPRINTS is unset — serving placeholder; App Links will not verify.",
    );
  }
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: prints,
        },
      },
    ],
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
