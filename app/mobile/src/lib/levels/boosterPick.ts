import { parseBoosterType, startBoosterTypes, type BoosterInventory, type BoosterType } from "@app/levels/engagement";
import type { SeasonView } from "./model";

/**
 * Picking a booster ahead of a run (§6.4): on the start card, and from a
 * chest reveal for the next level. Only ever a preselect for the start
 * card's startLevel({ booster }) call; the server checks allowed and owned
 * again and spends it there.
 */

/** The free power-up a level's run starts with (the server's preview, frontier only). */
export function freeStartOn(
  season: Pick<SeasonView, "frontier" | "nextStartPowerUp">,
  level: number,
): SeasonView["nextStartPowerUp"] {
  return level === season.frontier ? season.nextStartPowerUp : null;
}

/** The type of freeStartOn, or null. */
export function freeTypeOn(season: Pick<SeasonView, "frontier" | "nextStartPowerUp">, level: number): BoosterType | null {
  return freeStartOn(season, level)?.type ?? null;
}

/**
 * `pick` when it can be equipped on a level's card: owned, allowed there,
 * and not the type the run already gets free (that would only refresh it).
 * Otherwise null: a preselect is dropped, never swapped for another.
 */
export function equippable(
  pick: BoosterType | null,
  inventory: BoosterInventory,
  allowed: readonly string[],
  freeType: BoosterType | null,
): BoosterType | null {
  if (pick === null) return null;
  if ((inventory[pick] ?? 0) < 1 || !allowed.includes(pick) || pick === freeType) return null;
  return pick;
}

/** The level after a cleared one, as its start card will see it. */
export interface NextStart {
  level: number;
  /** Power-ups unlocked on that level. */
  allowed: readonly string[];
  /** The free power-up its run starts with, as the map previews it. */
  freeType: BoosterType | null;
}

/**
 * The next level's start facts, or null when there is none to open: the
 * season ends here, or it is still locked.
 */
export function nextStartAfter(season: SeasonView | null, level: number): NextStart | null {
  if (!season || !Number.isInteger(level)) return null;
  const next = level + 1;
  if (next < 1 || next > season.levels.length || next > season.frontier) return null;
  return { level: next, allowed: startBoosterTypes(next, season.levels[next - 1].allowedPowerUps), freeType: freeTypeOn(season, next) };
}

/** Router state's carried booster (from a result card's Next level), allow-list parsed. */
export function carriedBooster(state: unknown): BoosterType | null {
  if (typeof state !== "object" || state === null || !("booster" in state)) return null;
  return parseBoosterType((state as { booster: unknown }).booster);
}
