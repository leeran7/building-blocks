/**
 * Tower v3 "The Climb" — climb-record persistence.
 *
 * Records a run and updates the player's PERMANENT peak-height record for a
 * category. The record is MONOTONIC: peak_y is only ever raised, never lowered
 * (spec-next.md AC-30/AC-31), mirroring the leaderboard's "altitude is permanent"
 * invariant. Monotonicity is enforced here in application logic (and re-asserted
 * by tests) so no run can regress a record.
 */

import { prisma } from "./client";
import { climberHandle } from "../lib/handle";

export interface ClimbResultInput {
  userId: string;
  categorySlug: string;
  peakY: number;
  finished: boolean;
  finishedTick: number | null;
  seed: string;
}

export interface PeakDecision {
  /** The player's peak height after this run (>= their prior best). */
  peakY: number;
  /** True if this run set a new personal best for the category. */
  improved: boolean;
}

export interface ClimbRecordResult extends PeakDecision {
  /** The player's 1-based rank on the category leaderboard after this run. */
  rank: number;
  /** Total ranked climbers in the category. */
  totalClimbers: number;
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
 * Persist a run and upsert the monotonic peak-height record.
 *
 * @returns the record after applying the run (peak never decreases).
 */
export async function recordClimb(
  input: ClimbResultInput
): Promise<ClimbRecordResult> {
  const peakY = Math.max(0, input.peakY);

  // Always store the raw run (history / future audit).
  await prisma.climbRun.create({
    data: {
      userId: input.userId,
      category_slug: input.categorySlug,
      peak_y: peakY,
      finished: input.finished,
      finished_tick: input.finishedTick,
      seed: input.seed,
    },
  });

  const existing = await prisma.climbRecord.findUnique({
    where: {
      climb_record_user_category: {
        userId: input.userId,
        category_slug: input.categorySlug,
      },
    },
  });

  // AC-30/AC-31: monotonic — a higher run raises the record, a lower one never
  // lowers it. Decision is the pure nextPeak() so it is unit-tested in isolation.
  const { peakY: newBest, improved } = nextPeak(existing?.peak_y ?? 0, peakY);

  await prisma.climbRecord.upsert({
    where: {
      climb_record_user_category: {
        userId: input.userId,
        category_slug: input.categorySlug,
      },
    },
    create: {
      userId: input.userId,
      category_slug: input.categorySlug,
      peak_y: newBest,
      wins: input.finished ? 1 : 0,
    },
    update: {
      peak_y: newBest,
      ...(input.finished ? { wins: { increment: 1 } } : {}),
    },
  });

  // Rank on the category board: 1 + the number of players strictly above you.
  // (Ties share a rank.) Computed after the upsert so it reflects this run.
  const [above, totalClimbers] = await Promise.all([
    prisma.climbRecord.count({
      where: { category_slug: input.categorySlug, peak_y: { gt: newBest } },
    }),
    prisma.climbRecord.count({ where: { category_slug: input.categorySlug } }),
  ]);

  return { peakY: newBest, improved, rank: above + 1, totalClimbers };
}

export interface ClimberRank {
  rank: number;
  userId: string;
  /** Privacy-safe pseudonym (never the email). */
  handle: string;
  peakY: number;
  wins: number;
}

/**
 * The skill leaderboard for a category: the highest peak-height record per
 * player, ranked descending. Ties broken by who reached it first (earliest
 * updated_at). Uses the [category_slug, peak_y desc] index. Emails are never
 * returned — only a deterministic pseudonym.
 */
export async function topClimbers(
  categorySlug: string,
  limit = 50
): Promise<ClimberRank[]> {
  const rows = await prisma.climbRecord.findMany({
    where: { category_slug: categorySlug },
    orderBy: [{ peak_y: "desc" }, { updated_at: "asc" }],
    take: limit,
    select: { userId: true, peak_y: true, wins: true },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    handle: climberHandle(r.userId),
    peakY: r.peak_y,
    wins: r.wins,
  }));
}

/** Aggregate free-climb stats for the landing: distinct climbers + best peak. */
export async function getGlobalClimbStats(): Promise<{
  climberCount: number;
  topPeak: number | null;
}> {
  const rows = await prisma.$queryRaw<{ climbers: number; top: number | null }[]>`
    SELECT COUNT(DISTINCT "userId")::int AS climbers, MAX(peak_y) AS top FROM climb_records
  `;
  const row = rows[0] ?? { climbers: 0, top: null };
  return { climberCount: Number(row.climbers ?? 0), topPeak: row.top };
}

export interface GlobalClimberRank extends ClimberRank {
  /** The category this record was set in (for a label on the landing). */
  categorySlug: string;
}

/**
 * The best climbers across ALL stacks — highest peak-height records, ranked
 * descending (ties → earliest). Powers the free-climb leaderboard on the landing.
 */
export async function topClimbersGlobal(limit = 8): Promise<GlobalClimberRank[]> {
  const rows = await prisma.climbRecord.findMany({
    orderBy: [{ peak_y: "desc" }, { updated_at: "asc" }],
    take: limit,
    select: { userId: true, peak_y: true, wins: true, category_slug: true },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    handle: climberHandle(r.userId),
    peakY: r.peak_y,
    wins: r.wins,
    categorySlug: r.category_slug,
  }));
}
