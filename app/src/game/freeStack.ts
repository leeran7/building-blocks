/**
 * The free skill-climb stack — TWO boards (mobile default, desktop), decoupled
 * from the 74 paid category stacks. All free-climb records use this slug; the
 * tower theme is fixed so every player on a given board competes on the same
 * endless climb.
 */

import type { GameCategory } from "./categories";
import { buildTower } from "./towers";

/** Slug stored in climb_records.category_slug for the unified free leaderboard. */
export const FREE_STACK_SLUG = "free";

/** Display metadata for the free stack (not one of the 74 paid categories). */
export const FREE_STACK: GameCategory = {
  slug: FREE_STACK_SLUG,
  label: "Free climb",
  family: "Gaming & Interactive",
  themeArchetype: "ladder-climb",
  risingHazardType: "lava",
  fallingHazardType: "debris",
  music: "free-climb-theme",
};

/** Deterministic tower spec for the single free game. */
export function buildFreeTower() {
  return buildTower(FREE_STACK);
}
