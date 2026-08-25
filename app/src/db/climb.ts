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

export interface ClimbResultInput {
  userId: string;
  categorySlug: string;
  peakY: number;
  finished: boolean;
  finishedTick: number | null;
  seed: string;
}

export interface ClimbRecordResult {
  /** The player's peak height after this run (>= their prior best). */
  peakY: number;
  /** True if this run set a new personal best for the category. */
  improved: boolean;
}

/**
 * Pure monotonic-peak decision (AC-30/AC-31): a record is only ever raised.
 * Extracted so the invariant is unit-testable without a database.
 */
export function nextPeak(priorBest: number, runPeak: number): ClimbRecordResult {
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

  return { peakY: newBest, improved };
}
