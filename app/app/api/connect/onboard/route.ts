import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../src/config/tournaments";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import {
  getOrCreateConnectAccount,
  createOnboardingLink,
} from "../../../../src/api/stripeConnect";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!TOURNAMENTS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const origin = new URL(request.url).origin;
    const accountId = await getOrCreateConnectAccount(uid);
    const url = await createOnboardingLink(
      accountId,
      `${origin}/account/payout?onboarded=true`,
      `${origin}/account/payout?refresh=true`
    );

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[POST /api/connect/onboard]", err);
    return NextResponse.json(
      { error: "Could not start payout setup. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
