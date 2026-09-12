/**
 * Tower v3 "The Climb" — climb-record persistence.
 *
 * Records a run and updates the player's PERMANENT peak-height record on the
 * single free stack leaderboard. The record is MONOTONIC: peak_y is only ever
 * raised, never lowered (spec-next.md AC-30/AC-31), mirroring the leaderboard's
 * "altitude is permanent" invariant.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { nanoid } from "nanoid";

import { prisma } from "./client";
import { climberDisplay } from "../lib/handle";
import { FREE_STACK_SLUG } from "../game/freeStack";

export interface ClimbResultInput {
  userId: string;
  /** Ignored for leaderboard placement — all records go to the free stack. */
  categorySlug?: string;
  peakY: number;
  finished: boolean;
  finishedTick: number | null;
  seed: string;
  /** Encoded deterministic replay for /play?r=… */
  replayToken?: string | null;
}

export interface PeakDecision {
  /** The player's peak height after this run (>= their prior best). */
  peakY: number;
  /** True if this run set a new personal best for the category. */
  improved: boolean;
}

export interface ClimbRecordResult extends PeakDecision {
  /** The player's 1-based rank on the free leaderboard after this run. */
  rank: number;
  /** Total ranked climbers on the free stack. */
  totalClimbers: number;
  /** The name to show for this climber (profile name, else pseudonym). */
  handle: string;
}

/**
 * Pure monotonic-peak decision (AC-30/AC-31): a record is only ever raised.
 * Extracted so the invariant is unit-testable without a database.
 */
export function nextPeak(priorBest: number, runPeak: number): PeakDecision {
  const clamped = Math.max(0, runPeak);
  const prior = Math.max(0, priorBest);
  const peakY = Math.max(prior, clamped);
  return { peakY, improved: peakY > prior };
}

/**
 * Persist a run and upsert the monotonic peak-height record on the free stack.
 *
 * @returns the record after applying the run (peak never decreases).
 */
export async function recordClimb(
  input: ClimbResultInput
): Promise<ClimbRecordResult> {
  const peakY = Math.max(0, input.peakY);
  const stackSlug = FREE_STACK_SLUG;
  const recordId = nanoid();
  const winsIncrement = input.finished ? 1 : 0;

  // Store the raw run and upsert the monotonic peak record in parallel.
  // The upsert uses GREATEST in a single round-trip, eliminating a prior
  // findUnique + separate upsert. A CTE captures the old peak_y so we can
  // derive the `improved` flag without an extra read.
  const [, upsertRows] = await Promise.all([
    prisma.climbRun.create({
      data: {
        userId: input.userId,
        category_slug: stackSlug,
        peak_y: peakY,
        finished: input.finished,
        finished_tick: input.finishedTick,
        seed: input.seed,
        replay_token: input.replayToken ?? null,
      },
    }),
    prisma.$queryRaw<{ peak_y: number; improved: boolean }[]>`
      WITH old AS (
        SELECT peak_y FROM climb_records
        WHERE "userId" = ${input.userId} AND category_slug = ${stackSlug}
      )
      INSERT INTO climb_records (id, "userId", category_slug, peak_y, wins, updated_at)
      VALUES (${recordId}, ${input.userId}, ${stackSlug}, ${peakY}, ${winsIncrement}, now())
      ON CONFLICT ("userId", category_slug)
      DO UPDATE SET
        peak_y = GREATEST(climb_records.peak_y, EXCLUDED.peak_y),
        wins = climb_records.wins + ${winsIncrement},
        updated_at = now()
      RETURNING peak_y, (peak_y > COALESCE((SELECT peak_y FROM old), 0)) as improved
    `,
  ]);

  const { peak_y: newBest, improved } = upsertRows[0];

  const [above, totalClimbers, player] = await Promise.all([
    prisma.climbRecord.count({
      where: { category_slug: stackSlug, peak_y: { gt: newBest } },
    }),
    prisma.climbRecord.count({ where: { category_slug: stackSlug } }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { display_name: true },
    }),
  ]);

  return {
    peakY: newBest,
    improved,
    rank: above + 1,
    totalClimbers,
    handle: climberDisplay(input.userId, player?.display_name),
  };
}

