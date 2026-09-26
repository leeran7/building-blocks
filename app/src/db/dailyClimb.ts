/**
 * Daily Climb leaderboard persistence.
 *
 * One row per (user, UTC day) holding the day's best SERVER-VERIFIED run. The
 * only writer is POST /api/climb/daily/result, which re-simulates the replay
 * (src/game/dailyVerify.ts) and passes the re-simulated peak here — nothing in
 * this module accepts a client-reported height.
 *
 * Ordering everywhere (board, rank, friends): peak_y DESC, then updated_at ASC
 * (who reached that height first), then userId ASC so the order is total and
 * a rank count agrees with the list position.
 */

import { unstable_cache } from "next/cache";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";

import { prisma } from "./client";
import { friendCircle, LEADERBOARD_CACHE_TAG } from "./climb";
import { climberDisplay } from "../lib/handle";
import { parseAvatarId } from "../lib/avatars";

/** Rows on the public daily board. */
export const DAILY_BOARD_LIMIT = 50;

/** Seconds the public board for a day may be served from cache. */
export const DAILY_BOARD_REVALIDATE_SECONDS = 30;

/** Cache tag for one day's public board; expired after every verified save. */
export function dailyLeaderboardTag(day: string): string {
  return `daily-leaderboard:${day}`;
}

export interface DailyScoreInput {
  userId: string;
  /** UTC day key, derived by the server from its own clock. */
  day: string;
  /** Server re-simulated peak. Never a client claim. */
  peakY: number;
  ticks: number;
  replayToken: string | null;
  simVersion: number;
}

export interface DailyScoreWrite {
  /** Best peak for the day after this run (never below the prior best). */
  peakY: number;
  /** True when this run set the day's best (first run of the day included). */
  improved: boolean;
  /** Verified runs submitted for the day, this one included. */
  attempts: number;
}

/**
 * Atomic upsert of the day's best. `peak_y = GREATEST(old, new)` and
 * `attempts + 1` happen inside one INSERT … ON CONFLICT, which takes the row
 * lock, so two concurrent runs can never lower the best or lose an attempt.
 * ticks / replay / sim_version / updated_at follow the best run only.
 *
 * `improved` compares against a statement-start snapshot, as recordClimb
 * does; under two simultaneous runs by one player it can be off for one of
 * them. That flag is cosmetic — the stored best is exact.
 */
export async function recordDailyClimb(input: DailyScoreInput): Promise<DailyScoreWrite> {
  const peakY = Math.max(0, input.peakY);
  const rows = await prisma.$queryRaw<{ peak_y: number; attempts: number; improved: boolean }[]>`
    WITH old AS (
      SELECT peak_y FROM daily_climb_scores
      WHERE "userId" = ${input.userId} AND day = ${input.day}
    )
    INSERT INTO daily_climb_scores
      (id, "userId", day, peak_y, ticks, replay_token, sim_version, attempts, created_at, updated_at)
    VALUES
      (${nanoid()}, ${input.userId}, ${input.day}, ${peakY}, ${input.ticks},
       ${input.replayToken}, ${input.simVersion}, 1, now(), now())
    ON CONFLICT ("userId", day) DO UPDATE SET
      attempts = daily_climb_scores.attempts + 1,
      peak_y = GREATEST(daily_climb_scores.peak_y, EXCLUDED.peak_y),
      ticks = CASE WHEN EXCLUDED.peak_y > daily_climb_scores.peak_y
        THEN EXCLUDED.ticks ELSE daily_climb_scores.ticks END,
      replay_token = CASE WHEN EXCLUDED.peak_y > daily_climb_scores.peak_y
        THEN EXCLUDED.replay_token ELSE daily_climb_scores.replay_token END,
      sim_version = CASE WHEN EXCLUDED.peak_y > daily_climb_scores.peak_y
        THEN EXCLUDED.sim_version ELSE daily_climb_scores.sim_version END,
      updated_at = CASE WHEN EXCLUDED.peak_y > daily_climb_scores.peak_y
        THEN now() ELSE daily_climb_scores.updated_at END
    RETURNING peak_y, attempts,
      (NOT EXISTS (SELECT 1 FROM old) OR peak_y > (SELECT peak_y FROM old)) AS improved
  `;
  const row = rows[0];
  return { peakY: row.peak_y, improved: row.improved, attempts: row.attempts };
}

/**
 * Claim a verified run's canonical input hash for `userId` on `day`, and
 * return the account that holds it. That is `userId` for a new run or the
 * same player resubmitting, and someone else for an exact or padded copy
 * (SEC-DC-2). A copy with one no-effect input changed has a new hash and is
 * not caught here (accepted residual; see dailyInputHash).
 *
 * One INSERT ... ON CONFLICT DO UPDATE, a no-op update so RETURNING yields
 * the existing row. Two accounts racing with the same token serialize on the
 * unique (day, input_hash) index: the first insert wins, and the second
 * waits for it to commit and then reads the winner.
 */
