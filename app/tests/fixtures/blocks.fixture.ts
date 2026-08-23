/**
 * 500-block fixture for renderer and integration tests.
 * Generates blocks at various altitudes with buried/amber states.
 */

import { computeGround, isBuried, isAmberEdge } from "../../src/engine/index";

export interface FixtureBlock {
  id: string;
  slug: string;
  url: string;
  display_name: string;
  altitude: number;
  spend_c: number;
  views_served: number;
  clicks: number;
  peak_rank: number | null;
  hidden_at: string | null;
  created_at: string;
  buried: boolean;
  amber_edge: boolean;
  rank: number;
}

/**
 * Generate 500 fixture blocks at a given V (views_k).
 * Altitude distribution: exponential decay from top to bottom.
 */
export function generateFixtureBlocks(
  V: number = 0,
  count: number = 500
): FixtureBlock[] {
  const ground = computeGround(V);

  // Generate altitudes: logarithmically distributed
  // Top block at 1000m, decreasing to near 0
  const blocks: FixtureBlock[] = [];

  for (let i = 0; i < count; i++) {
    // Exponential decay: altitude = maxAlt * exp(-k * i)
    const maxAlt = 1000;
    const k = Math.log(maxAlt) / count;
    const altitude = maxAlt * Math.exp(-k * i);

    const id = `fixture-block-${String(i).padStart(4, "0")}`;
    const displayName = `Block #${i + 1}`;
    const slug = `block-${i + 1}`;

    blocks.push({
      id,
      slug,
      url: `https://example${i + 1}.com`,
      display_name: displayName,
      altitude,
      spend_c: Math.floor(altitude * 100),
      views_served: Math.floor(Math.random() * 1000),
      clicks: Math.floor(Math.random() * 100),
      peak_rank: i < 10 ? i + 1 : null,
      hidden_at: null,
      created_at: new Date(Date.now() - i * 1000 * 60).toISOString(),
      buried: isBuried(altitude, V),
      amber_edge: isAmberEdge(altitude, V),
      rank: i + 1,
    });
  }

  return blocks;
}

/**
 * Generate fixture API response (matches GET /api/tower shape).
 */
export function generateFixtureTowerData(V: number = 0) {
  const { computeGrowth, computeRate, computeGround: getGround, priceTo } =
    require("../../src/engine/index");

  const growth = computeGrowth(V);
  const rate = computeRate(V);
  const ground = getGround(V);
  const blocks = generateFixtureBlocks(V);
  const rank1 = blocks[0];
  const cost_of_rank1_usd = rank1 ? priceTo(rank1.altitude, 0, V) : 5.0;

  return {
    season: {
      id: "fixture-season-1",
      views_k: V,
      starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    },
    engine: { growth, rate, ground },
    blocks,
    cost_of_rank1_usd,
  };
}
