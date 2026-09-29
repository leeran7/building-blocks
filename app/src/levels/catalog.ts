/**
 * The level catalog: each season's levels as the generator built and proved
 * them (src/game/levels/seasons/season-N.json, design §3d).
 *
 * The server uses it to refuse a level a season does not have and to check a
 * reported clear's stars against the level's pars. A manifest that fails its
 * shape check is not served at all: the season is treated as unavailable,
 * never patched with defaults.
 */

import { levelSpec, type LevelPars } from "../game/levels/levelSpec";
import { seasonById } from "../game/levels/season";
import { manifestShapeProblems, type ManifestLevel, type SeasonManifest } from "../game/levels/seasonGate";
import season1 from "../game/levels/seasons/season-1.json";
import { startBoosterTypes, type BoosterType } from "./engagement";

/** Committed manifests by season id. A new season adds its file here. */
const MANIFEST_FILES: ReadonlyMap<number, unknown> = new Map([[1, season1]]);

const checked = new Map<number, SeasonManifest | null>();

/** Problems with season `id`'s committed manifest; [] when it is sound. */
export function manifestProblems(id: number, raw: unknown = MANIFEST_FILES.get(id)): string[] {
  const spec = seasonById(id);
  if (!spec) return [`no season spec for season ${id}`];
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as SeasonManifest).levels)) {
    return [`no manifest for season ${id}`];
  }
  const problems = manifestShapeProblems(raw as SeasonManifest, spec);
  (raw as SeasonManifest).levels.forEach((row) => {
    const p = row?.pars;
    const ok =
      p !== undefined &&
      Number.isInteger(p.threeStarTicks) &&
      Number.isInteger(p.twoStarTicks) &&
      p.threeStarTicks > 0 &&
      p.threeStarTicks <= p.twoStarTicks &&
      (p.oneStarTicks === null || (Number.isInteger(p.oneStarTicks) && p.twoStarTicks <= p.oneStarTicks));
    if (!ok) problems.push(`L${row?.level}: bad pars`);
  });
  return problems;
}

/** Season `id`'s manifest, or null when there is none or it is unsound. */
export function seasonManifest(id: number): SeasonManifest | null {
  if (checked.has(id)) return checked.get(id) ?? null;
  const raw = MANIFEST_FILES.get(id);
  let manifest: SeasonManifest | null = null;
  if (raw !== undefined) {
    let problems: string[];
    try {
      problems = manifestProblems(id, raw);
    } catch (err) {
      problems = [`manifest check threw: ${String(err)}`];
    }
    if (problems.length === 0) manifest = raw as SeasonManifest;
    else console.error(`[levels/catalog] season ${id} manifest refused:`, problems.slice(0, 5));
  }
  checked.set(id, manifest);
  return manifest;
}

/** One level's row, or null when the season has no sound manifest or no such level. */
export function catalogLevel(season: number, level: number): ManifestLevel | null {
  const manifest = seasonManifest(season);
  if (!manifest || !Number.isInteger(level) || level < 1) return null;
  const row = manifest.levels[level - 1];
  return row && row.level === level ? row : null;
}

/**
 * Stars a clear in `ticks` earns against `pars` (§4): 1 for any clear inside
 * the level's clock, 0 past it (the run ran out of time, so no clear).
 */
export function starsForTicks(ticks: number, pars: LevelPars): 0 | 1 | 2 | 3 {
  if (ticks <= pars.threeStarTicks) return 3;
  if (ticks <= pars.twoStarTicks) return 2;
  if (pars.oneStarTicks !== null && ticks > pars.oneStarTicks) return 0;
  return 1;
}

/**
 * The booster types a run of level `level` of `season` may start with (its
 * unlocked power-ups, less the random orb, and less the late boosters on early
 * levels: startBoosterTypes), from the season spec and the manifest row's seed
 * revision. Null when the season has no sound manifest or no such level.
 */
export function levelBoosterTypes(season: number, level: number): BoosterType[] | null {
  const row = catalogLevel(season, level);
  const spec = seasonById(season);
  if (!row || !spec) return null;
  return startBoosterTypes(level, levelSpec(spec, level, row.rev).allowedPowerUps);
}