export interface ClimberRank {
  rank: number;
  userId: string;
  /** Privacy-safe pseudonym (never the email). */
  handle: string;
  /** Public creator username, when set — links the row to /c/[username]. */
  username: string | null;
  peakY: number;
  wins: number;
}

/**
 * The free-stack skill leaderboard: highest peak-height record per player,
 * ranked descending. Ties broken by who reached it first (earliest updated_at).
 *
 * Wrapped with `unstable_cache` (60 s revalidation) so concurrent API/RSC
 * callers share one DB round-trip per minute rather than one per request.
 */
export const topFreeClimbers = unstable_cache(
  async (limit: number = 50): Promise<ClimberRank[]> => {
    const rows = await prisma.climbRecord.findMany({
      where: { category_slug: FREE_STACK_SLUG },
      orderBy: [{ peak_y: "desc" }, { updated_at: "asc" }],
      take: limit,
      select: {
        userId: true,
        peak_y: true,
        wins: true,
        user: { select: { display_name: true, username: true } },
      },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      handle: climberDisplay(r.userId, r.user.display_name),
      username: r.user.username,
      peakY: r.peak_y,
      wins: r.wins,
    }));
  },
  ["topFreeClimbers"],
  { revalidate: 60 }
);


/** Aggregate free-climb stats for the landing: distinct climbers + best peak.
 *
 * Wrapped with React `cache()` so multiple RSC callers in the same render pass
 * (SocialProofStrip + HomePage) share a single DB round-trip per ISR
 * regeneration.
 */
export const getGlobalClimbStats = cache(async (): Promise<{
  climberCount: number;
  topPeak: number | null;
}> => {
  const rows = await prisma.$queryRaw<{ climbers: number; top: number | null }[]>`
    SELECT COUNT(*)::int AS climbers, MAX(peak_y) AS top
    FROM climb_records
    WHERE category_slug = ${FREE_STACK_SLUG}
  `;
  const row = rows[0] ?? { climbers: 0, top: null };
  return { climberCount: Number(row.climbers ?? 0), topPeak: row.top };
});

export interface UserFreeClimbRecord {
  peakY: number;
  rank: number;
  totalClimbers: number;
  wins: number;
  handle: string;
}

/** A signed-in user's standing on the free stack, or null if they haven't played. */
export async function getUserFreeClimbRecord(
  userId: string
): Promise<UserFreeClimbRecord | null> {
  const record = await prisma.climbRecord.findUnique({
    where: {
      climb_record_user_category: {
        userId,
        category_slug: FREE_STACK_SLUG,
      },
    },
    select: {
      peak_y: true,
      wins: true,
      user: { select: { display_name: true } },
    },
  });
  if (!record) return null;

  const [above, totalClimbers] = await Promise.all([
    prisma.climbRecord.count({
      where: {
        category_slug: FREE_STACK_SLUG,
        peak_y: { gt: record.peak_y },
      },
    }),
    prisma.climbRecord.count({ where: { category_slug: FREE_STACK_SLUG } }),
  ]);

  return {
    peakY: record.peak_y,
    rank: above + 1,
    totalClimbers,
    wins: record.wins,
    handle: climberDisplay(userId, record.user.display_name),
  };
}


export interface ClimbReplaySummary {
  id: string;
  peakY: number;
  createdAt: string;
  replayToken: string | null;
}

/** Recent climb runs for the dashboard, newest first. */
export async function getUserClimbReplays(
  userId: string,
  limit = 30
): Promise<ClimbReplaySummary[]> {
  const rows = await prisma.climbRun.findMany({
    where: { userId },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      peak_y: true,
      created_at: true,
      replay_token: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    peakY: r.peak_y,
    createdAt: r.created_at.toISOString(),
    replayToken: r.replay_token,
  }));
}
