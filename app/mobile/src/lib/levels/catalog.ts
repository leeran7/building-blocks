import { mockLevelNode, SEASON_LENGTH } from "./mockClient";
import type { LevelCatalog, LevelInfo } from "./model";

/**
 * Season 1's levels as the app knows them: seed, goal height, star times,
 * intro power-up and tip for each pin. The device reports stars from these
 * pars (levels have no replay check), so this is what a clear is scored on.
 *
 * Interim: the goals and pars follow the design doc's season 1 dial with a
 * guessed route pace. The season generator's bot-measured manifest
 * (app/src/game/levels/seasons/season-1.json) replaces them when it lands.
 */
export function season1Catalog(): LevelCatalog {
  const cache = new Map<number, LevelInfo>();
  return {
    season: 1,
    name: "Season 1",
    count: SEASON_LENGTH,
    level(n) {
      let info = cache.get(n);
      if (!info) {
        const { stars: _stars, bestMs: _bestMs, ...rest } = mockLevelNode(n);
        info = rest;
        cache.set(n, info);
      }
      return info;
    },
  };
}
