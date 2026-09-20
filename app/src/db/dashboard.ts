/**
 * Dashboard payload — the single producer of /dashboard's data.
 *
 * Both consumers call this: the /dashboard server component (request-time
 * render, so the page paints real content on the first frame) and
 * GET /api/dashboard (the client fallback when the firebaseToken cookie is
 * absent or expired, plus the mobile shell). Keeping one builder means a field
 * rename cannot silently diverge the two shapes — the only path that would
 * have caught it before was a runtime render of the fallback.
 *
 * `email` comes from the verified ID token (not the DB row) on both call
 * sites, so it is a parameter rather than another read here.
 */

import { prisma } from "./client";
import { getUserFreeClimbRecord, getUserClimbReplays } from "./climb";
import { getDuelStats, getRecentDuelsForUser } from "./duel";
import type { FreeClimbData } from "../components/Dashboard/FreeClimbCard";
import type { ClimbReplayItem } from "../components/Dashboard/ClimbReplaysSection";
import type { DuelRecordData } from "../components/Dashboard/DuelRecordCard";
import type { DuelReplayItem } from "../components/Dashboard/DuelReplaysSection";

/** Shape of GET /api/dashboard, and of /dashboard's server-resolved payload. */
export interface DashboardData {
  user: { id: string; email: string; username: string | null; betaJoined: boolean };
  freeClimb: FreeClimbData | null;
  replays: ClimbReplayItem[];
  duelStats: DuelRecordData | null;
  recentDuels?: DuelReplayItem[];
}

/**
 * Resolve one user's dashboard payload. Each read falls back independently, so
 * one failing section degrades to empty instead of failing the whole page.
 */
export async function buildDashboardPayload(
  uid: string,
  email: string
): Promise<DashboardData> {
  const [dbUser, freeClimb, replays, duelStats, recentDuels] = await Promise.all([
    prisma.user.findUnique({
      where: { id: uid },
      select: { username: true, beta_waitlist_joined_at: true },
    }),
    getUserFreeClimbRecord(uid).catch(() => null),
    getUserClimbReplays(uid).catch(() => []),
    getDuelStats(uid).catch(() => null),
    getRecentDuelsForUser(uid).catch(() => []),
  ]);

  return {
    user: {
      id: uid,
      email,
      username: dbUser?.username ?? null,
      betaJoined: dbUser?.beta_waitlist_joined_at != null,
    },
    freeClimb,
    replays,
    // Narrowed to the four counters DuelRecordCard reads — the raw row also
    // carries user_id and an updated_at Date neither consumer uses.
    duelStats: duelStats && {
      wins: duelStats.wins,
      losses: duelStats.losses,
      current_streak: duelStats.current_streak,
      best_streak: duelStats.best_streak,
    },
    recentDuels,
  };
}
