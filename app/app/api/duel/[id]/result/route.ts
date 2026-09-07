/**
 * POST /api/duel/[id]/result — Submit a replay and trigger re-simulation.
 *
 * TRUST BOUNDARY: winner_id is ONLY derived from simulateDuel() return value.
 * It is NEVER read from the request body. claimedOutcome === "forfeit" is the
 * ONLY body field that influences the winner, and only on the forfeit path where
 * the submitting player forfeits and the opponent wins.
 *
 * Normal path: both replays must arrive before simulation runs. The first
 * arrival returns 202 { status: "pending" }. The second arrival triggers
 * simulateDuel() and returns 200 with the outcome.
 *
 * Race safety: markPlayerSubmitted uses SELECT FOR UPDATE so two simultaneous
 * POSTs cannot both believe they are the "second" submission.
 */

import { NextRequest, NextResponse } from "next/server";
import zlib from "zlib";
import { verifyIdToken } from "../../../../../src/lib/firebaseAdmin";
import { checkRateLimit, clientIp } from "../../../../../src/lib/rateLimit";
import { simulateDuel } from "../../../../../src/game/simulation";
import {
  unpackInputLog,
  MAX_REPLAY_TOKEN_LENGTH,
  MAX_SHARE_TICKS,
} from "../../../../../src/game/runReplay";
import {
  getDuel,
  completeDuel,
  voidDuelForForfeit,
  markPlayerSubmitted,
  getDuelStats,
} from "../../../../../src/db/duel";

export const runtime = "nodejs";

// Per-match (not per-hour) rate limit. The key includes the duelId so limits
// are isolated per match.
const RATE_MAX = 5;
const RATE_WINDOW_SECONDS = 3600; // window long enough to cover a match

interface Body {
  seed?: unknown;
  inputLog?: unknown;
  claimedOutcome?: unknown;
}

type ClaimedOutcome = "win" | "loss" | "forfeit";

