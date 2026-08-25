/**
 * Tower v3 "The Climb" — tower builder.
 *
 * Builds a playable TowerSpec for a category by skinning a reusable track
 * archetype (spec-next.md, Level/segment structure + R-7 mitigation: archetypes,
 * not 74 bespoke levels). The MVP (Phase 1) ships one themed solo tower; this
 * builder is what produces it and every future tower deterministically.
 */

import { TowerSpec } from "./types";
import {
  GameCategory,
  TrackArchetype,
  resolveGameCategory,
} from "./categories";

/** Physics + checkpoint tuning per archetype (all share the win = summit flag). */
const ARCHETYPE_TUNING: Record<
  TrackArchetype,
  Pick<TowerSpec, "maxClimbSpeed" | "moveSpeed" | "jumpSpeed" | "gravity" | "fallDeathMargin">
> = {
  "ladder-climb": {
    maxClimbSpeed: 7,
    moveSpeed: 5,
    jumpSpeed: 11,
    gravity: 22,
    fallDeathMargin: 24,
  },
  "platform-gauntlet": {
    maxClimbSpeed: 6,
    moveSpeed: 7,
    jumpSpeed: 13,
    gravity: 26,
    fallDeathMargin: 18,
  },
  "crumble-stairs": {
    maxClimbSpeed: 6,
    moveSpeed: 6,
    jumpSpeed: 12,
    gravity: 24,
    fallDeathMargin: 16,
  },
  "wall-jump-chimney": {
    maxClimbSpeed: 8,
    moveSpeed: 5,
    jumpSpeed: 12,
    gravity: 23,
    fallDeathMargin: 28,
  },
};

export interface BuildTowerOptions {
  /** Total climbable height in metres. */
  heightM?: number;
  /** Number of checkpoints (excluding the base at 0). */
  segments?: number;
}

/**
 * Build a TowerSpec for a category slug. Deterministic: same slug + options
 * always yields the same tower, which the simulation needs for re-sim (AC-11).
 */
export function buildTower(
  slugOrCategory: string | GameCategory,
  opts: BuildTowerOptions = {}
): TowerSpec {
  const category =
    typeof slugOrCategory === "string"
      ? resolveGameCategory(slugOrCategory)
      : slugOrCategory;

  const heightM = opts.heightM ?? 300;
  const segments = opts.segments ?? 6;
  const tuning = ARCHETYPE_TUNING[category.themeArchetype];

  // Evenly spaced checkpoints from base (0) up to just below the summit.
  const checkpoints: number[] = [];
  for (let i = 0; i < segments; i++) {
    checkpoints.push(Math.round((heightM * i) / segments));
  }

  return {
    categorySlug: category.slug,
    heightM,
    flagY: heightM,
    checkpoints,
    ...tuning,
  };
}

/** The MVP tower (spec Phase 1): a single themed solo tower. */
export const MVP_TOWER: TowerSpec = buildTower("indie-games");