export async function claimDailyReplay(input: { userId: string; day: string; inputHash: string }): Promise<string> {
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    INSERT INTO daily_climb_replays (id, day, input_hash, "userId", created_at)
    VALUES (${nanoid()}, ${input.day}, ${input.inputHash}, ${input.userId}, now())
    ON CONFLICT (day, input_hash) DO UPDATE SET day = daily_climb_replays.day
    RETURNING "userId"
  `;
  return rows[0].userId;
}

/** Consent filter shared by every public daily read. */
const CONSENTED = { user: { leaderboard_consent_at: { not: null } } } as const;

export interface DailyClimberRank {
  rank: number;
  userId: string;
  /** Privacy-safe display name (never the email). */
  handle: string;
  username: string | null;
  peakY: number;
  attempts: number;
  avatarId: string | null;
}

export interface DailyBoard {
  climbers: DailyClimberRank[];
  /** Consented climbers with a verified run on this day. */
  totalClimbers: number;
}

const BOARD_ORDER: Prisma.DailyClimbScoreOrderByWithRelationInput[] = [
  { peak_y: "desc" },
  { updated_at: "asc" },
  { userId: "asc" },
];

const ROW_SELECT = {
  userId: true,
  peak_y: true,
  attempts: true,
  user: { select: { display_name: true, username: true, avatar_id: true } },
} as const;

type BoardRow = Prisma.DailyClimbScoreGetPayload<{ select: typeof ROW_SELECT }>;

function toRank(r: BoardRow, i: number): DailyClimberRank {
  return {
    rank: i + 1,
    userId: r.userId,
    handle: climberDisplay(r.userId, r.user.display_name, r.user.avatar_id),
    username: r.user.username,
    peakY: r.peak_y,
    attempts: r.attempts,
    avatarId: parseAvatarId(r.user.avatar_id),
  };
}

async function readDailyBoard(day: string): Promise<DailyBoard> {
  const [rows, totalClimbers] = await Promise.all([
    prisma.dailyClimbScore.findMany({
      // Consent filtered at READ time, so revoking consent removes a row that
      // was written while consented.
      where: { day, ...CONSENTED },
      orderBy: BOARD_ORDER,
      take: DAILY_BOARD_LIMIT,
      select: ROW_SELECT,
    }),
    prisma.dailyClimbScore.count({ where: { day, ...CONSENTED } }),
  ]);
  return { climbers: rows.map(toRank), totalClimbers };
}

/**
 * The public top-50 for one UTC day, cached per day for 30 s. Tagged with the
 * day (expired on every verified save for that day) and with the all-time
 * LEADERBOARD_CACHE_TAG, which consent / name / avatar changes and account
 * deletion already expire — so those take effect on the daily board at once.
 *
 * Cache cardinality is bounded by the route: only today and the previous
 * DAILY_BOARD_HISTORY_DAYS days are ever requested, and older entries age out
 * on their 30 s revalidate.
 */
export function topDailyClimbers(day: string): Promise<DailyBoard> {
  return unstable_cache(() => readDailyBoard(day), ["topDailyClimbers", day], {
    revalidate: DAILY_BOARD_REVALIDATE_SECONDS,
    tags: [dailyLeaderboardTag(day), LEADERBOARD_CACHE_TAG],
  })();
}

export interface DailyStanding {
  /** 1-based position on the consented board; null when the player is hidden. */
  rank: number | null;
  peakY: number;
  attempts: number;
}

/**
 * A player's own standing on a day, uncached (it is per user). Rank counts
 * consented rows strictly ahead in board order, so it matches the list. A
 * player who has revoked consent still sees their height, with rank null.
 */
export async function dailyStandingFor(userId: string, day: string): Promise<DailyStanding | null> {
  const mine = await prisma.dailyClimbScore.findUnique({
    where: { daily_climb_user_day: { userId, day } },
    select: {
      peak_y: true,
      attempts: true,
      updated_at: true,
      user: { select: { leaderboard_consent_at: true } },
    },
  });
  if (!mine) return null;
  if (mine.user.leaderboard_consent_at === null) {
    return { rank: null, peakY: mine.peak_y, attempts: mine.attempts };
  }
  const ahead = await prisma.dailyClimbScore.count({
    where: {
      day,
      ...CONSENTED,
      OR: [
        { peak_y: { gt: mine.peak_y } },
        { peak_y: mine.peak_y, updated_at: { lt: mine.updated_at } },
        { peak_y: mine.peak_y, updated_at: mine.updated_at, userId: { lt: userId } },
      ],
    },
  });
  return { rank: ahead + 1, peakY: mine.peak_y, attempts: mine.attempts };
}

/** Consented climbers on a day (uncached; used right after a save). */
export function dailyClimberCount(day: string): Promise<number> {
  return prisma.dailyClimbScore.count({ where: { day, ...CONSENTED } });
}

export interface FriendsDailyBoard {
  climbers: DailyClimberRank[];
  /** Accepted friends who have not consented to appear on leaderboards. */
  hiddenCount: number;
  /** Consented friends with no verified run on this day yet. */
  notClimbedCount: number;
}

/**
 * The caller plus their accepted, consented friends on one day, ranked like
 * the public board. Same friendship rules as the all-time friends board
 * (friendCircle). Uncached: keyed per user, so a cache would grow unbounded.
 */
export async function friendsDailyLeaderboard(userId: string, day: string): Promise<FriendsDailyBoard> {
  const { consentedIds, hiddenCount } = await friendCircle(userId);
  const rows = await prisma.dailyClimbScore.findMany({
    where: { day, userId: { in: [userId, ...consentedIds] } },
    orderBy: BOARD_ORDER,
    select: ROW_SELECT,
  });
  const climbed = new Set(rows.map((r) => r.userId));
  return {
    climbers: rows.map(toRank),
    hiddenCount,
    notClimbedCount: consentedIds.filter((id) => !climbed.has(id)).length,
  };
}