function isClaimedOutcome(v: unknown): v is ClaimedOutcome {
  return v === "win" || v === "loss" || v === "forfeit";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth: optional (anonymous Firebase token accepted)
  let uid: string | null = null;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      // Fall through to guest handling
    }
  }

  // Guest participants are stored as "guest:<ip>" (join route / token route).
  // A guest has no verified uid, so their identity for the participant check is
  // their IP-derived id — the same value the join route wrote to the duel row.
  const guestId = `guest:${clientIp(request)}`;
  const identifier = uid ?? `ip:${clientIp(request)}`;

  // Rate limit: 5 per match (keyed by duelId + uid-or-ip)
  const rl = await checkRateLimit({
    namespace: `duel:result:${id}`,
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

  // Parse body
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const submittedSeed = typeof body.seed === "string" ? body.seed : null;
  const inputLogB64 = typeof body.inputLog === "string" ? body.inputLog : null;
  const claimedOutcome = isClaimedOutcome(body.claimedOutcome) ? body.claimedOutcome : null;

  if (!submittedSeed || !inputLogB64 || !claimedOutcome) {
    return NextResponse.json(
      { error: "Missing required fields: seed, inputLog, claimedOutcome", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const duel = await getDuel(id);
  if (!duel) {
    return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Check user is participant — derive identity from the verified session (uid)
  // or, for a guest, the IP-derived "guest:<ip>" id stored at join time. Never
  // from the request body. The winner is still re-simulated server-side, so a
  // guest cannot forge an outcome by being allowed to submit.
  const isPlayer1 =
    (uid !== null && duel.player1_id === uid) || duel.player1_id === guestId;
  const isPlayer2 =
    (uid !== null && duel.player2_id === uid) || duel.player2_id === guestId;
  if (!isPlayer1 && !isPlayer2) {
    return NextResponse.json(
      { error: "Not a participant in this duel", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const slot: "player1" | "player2" = isPlayer1 ? "player1" : "player2";

  // Duplicate submission guard
  if (duel.status === "completed") {
    const alreadySubmitted =
      (slot === "player1" && duel.player1_submitted) ||
      (slot === "player2" && duel.player2_submitted);
    if (alreadySubmitted) {
      return NextResponse.json(
        { error: "Already submitted", code: "ALREADY_SUBMITTED" },
        { status: 409 }
      );
    }
  }

  // Seed integrity check (prevents replay injection for a different tower)
  if (submittedSeed !== duel.seed) {
    return NextResponse.json(
      { error: "Seed does not match this duel", code: "SEED_MISMATCH" },
      { status: 422 }
    );
  }

  // ── FORFEIT PATH ──────────────────────────────────────────────────────────
  // claimedOutcome is used ONLY to detect forfeit — not to set winner on normal path.
  if (claimedOutcome === "forfeit") {
    // The submitting player forfeits — their OPPONENT wins
    const winnerId = isPlayer1 ? duel.player2_id : duel.player1_id;
    if (!winnerId || !duel.player2_id) {
      return NextResponse.json(
        { error: "Cannot forfeit before opponent has joined", code: "OPPONENT_NOT_JOINED" },
        { status: 409 }
      );
    }

    // AC-20: voidDuelForForfeit atomically voids the duel AND upserts both
    // players' stats inside a single SELECT FOR UPDATE transaction so a crash
    // between them cannot leave stats inconsistent.
    // AC-23: player1Id/player2Id are passed so the function can skip any
    // "guest:" player (including Firebase anonymous users mapped to guest:<ip>
    // in the join route).
    const forfeitResult = await voidDuelForForfeit(id, {
      winnerId,
      forfeit: true,
      completedAt: new Date(),
      player1Id: duel.player1_id,
      player2Id: duel.player2_id,
    });

    if (forfeitResult.outcome === "already_resolved") {
      return NextResponse.json(
        { error: "Duel already resolved", code: "ALREADY_RESOLVED" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      status: "completed",
      winnerId,
      forfeit: true,
    });
  }

  // ── NORMAL PATH ───────────────────────────────────────────────────────────

  // FIX 1: Zip-bomb guard — cap raw base64 length before allocating a Buffer.
  if (inputLogB64.length > MAX_REPLAY_TOKEN_LENGTH) {
    return NextResponse.json({ error: "Replay token too large", code: "INVALID_REPLAY" }, { status: 400 });
  }

  // Decode replay: base64 → zlib inflate → unpack input bytes.
  // maxOutputLength prevents a crafted compressed stream from expanding beyond
  // MAX_SHARE_TICKS worth of packed input bytes (~1 byte per tick).
  let inputs: ReturnType<typeof unpackInputLog>;
  try {
    const compressed = Buffer.from(inputLogB64, "base64");
    const raw = zlib.inflateSync(compressed, { maxOutputLength: MAX_SHARE_TICKS * 10 });
    inputs = unpackInputLog(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
  } catch {
    return NextResponse.json(
      { error: "Invalid inputLog encoding", code: "INVALID_REPLAY" },
      { status: 400 }
    );
  }

  // FIX 1 (continued): Reject oversized arrays after unpacking.
  if (!Array.isArray(inputs) || inputs.length > MAX_SHARE_TICKS) {
    return NextResponse.json({ error: "Replay too long", code: "INVALID_REPLAY" }, { status: 400 });
  }

  // Mark this player's slot as submitted and store the replay (atomic with SELECT FOR UPDATE).
  // FIX 3: markPlayerSubmitted now detects duplicate submissions inside the
  // SELECT FOR UPDATE lock and returns alreadySubmitted: true without overwriting.
  const { bothSubmitted, alreadySubmitted } = await markPlayerSubmitted(id, slot, inputLogB64);

  if (alreadySubmitted) {
    return NextResponse.json(
      { error: "Replay already submitted for this slot", code: "ALREADY_SUBMITTED" },
      { status: 409 }
    );
  }

  if (!bothSubmitted) {
    // First submission — wait for opponent
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  // Both replays are in — fetch fresh duel state with both replays
  const freshDuel = await getDuel(id);
  if (!freshDuel) {
    return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Decode the other player's replay
  const otherReplayB64 =
    slot === "player1" ? freshDuel.player2_replay : freshDuel.player1_replay;

  if (!otherReplayB64 || !freshDuel.player2_id) {
    // Race condition or missing opponent — treat as still pending
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  // FIX 1: Apply the same zip-bomb guards to the opponent's stored replay.
  // The opponent's replay came from the DB but was originally submitted by an
  // attacker-controlled client, so it must be treated as hostile.
  if (otherReplayB64.length > MAX_REPLAY_TOKEN_LENGTH) {
    return NextResponse.json(
      { error: "Opponent replay token too large", code: "INVALID_REPLAY" },
      { status: 400 }
    );
  }

  let otherInputs: ReturnType<typeof unpackInputLog>;
  try {
    const compressed2 = Buffer.from(otherReplayB64, "base64");
    const raw2 = zlib.inflateSync(compressed2, { maxOutputLength: MAX_SHARE_TICKS * 10 });
    otherInputs = unpackInputLog(new Uint8Array(raw2.buffer, raw2.byteOffset, raw2.byteLength));
  } catch {
    return NextResponse.json(
      { error: "Opponent replay corrupt", code: "INVALID_REPLAY" },
      { status: 400 }
    );
  }

  if (!Array.isArray(otherInputs) || otherInputs.length > MAX_SHARE_TICKS) {
    return NextResponse.json(
      { error: "Opponent replay too long", code: "INVALID_REPLAY" },
      { status: 400 }
    );
  }

  const log1 = slot === "player1" ? inputs : otherInputs;
  const log2 = slot === "player2" ? inputs : otherInputs;

  // ── Re-simulation (the trust anchor) ─────────────────────────────────────
  // winner_id is ONLY derived from simulateDuel() — never from body
  const result = simulateDuel(
    freshDuel.seed,
    freshDuel.category_slug,
    freshDuel.player1_id,
    freshDuel.player2_id,
    log1,
    log2
  );

  if (result.player1CheatFlagged || result.player2CheatFlagged) {
    return NextResponse.json(
      { error: "Cheat flagged by server re-simulation", code: "CHEAT_FLAGGED" },
      { status: 422 }
    );
  }

  if (result.winnerId === null) {
    return NextResponse.json(
      { error: "Simulation produced no winner", code: "SIM_NO_WINNER" },
      { status: 422 }
    );
  }

  // completeDuel re-checks status inside SELECT FOR UPDATE and upserts stats
  // atomically in the same transaction (SEC-1, SEC-2, C-1).
  const completeResult = await completeDuel(id, {
    winnerId: result.winnerId,
    player1Peak: result.player1Peak,
    player2Peak: result.player2Peak,
    player1Replay: freshDuel.player1_replay,
    player2Replay: freshDuel.player2_replay,
    tiebreakRule: result.tiebreakRule,
    player1Id: freshDuel.player1_id,
    player2Id: freshDuel.player2_id,
  });

  if (completeResult.outcome === "already_resolved") {
    return NextResponse.json(
      { error: "Duel already resolved", code: "ALREADY_RESOLVED" },
      { status: 409 }
    );
  }

  // Fetch the requesting player's updated stats
  const myStats = uid ? await getDuelStats(uid) : null;

  return NextResponse.json({
    status: "completed",
    winnerId: result.winnerId,
    player1Peak: result.player1Peak,
    player2Peak: result.player2Peak,
    forfeit: false,
    tiebreakRule: result.tiebreakRule,
    myStats,
  });
}
