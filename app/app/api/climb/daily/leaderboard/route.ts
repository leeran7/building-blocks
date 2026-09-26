/**
 * GET /api/climb/daily/leaderboard?day=YYYY-MM-DD
 *
 * Public: the top 50 consented climbers on one UTC day's tower, best verified
 * height first, ties to whoever reached it first. `day` is optional (default:
 * today by the server clock); when present it must be a real calendar date
 * no more than DAILY_BOARD_HISTORY_DAYS old and not in the future — anything
 * else is a 400, never a silent fallback to today.
 *
 * With a valid Bearer token the response also carries the caller's own
 * standing (`me`), computed outside the shared cache. A missing or invalid
 * token just omits it (me: null); reads never require auth.
 *
 * 200: { day, resetsAt, totalClimbers, climbers: DailyClimberRank[],
 *        me: { rank: number | null, peakY, attempts } | null }
 * 400: { error, code: INVALID_DAY | DAY_OUT_OF_RANGE }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../../../src/lib/firebaseAdmin";
import { dailyStandingFor, topDailyClimbers, type DailyStanding } from "../../../../../src/db/dailyClimb";
import { resolveBoardDay } from "../../../../../src/lib/dailyBoardDay";
import { nextUtcResetAt } from "../../../../../src/lib/dailyDay";
import { checkRateLimit, clientIp } from "../../../../../src/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const BOARD_RATE_MAX = 120;
const BOARD_RATE_WINDOW_SECONDS = 60;

async function callerUid(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  try {
    return (await verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const now = new Date();
  const resolved = resolveBoardDay(request.nextUrl.searchParams.get("day"), now);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: 400, headers: NO_STORE });
  }
  const { day } = resolved;

  const rl = await checkRateLimit({
    namespace: "leaderboard:daily",
    identifier: `ip:${clientIp(request)}`,
    max: BOARD_RATE_MAX,
    windowSeconds: BOARD_RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429, headers: NO_STORE });
  }

  try {
    const uid = await callerUid(request);
    const [board, me] = await Promise.all([
      topDailyClimbers(day),
      uid ? dailyStandingFor(uid, day) : Promise.resolve<DailyStanding | null>(null),
    ]);
    return NextResponse.json(
      {
        day,
        resetsAt: nextUtcResetAt(now).toISOString(),
        totalClimbers: board.totalClimbers,
        climbers: board.climbers,
        me,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("[GET /api/climb/daily/leaderboard]", err);
    return NextResponse.json(
      { error: "Could not load today's leaderboard.", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
