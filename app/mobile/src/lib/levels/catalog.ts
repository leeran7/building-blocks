import { levelCostsLife } from "@app/levels/rules";
import type { HazardConfig } from "@app/game/hazard";
import type { TowerSpec } from "@app/game/types";
import { TICK_HZ } from "@app/game/types";
import { levelHazard, levelSpec, levelTower, type LevelSpec } from "@app/game/levels/levelSpec";
import { powerUpSeconds } from "@app/game/powerups";
import { SEASON_1, type SeasonSpec } from "@app/game/levels/season";
import type { ManifestLevel } from "@app/game/levels/seasonGate";
import season1Manifest from "@app/game/levels/seasons/season-1.json";
import type { LevelCatalog, LevelInfo, LevelPowerUps } from "./model";

/**
 * Season 1's levels as the app plays them, from the season generator's
 * bot-proven manifest (app/src/game/levels/seasons/season-1.json): each row
 * pins the level's seed revision, lava and star pars, and levelSpec supplies
 * the goal, layout and power-ups. The device reports stars from these pars
 * (levels have no replay check), so this is what a clear is scored on.
 */

/** First-sight tips for a season's new obstacles (§3). */
function obstacleTip(season: SeasonSpec, level: number): string | null {
  if (level === season.obstacleIntros.hangingLadders) {
    return "Amber ladders hang above the floor. Jump to grab them. Giant can climb straight on.";
  }
  if (level === season.obstacleIntros.shortTops) {
    return "Short tops stop below the floor. Jump off the top to get up.";
  }
  return null;
}

const ticksToMs = (ticks: number) => Math.round((ticks / TICK_HZ) * 1000);

/** A level's power-ups as the start sheet shows them, from its own tower. */
export function levelPowerUps(spec: LevelSpec): LevelPowerUps {
  const tower = levelTower(spec);
  const types = spec.powerUpChance > 0 ? spec.allowedPowerUps : [];
  const seconds: LevelPowerUps["seconds"] = {};
  for (const t of types) if (t !== "random") seconds[t] = powerUpSeconds(t, tower);
  return {
    types,
    floorsPerOrb: types.length > 0 ? Math.round(1 / spec.powerUpChance) : null,
    seconds,
  };
}

/** What a level run is climbed on: the level's tower and its lava. */
export interface LevelRunSetup {
  tower: TowerSpec;
  hazard: HazardConfig;
}

export interface SeasonLevels {
  catalog: LevelCatalog;
  /** The tower and lava for a level, built fresh for each run. */
  runSetup(level: number): LevelRunSetup;
}

/** A season's levels from its spec and its manifest rows (row N is level N). */
export function seasonLevels(season: SeasonSpec, rows: readonly ManifestLevel[]): SeasonLevels {
  const row = (level: number): ManifestLevel => {
    const r = Number.isInteger(level) ? rows[level - 1] : undefined;
    if (!r || r.level !== level) throw new RangeError(`Level ${level} is not in season ${season.id}`);
    return r;
  };
  const specs = new Map<number, LevelSpec>();
  const specFor = (level: number): LevelSpec => {
    let spec = specs.get(level);
    if (!spec) {
      spec = levelSpec(season, level, row(level).rev);
      specs.set(level, spec);
    }
    return spec;
  };
  const infos = new Map<number, LevelInfo>();
  const infoFor = (level: number): LevelInfo => {
    let info = infos.get(level);
    if (!info) {
      const spec = specFor(level);
      const { pars } = row(level);
      info = {
        level,
        seed: spec.seed,
        goalFt: spec.goalFt,
        pars: {
          twoStarMs: ticksToMs(pars.twoStarTicks),
          threeStarMs: ticksToMs(pars.threeStarTicks),
          oneStarMs: pars.oneStarTicks === null ? null : ticksToMs(pars.oneStarTicks),
        },
        introPowerUp: spec.introPowerUp,
        introTip: obstacleTip(season, level),
        powerUps: levelPowerUps(spec),
        costsLife: levelCostsLife(level),
      };
      infos.set(level, info);
    }
    return info;
  };
  return {
    catalog: { season: season.id, name: season.name, count: rows.length, level: infoFor },
    runSetup(level) {
      const r = row(level);
      const tower = levelTower(specFor(level));
      // The level's 1-star clock ends the run when it runs out.
      if (r.pars.oneStarTicks !== null) tower.timeLimitTicks = r.pars.oneStarTicks;
      return {
        tower,
        // As the season gate plays it (seasonGate.ts lavaOf).
        hazard: levelHazard({ meanFrac: r.lavaMeanFrac, rampSeconds: r.rampSeconds }),
      };
    },
  };
}

const SEASON_1_LEVELS = seasonLevels(SEASON_1, season1Manifest.levels as ManifestLevel[]);

export function season1Catalog(): LevelCatalog {
  return SEASON_1_LEVELS.catalog;
}

export function levelRunSetup(level: number): LevelRunSetup {
  return SEASON_1_LEVELS.runSetup(level);
}
