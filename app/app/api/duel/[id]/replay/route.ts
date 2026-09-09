/**
 * GET /api/duel/[id]/replay — Fetch decoded replay data for a completed duel.
 *
 * Public endpoint (no auth required) — the duel id is the access token.
 * Returns seed, category, both player logs, peaks, and winner.
 * Applies the same zip-bomb guards as the result route.
 */

import { NextRequest, NextResponse } from "next/server";
import zlib from "zlib";
import { getDuel } from "../../../../../src/db/duel";
import {
  unpackInputLog,
  MAX_REPLAY_TOKEN_LENGTH,
  MAX_SHARE_TICKS,
} from "../../../../../src/game/runReplay";
import type { PlayerInput } from "../../../../../src/game/types";

export const runtime = "nodejs";

function decodeReplay(b64: string): PlayerInput[] | null {
  if (b64.length > MAX_REPLAY_TOKEN_LENGTH) return null;
  try {
    const compressed = Buffer.from(b64, "base64");
    const raw = zlib.inflateSync(compressed, { maxOutputLength: MAX_SHARE_TICKS * 10 });
    const inputs = unpackInputLog(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    if (!Array.isArray(inputs) || inputs.length > MAX_SHARE_TICKS) return null;
    return inputs;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const duel = await getDuel(id).catch(() => null);
  if (!duel) {
    return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (duel.status !== "completed") {
    return NextResponse.json(
      { error: "Duel not completed", code: "NOT_COMPLETED" },
      { status: 409 }
    );
  }

  const log1 = duel.player1_replay ? decodeReplay(duel.player1_replay) : null;
  const log2 = duel.player2_replay ? decodeReplay(duel.player2_replay) : null;

  return NextResponse.json({
    seed: duel.seed,
    categorySlug: duel.category_slug,
    player1: duel.player1
      ? {
          id: duel.player1.id,
          displayName: duel.player1.display_name,
          peak: duel.player1_peak ?? null,
        }
      : null,
    player2: duel.player2
      ? {
          id: duel.player2.id,
          displayName: duel.player2.display_name,
          peak: duel.player2_peak ?? null,
        }
      : null,
    log1,
    log2,
    winnerId: duel.winner_id ?? null,
    tiebreakRule: duel.tiebreak_rule ?? null,
    forfeit: duel.forfeit ?? false,
  });
}
