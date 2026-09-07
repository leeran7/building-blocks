/**
 * POST /api/duel/[id]/join — Join an open duel as player2.
 *
 * Auth is optional (anonymous Firebase token accepted). Anonymous users get
 * a guest-id derived from their IP so they are loosely deduped.
 *
 * The seed is returned here for the first time so both players can load the
 * same tower. It is withheld from the GET /api/duel/[id] endpoint while the
 * duel is still pending (seed oracle prevention, R-5).
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { verifyIdToken } from "../../../../../src/lib/firebaseAdmin";
import { checkRateLimit, clientIp } from "../../../../../src/lib/rateLimit";
import { getDuel, joinDuel } from "../../../../../src/db/duel";

export const runtime = "nodejs";

const RATE_MAX = 30;
const RATE_WINDOW_SECONDS = 3600; // 1 hour

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth: optional — fall back to IP-based guest id
  let uid: string | null = null;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      // AC-23: Firebase anonymous users must not get persistent duel_stats rows.
      // Map them to the same guest:<ip> identity as unauthenticated users so the
      // guest: prefix filter in completeDuel/voidDuelForForfeit covers them.
      const isFirebaseAnon =
        decoded.firebase?.sign_in_provider === "anonymous";
      if (!isFirebaseAnon) {
        uid = decoded.uid;
      }
      // If anonymous, uid stays null and falls through to guest:<ip> below.
    } catch {
      // Invalid token — treat as guest
    }
  }

  const identifier = uid ?? `ip:${clientIp(request)}`;

  // Rate limit: 30/hour per uid-or-ip
  const rl = await checkRateLimit({
    namespace: "duel:join",
    identifier,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const duel = await getDuel(id);
  if (!duel) {
    return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (duel.status !== "pending") {
    return NextResponse.json(
      { error: "This duel is already in progress", code: "DUEL_NOT_PENDING" },
      { status: 409 }
    );
  }

  // Prevent self-join (only for authenticated users)
  if (uid && duel.player1_id === uid) {
    return NextResponse.json(
      { error: "You are already player1", code: "CANNOT_JOIN_OWN_DUEL" },
      { status: 409 }
    );
  }

  // Guests get an UNGUESSABLE server-issued token, not an IP-derived id. The
  // client must present this token on write paths (result, realtime token) to
  // prove it owns the guest slot — x-forwarded-for is client-spoofable on Vercel
  // (it appends rather than replaces), so an IP-based guest id would let an
  // attacker impersonate a guest participant and grief their match.
  const guestOrUid = uid ?? `guest:${nanoid(24)}`;
  const joinResult = await joinDuel(id, guestOrUid);

  // W-1: joinDuel acquires SELECT FOR UPDATE and re-checks status inside the
  // lock, so two concurrent requests cannot both win the PENDING check.
  if (joinResult.outcome === "already_joined") {
    return NextResponse.json(
      { error: "This duel is already in progress", code: "ALREADY_JOINED" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    id: duel.id,
    seed: duel.seed,
    categorySlug: duel.category_slug,
    // The server-resolved identity this player joined as (uid or guest:<ip>) —
    // the client must use this as its local id so slot detection and the Ably
    // clientId match the value stored on the duel row.
    youId: guestOrUid,
    player1DisplayName: duel.player1?.display_name ?? null,
    player2DisplayName: duel.player2?.display_name ?? null,
  });
}
