/**
 * GET /api/levels/season?season=1 — a live season's level manifest (design
 * §3d): the season spec and, per level, its seed revision, lava and pars.
 * With the engine's levelSpec(season, level, rev) the app rebuilds each
 * level exactly as the generator proved it.
 *
 * Public and cacheable: the manifest is committed to the repo and holds no
 * player data. Only a season that is live (a level_seasons row whose
 * starts_at has passed) and has a sound manifest is served.
 *
 * 200:      SeasonManifest (src/game/levels/seasonGate.ts)
 * 400:      { error, code: INVALID_SEASON }
 * 404:      { error, code: SEASON_NOT_FOUND }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { activeLevelSeason } from "../../../../src/db/levels";
import { seasonManifest } from "../../../../src/levels/catalog";
import { parseSeasonId, reject } from "../../../../src/levels/http";
import { checkClimbIpRateLimit } from "../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

/** Short, so switching a season on or off shows up within minutes. */
const CACHE = { "Cache-Control": "public, max-age=300, s-maxage=300" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("season");
  const season = raw !== null && /^\d{1,5}$/.test(raw) ? parseSeasonId(Number(raw)) : null;
  if (season === null) return reject(400, "INVALID_SEASON", "Unknown season");

  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  let active: Awaited<ReturnType<typeof activeLevelSeason>>;
  try {
    active = await activeLevelSeason(season, new Date());
  } catch (err) {
    console.error("[levels/season] season lookup failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not load the season");
  }
  const manifest = active ? seasonManifest(season) : null;
  if (!manifest) return reject(404, "SEASON_NOT_FOUND", "That season is not available");
  return NextResponse.json(manifest, { status: 200, headers: CACHE });
}
