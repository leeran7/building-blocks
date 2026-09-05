/**
 * Block database queries.
 *
 * CRITICAL constraints enforced here:
 * - Sorted by altitude descending only (AC-17: spend_c must not appear in sort)
 * - altitude incremented additively (never set to computed value — ADR-7)
 * - No position/rank column (AC-20)
 * - Rank derived from array position in query results
 */

import { prisma } from "./client";
import type { Block, CreatorPlatform } from "@prisma/client";

/**
 * Get all visible blocks, ordered by altitude DESC.
 *
 * CRITICAL: sorted by altitude descending — not by spend_c, not by rank.
 * The blocks_rank_idx partial index is used for this query.
 */
export async function getRankedBlocks(category?: string): Promise<Block[]> {
  // CRITICAL: sorted by altitude descending. spend_c is never used as a sort key.
  return prisma.block.findMany({
    where: { hidden_at: null, ...(category ? { category } : {}) },
    orderBy: { altitude: "desc" },
  });
}

/**
 * Count visible (non-hidden) blocks per category slug, in one grouped query.
 * Powers the landing tower directory without N per-tower fetches.
 */
export async function getBlockCountsByCategory(): Promise<Record<string, number>> {
  const rows = await prisma.block.groupBy({
    by: ["category"],
    where: { hidden_at: null },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.category) out[r.category] = r._count._all;
  }
  return out;
}

/**
 * Get a single block by slug (for record pages).
 * Returns block regardless of burial or hidden state (AC-37).
 */
export async function getBlockBySlug(slug: string): Promise<Block | null> {
  return prisma.block.findUnique({
    where: { slug },
  });
}

/**
 * Get a single block by ID.
 */
export async function getBlockById(id: string): Promise<Block | null> {
  return prisma.block.findUnique({
    where: { id },
  });
}

/**
 * Find a user's existing entry (hidden OR visible) for a platform within a
 * season. Backs "one entry per stack, per user, per platform": the DB unique
 * index blocks_user_season_platform_key guarantees at most one such row, so
 * this returns it whether it's a paid (visible) entry or an unpaid (hidden)
 * one left by an earlier/abandoned checkout — the checkout flow then either
 * rejects a paid duplicate or reuses the unpaid one.
 */
export async function findUserSeasonPlatformBlock(
  userId: string,
  seasonId: string,
  platform: CreatorPlatform
): Promise<Block | null> {
  return prisma.block.findFirst({
    where: { userId, season_id: seasonId, platform },
  });
}

/**
 * Point an existing (unpaid, hidden) social block at a possibly-updated
 * destination — used when a creator re-runs checkout for a platform whose entry
 * they never paid for. Slug is permanent identity and is left unchanged.
 */
export async function retargetSocialBlock(
  id: string,
  data: { url: string; display_name: string; handle: string }
): Promise<Block> {
  return prisma.block.update({ where: { id }, data });
}

/**
 * Create a new block with altitude = 0, hidden by default.
 * Pass hidden_at: null only after payment is confirmed (webhook).
 */
export async function createBlock(data: {
  slug: string;
  url: string;
  display_name: string;
  owner_email: string;
  season_id: string;
  userId?: string;
  category?: string;
  hidden_at?: Date | null;
  /** Set when the listing points at a social account (native card). */
  platform?: CreatorPlatform;
  handle?: string;
}): Promise<Block> {
  return prisma.block.create({
    data: {
      ...data,
      altitude: 0,
      spend_c: 0,
      views_served: 0,
      clicks: 0,
    },
  });
}

/**
 * Set hidden_at on a block (admin hide action).
 * Only admin routes may call this.
 */
export async function hideBlock(id: string): Promise<Block> {
  return prisma.block.update({
    where: { id },
    data: { hidden_at: new Date() },
  });
}

/**
 * Update peak rank if the new rank is better (lower number = better rank).
 */
export async function updatePeakRank(
  id: string,
  newRank: number
): Promise<void> {
  // Only update if this is a better rank than currently stored
  await prisma.$executeRaw`
    UPDATE blocks
    SET peak_rank = ${newRank}
    WHERE id = ${id}
      AND (peak_rank IS NULL OR peak_rank > ${newRank})
  `;
}

/**
 * Increment views_served for a block — ONLY if not buried.
 * altitude must be >= computeGround(V) at time of call (AC-15).
 *
 * @param id - block ID
 * @param currentGround - current ground level (metres) to check burial
 */
export async function incrementViewsServed(
  id: string,
  currentGround: number
): Promise<void> {
  // Conditional update: only increment if block is above ground
  await prisma.$executeRaw`
    UPDATE blocks
    SET views_served = views_served + 1
    WHERE id = ${id}
      AND altitude >= ${currentGround}
      AND hidden_at IS NULL
  `;
}

/**
 * Increment click count for a block.
 */
export async function incrementClicks(id: string): Promise<void> {
  await prisma.block.update({
    where: { id },
    data: { clicks: { increment: 1 } },
  });
}

/** Sitemap generation never lists more than this many /b/[slug] URLs (single
 *  sitemap.xml file is capped at 50,000 URLs; blocks are never deleted and new
 *  ones are minted every season rollover, so this is a real ceiling, not a
 *  hypothetical one). Newest-first so the cap drops the least-relevant tail. */
const SITEMAP_BLOCK_LIMIT = 45_000;

/**
 * Slugs of visible (non-hidden) blocks, for sitemap generation only.
 * Capped and ordered newest-first — see SITEMAP_BLOCK_LIMIT.
 */
export async function getVisibleBlockSlugs(): Promise<Array<{ slug: string; created_at: Date }>> {
  return prisma.block.findMany({
    where: { hidden_at: null },
    select: { slug: true, created_at: true },
    orderBy: { created_at: "desc" },
    take: SITEMAP_BLOCK_LIMIT,
  });
}

/**
 * Get all seasons a block has appeared in (via slug across seasons).
 * Used for record page season history (AC-40).
 */
export async function getBlockSeasonHistory(
  slug: string
): Promise<Array<{ season_id: string; altitude: number; created_at: Date }>> {
  const blocks = await prisma.block.findMany({
    where: { slug },
    select: { season_id: true, altitude: true, created_at: true },
    orderBy: { created_at: "asc" },
  });
  return blocks;
}
