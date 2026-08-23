/**
 * Season fixtures at various V values.
 * Used for engine and API tests.
 */

import { computeGrowth, computeRate, computeGround } from "../../src/engine/index";

export interface SeasonFixture {
  id: string;
  views_k: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  // Derived engine state
  growth: number;
  rate: number;
  ground: number;
}

export function makeSeasonFixture(
  views_k: number,
  isActive: boolean = true
): SeasonFixture {
  return {
    id: `season-v${views_k}`,
    views_k,
    starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: isActive,
    growth: computeGrowth(views_k),
    rate: computeRate(views_k),
    ground: computeGround(views_k),
  };
}

export const SEASON_AT_V0 = makeSeasonFixture(0);
export const SEASON_AT_V500 = makeSeasonFixture(500);
export const SEASON_AT_V1000 = makeSeasonFixture(1000);
export const SEASON_AT_V2000 = makeSeasonFixture(2000);
export const SEASON_AT_CAP = makeSeasonFixture(3000); // past cap
