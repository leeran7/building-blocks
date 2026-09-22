/**
 * POST /api/beta/join
 *
 * Opt the authenticated user into the native app beta. The beta is iOS-only, so
 * the join records the user and submits them to the TestFlight external group
 * via the App Store Connect API. No client-supplied platform is trusted.
 *
 * Request:
 *   Authorization: Bearer <firebase-id-token>
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Authentication failed", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Check if already joined
  const existing = await prisma.user.findUnique({
    where: { id: decoded.uid },
    select: { beta_waitlist_joined_at: true, email: true },
  });

  if (existing?.beta_waitlist_joined_at) {
    return NextResponse.json({ alreadyJoined: true });
  }

  // The beta is iOS-only; the platform is server-derived, never client-supplied.
  await joinBeta(decoded.uid, "ios");

  // Add to TestFlight external group (non-fatal if Apple API fails)
  const email = existing?.email ?? decoded.email ?? "";
  if (email) {
    const result = await addTesterToGroup(email);
    if (result.success) {
      await markAppleTesterAdded(decoded.uid).catch(() => null);
    } else {
      console.error("[POST /api/beta/join] ASC API failed:", result.error);
    }
  }

  return NextResponse.json({ joined: true });
}
