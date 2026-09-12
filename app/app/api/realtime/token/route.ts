/**
 * POST /api/realtime/token — Issue an Ably capability token.
 *
 * Auth is optional. The returned token is scoped to the single duel channel
 * with subscribe+publish+presence capabilities. The requesting user must be
 * player1 or player2 of the duel.
 *
 * AC-31: guest users (player2_id = "guest:<nanoid>") have no Firebase session
 * but still need an Ably token to play live. They present the unguessable token
 * issued at join, matched against the duel row (IP is never an identity — it is
 * client-spoofable). A lower rate limit applies to unauthenticated requests
 * (10/hour per IP vs 60 for authenticated).
 */

import { NextRequest, NextResponse } from "next/server";
import Ably from "ably";
import { verifyIdToken } from "../../../../src/lib/firebaseAdmin";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { getDuel } from "../../../../src/db/duel";

export const runtime = "nodejs";

// Module-level singleton — avoid re-parsing the REST client on every token
// renewal within the same serverless instance.
let ablyRest: Ably.Rest | null = null;
function getAblyRest(apiKey: string): Ably.Rest {
  if (!ablyRest) {
    ablyRest = new Ably.Rest(apiKey);
  }
  return ablyRest;
}

// Authenticated callers: 60/hour. Unauthenticated (guest) callers: 10/hour.
const AUTH_RATE_MAX = 60;
const GUEST_RATE_MAX = 10;
const RATE_WINDOW_SECONDS = 3600;

interface Body {
  duelId?: unknown;
  /** Opaque guest token from join (guest:<nanoid>) — proves guest-slot ownership. */
  guestId?: unknown;
}

export async function POST(request: NextRequest) {
  // Auth: optional — anonymous Firebase token accepted.
  let uid: string | null = null;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      // AC-23 consistency: Firebase anonymous users were mapped to guest:<ip> at
      // join time. Do not issue a token under their Firebase uid — treat as guest.
      const isFirebaseAnon =
        decoded.firebase?.sign_in_provider === "anonymous";
      if (!isFirebaseAnon) {
        uid = decoded.uid;
      }
    } catch {
      // Fall through — uid stays null, treated as guest below
    }
  }

  const ip = clientIp(request);
  // IP is a rate-limit bucket only — never an identity (spoofable via XFF).
  const rateMax = uid ? AUTH_RATE_MAX : GUEST_RATE_MAX;
  const rl = await checkRateLimit({
    namespace: "realtime:token",
    identifier: uid ?? `ip:${ip}`,
    max: rateMax,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const duelId = typeof body.duelId === "string" ? body.duelId.trim() : null;
  if (!duelId) {
    return NextResponse.json(
      { error: "duelId is required", code: "MISSING_FIELD", field: "duelId" },
      { status: 400 }
    );
  }

  try {
    const duel = await getDuel(duelId);
    if (!duel) {
      return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // AC-31: authenticated participants match by verified uid; guests by the
    // unguessable token issued at join (trusted only when there is no uid). The
    // Ably clientId is the matched identity, so it always equals a stored id.
    const submittedGuestId =
      typeof body.guestId === "string" && body.guestId.startsWith("guest:")
        ? body.guestId
        : null;

    let identity: string | null = null;
    if (uid !== null && (duel.player1_id === uid || duel.player2_id === uid)) {
      identity = uid;
    } else if (
      uid === null &&
      submittedGuestId !== null &&
      (duel.player1_id === submittedGuestId || duel.player2_id === submittedGuestId)
    ) {
      identity = submittedGuestId;
    }

    if (identity === null) {
      return NextResponse.json(
        { error: "Not a participant in this duel", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      console.error("[realtime/token] ABLY_API_KEY not configured");
      return NextResponse.json(
        { error: "Realtime connection is unavailable right now. Please try again shortly.", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }

    const ably = getAblyRest(apiKey);
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: identity,
      capability: { [`duel:${duelId}`]: ["subscribe", "publish", "presence"] },
    });

    return NextResponse.json(tokenRequest);
  } catch (err) {
    console.error("[POST /api/realtime/token]", err);
    return NextResponse.json(
      { error: "Could not connect to the realtime service. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
