/**
 * Season database queries.
 * All operations are server-side only.
 */

import { prisma } from "./client";
import type { Season } from "@prisma/client";

/**
 * Get the currently active season for a specific category.
 * Returns null if no active season exists for that category.
 */
export async function getActiveSeason(
  category: string = "tech"
): Promise<Season | null> {
  return prisma.season.findFirst({
    where: { is_active: true, category },
  });
}

/**
 * Get or create the active season for a category.
 * Creates a new 90-day season for that category if none exists.
 */
export async function getOrCreateActiveSeason(
  category: string = "tech"
): Promise<Season> {
  const existing = await getActiveSeason(category);
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
        category,
      },
    });
  } catch (err: unknown) {
    // Concurrent request already created the season — fetch and return it
    const raceErr = err as { code?: string };
    if (raceErr?.code === "P2002") {
      const created = await getActiveSeason(category);
      if (created) return created;
    }
    throw err;
  }
}

/**
 * Fetch all currently active seasons, keyed by category.
 * Used by the dashboard to get per-category inflation state in a single query.
 */
export async function getAllActiveSeasons(): Promise<Map<string, Season>> {
  const seasons = await prisma.season.findMany({
    where: { is_active: true },
  });
  return new Map(seasons.map((s) => [s.category, s]));
}

/**
 * Increment views_k by 0.001 for the active season of a specific category
 * (1 qualified view = +0.001k). DB transaction — atomic (NFR-V3).
 *
 * @param category - which category's season to increment
 * @returns new views_k value
 */
export async function incrementSeasonViews(
  category: string = "tech"
): Promise<number> {
  const rows = await prisma.$queryRaw<{ views_k: number }[]>`
    UPDATE season_state
    SET views_k = views_k + 0.001
    WHERE is_active = true AND category = ${category}
    RETURNING views_k
  `;

  if (rows.length === 0) {
    throw new Error(`No active season found for category ${category}`);
  }

  return rows[0].views_k;
}

/**
 * Roll over the current season for a category: deactivate it and create a new one.
 * Called by admin endpoint or automatic trigger.
 *
 * Per ADR in architecture: blocks are NOT modified on rollover.
 * New season = new season_id. Returning buyers create new block rows.
 */
export async function rolloverSeason(
  category: string = "tech"
): Promise<Season> {
  return prisma.$transaction(async (tx) => {
    await tx.season.updateMany({
      where: { is_active: true, category },
      data: { is_active: false },
    });

    const now = new Date();
    const ends = new Date(now);
    ends.setDate(ends.getDate() + 90);

    return tx.season.create({
      data: {
        starts_at: now,
        ends_at: ends,
        is_active: true,
        views_k: 0,
        category,
      },
    });
  });
}
