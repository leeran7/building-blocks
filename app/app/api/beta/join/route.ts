/**
 * POST /api/beta/join
 *
 * Opt the authenticated user into the native app beta. Stores their platform
 * preference on the users row and submits them to the TestFlight external group
 * via the App Store Connect API (if iOS or any).
 *
 * Request:
 *   Authorization: Bearer <firebase-id-token>
 *   Body: { platform: "ios" | "android" | "any" }
 *
 * Response 200:
 *   { joined: true } | { alreadyJoined: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { prisma } from "../../../../src/db/client";
import { joinBeta, markAppleTesterAdded } from "../../../../src/db/user";
import { addTesterToGroup } from "../../../../src/lib/appStoreConnect";

export const runtime = "nodejs";

const VALID_PLATFORMS = new Set(["ios", "android", "any"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Authentication failed", code: "UNAUTHORIZED" }, { status: 401 });
  }

  let platform: string;
  try {
    const body = (await request.json()) as { platform?: unknown };
    platform = typeof body.platform === "string" ? body.platform : "any";
    if (!VALID_PLATFORMS.has(platform)) platform = "any";
  } catch {
    platform = "any";
  }

  // Check if already joined
  const existing = await prisma.user.findUnique({
    where: { id: decoded.uid },
    select: { beta_waitlist_joined_at: true, email: true },
  });

  if (existing?.beta_waitlist_joined_at) {
    return NextResponse.json({ alreadyJoined: true });
  }

  await joinBeta(decoded.uid, platform);

  // Add to TestFlight external group for iOS/any (non-fatal if Apple API fails)
  if (platform !== "android") {
    const email = existing?.email ?? decoded.email ?? "";
    if (email) {
      const result = await addTesterToGroup(email);
      if (result.success) {
        await markAppleTesterAdded(decoded.uid).catch(() => null);
      } else {
        console.error("[POST /api/beta/join] ASC API failed:", result.error);
      }
    }
  }

  return NextResponse.json({ joined: true });
}
