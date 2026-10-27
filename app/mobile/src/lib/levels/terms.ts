/**
 * What the game calls the XP-driven player level on screen. "Level" means a
 * map level (Level 12) and "Ranks" the leaderboard, so the XP level needs a
 * word of its own (plan "Doomstack to 8/10", PR 1.4: one word, one meaning).
 * The code keeps the name playerLevel; only the copy changes.
 */
export const XP_TIER = "Tier";

/** "Tier 3": the XP level as players see it. */
export function tierLabel(playerLevel: number): string {
  return `${XP_TIER} ${playerLevel}`;
}
