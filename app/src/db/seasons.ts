/**
 * Season database queries.
 * All operations are server-side only.
 */

import { prisma } from "./client";
import type { Season } from "@prisma/client";

/**
 * Get the currently active season.
 * Returns null if no active season exists.
 */
export async function getActiveSeason(): Promise<Season | null> {
  return prisma.season.findFirst({
    where: { is_active: true },
  });
}

/**
 * Get or create the active season.
 * Creates a new 90-day season if none exists.
 */
export async function getOrCreateActiveSeason(): Promise<Season> {
  const existing = await getActiveSeason();
  if (existing) return existing;

  const now = new Date();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + 90);

  try {
    return await prisma.season.create({
      data: {
        starts_at: now,
        ends_at: ends,
        is_active: true,
        views_k: 0,
      },
    });
  } catch (err: unknown) {
    // Concurrent request already created the season — fetch and return it
    const raceErr = err as { code?: string };
    if (raceErr?.code === "P2002") {
      const created = await getActiveSeason();
      if (created) return created;
    }
    throw err;
  }
}

/**
 * Increment views_k by 0.001 for the active season (1 qualified view = +0.001k).
 * DB transaction — atomic (NFR-V3).
 *
 * @returns new views_k value
 */
export async function incrementSeasonViews(): Promise<number> {
  // Single atomic UPDATE ... RETURNING eliminates TOCTOU race between
  // the increment and the subsequent read under concurrent traffic.
  const rows = await prisma.$queryRaw<{ views_k: number }[]>`
    UPDATE season_state
    SET views_k = views_k + 0.001
    WHERE is_active = true
    RETURNING views_k
  `;

  if (rows.length === 0) {
    throw new Error("No active season found for view credit");
  }

  return rows[0].views_k;
}

/**
 * Roll over the current season: deactivate it and create a new one.
 * Called by admin endpoint or automatic trigger.
 *
 * Per ADR in architecture: blocks are NOT modified on rollover.
 * New season = new season_id. Returning buyers create new block rows.
 */
export async function rolloverSeason(): Promise<Season> {
  return prisma.$transaction(async (tx) => {
    // Deactivate current season
    await tx.season.updateMany({
      where: { is_active: true },
      data: { is_active: false },
    });

    // Create new season
    const now = new Date();
    const ends = new Date(now);
    ends.setDate(ends.getDate() + 90);

    return tx.season.create({
      data: {
        starts_at: now,
        ends_at: ends,
        is_active: true,
        views_k: 0,
      },
    });
  });
}
