import { POWER_UP_SPECS } from "@app/game/powerups";
import { AVATARS } from "@app/lib/avatars";
import { EPISODE_XP, episodeLevels, firstClearXp, isHardLevel } from "@app/levels/rules";
import { episodeOf, type SeasonView } from "./model";

/**
 * What the XP pill's sheet shows: where the player level stands and what the
 * next stretch of the season opens up. Display only, derived from the season
 * the server already sent; nothing here decides an unlock.
 */

/** Something new on an upcoming level: a power-up or an obstacle. */
export interface TowerUnlock {
  level: number;
  kind: "power-up" | "obstacle";
  title: string;
  detail: string;
  /** The power-up's colour; null for an obstacle. */
  color: string | null;
}

/** A character the star ladder unlocks next. */
export interface CharacterUnlock {
  id: string;
  name: string;
  stars: number;
  /** Stars still to earn (always > 0). */
  starsLeft: number;
}

export interface Progression {
  /** XP left to the next player level. */
  xpToNext: number;
  /** The next level to clear and the XP it pays; null once the season is cleared. */
  nextClear: { level: number; hard: boolean; firstClearXp: number } | null;
  /** The current episode's +EPISODE_XP bonus; null once the season is cleared. */
  episode: { episode: number; first: number; last: number; levelsLeft: number; xp: number } | null;
  /** The next levels that bring something new, nearest first. */
  tower: TowerUnlock[];
  /** Best stars across seasons when the server sent them, else this season's sum. */
  stars: number;
  /** The next star characters, cheapest first. */
  characters: CharacterUnlock[];
  /** Stars to the next star chest; null when the server sent no chest progress. */
  starsToChest: number | null;
}

/** How many upcoming tower unlocks and characters the sheet lists. */
export const TOWER_UNLOCKS_SHOWN = 3;
export const CHARACTERS_SHOWN = 2;

/** An obstacle tip's first sentence, which names it ("Hanging ladders start above your head."). */
function firstSentence(tip: string): string {
  const end = tip.indexOf(". ");
  return end === -1 ? tip : tip.slice(0, end + 1);
}

export function progressionOf(season: SeasonView): Progression {
  const { player, levels } = season;
  // The frontier stays on the last level once it is cleared too.
  const next = levels.find((n) => n.level >= season.frontier && n.stars === 0) ?? null;

  const tower: TowerUnlock[] = [];
  if (next) {
    for (const n of levels) {
      if (tower.length >= TOWER_UNLOCKS_SHOWN) break;
      if (n.level < next.level) continue;
      if (n.introPowerUp) {
        const spec = POWER_UP_SPECS[n.introPowerUp];
        tower.push({ level: n.level, kind: "power-up", title: spec.label, detail: spec.description, color: spec.color });
      }
      if (n.introTip && tower.length < TOWER_UNLOCKS_SHOWN) {
        tower.push({ level: n.level, kind: "obstacle", title: "New obstacle", detail: firstSentence(n.introTip), color: null });
      }
    }
  }

  let episode: Progression["episode"] = null;
  if (next) {
    const ep = episodeOf(next.level);
    const { first, last } = episodeLevels(ep);
    const levelsLeft = levels.filter((n) => n.level >= first && n.level <= last && n.stars === 0).length;
    episode = { episode: ep, first, last, levelsLeft, xp: EPISODE_XP };
  }

  const stars = season.chests?.lifetimeStars ?? levels.reduce((sum, n) => sum + n.stars, 0);
  const characters: CharacterUnlock[] = [];
  for (const a of AVATARS) {
    if (characters.length >= CHARACTERS_SHOWN) break;
    if (a.unlock.kind !== "stars" || a.unlock.stars <= stars) continue;
    characters.push({ id: a.id, name: a.name, stars: a.unlock.stars, starsLeft: a.unlock.stars - stars });
  }

  const chests = season.chests;
  return {
    xpToNext: Math.max(0, player.xpForNext - player.xpIntoLevel),
    nextClear: next
      ? { level: next.level, hard: isHardLevel(next.level), firstClearXp: firstClearXp(next.level) }
      : null,
    episode,
    tower,
    stars,
    characters,
    starsToChest: chests ? chests.perChest - chests.starsIntoChest : null,
  };
}
