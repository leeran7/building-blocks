/**
 * The winnability gate for a season (design doc §3 "Winnability gate", §3d).
 *
 * For every level the generator measures, with the route bot through the real
 * `stepMatch`:
 *
 * 1. Route. The bot must clear the level with no lava. Its finish time is the
 *    level's route time, which sets the lava ramp and the star pars.
 * 2. Catch point. The lowest lava mean that catches the bot, found by
 *    bisection. The level's lava is `tightness × catch point`, so every level
 *    sits the same measured distance under its own bot's limit, whatever its
 *    layout does to the pace.
 * 3. Winnable. The bot clears the level's real lava, in the route time.
 * 4. Prove red (from level 50). A bot slowed to 5 points under the lava's
 *    tightness (a 0.90 bot on a 0.95 level) is caught, while the same slow
 *    bot clears with no lava. This proves the lava is what beats it and that
 *    the gate can fail.
 * 5. Never easier. Across the season the goal height, the measured tightness
 *    (lava mean over catch point) and the layout dial all rise level to level,
 *    and power-ups only get rarer once they unlock.
 *
 * A level that fails re-rolls its seed (revision + 1). A level that fails on
 * every revision is reported as "config unwinnable" and the season is refused.
 * CI re-runs 3-5 on the committed manifest (`verifySeasonManifest`).
 */

import { runLevel, idleShareForPace, NO_LAVA } from "./levelRun";
import {
  LEVEL_SPEC_VERSION,
  levelHazard,
  levelLavaRampSeconds,
  levelPars,
  levelSpec,
  maxLavaMeanFrac,
  type LevelPars,
  type LevelSpec,
} from "./levelSpec";
import { LEVELS_PER_SEASON, type SeasonSpec } from "./season";

export const GATE = {
  /** Levels from here on must be loseable by the prove-red bot. */
  proveRedFromLevel: 50,
  /** The prove-red bot runs this far under the level's tightness. */
  proveRedMargin: 0.05,
  /** How close the prove-red bot's measured pace must be to its target. */
  proveRedPaceTolerance: 0.02,
  /** Bisection steps for the catch point: (0.7 / 2^8) ≈ 0.003 resolution. */
  catchSearchSteps: 8,
  /** Seed revisions tried per level before "config unwinnable". */
  maxRevisions: 12,
} as const;

/** Float slack for values stored in and re-read from JSON. */
const EPS = 1e-9;

export interface ManifestLevel {
  level: number;
  rev: number;
  /** Bot finish tick with no lava. */
  routeTicks: number;
  /** Lowest lava mean (× ladder speed) found to catch the bot. */
  catchMeanFrac: number;
  /** True when even the fastest lava could not catch the bot. */
  catchCapped: boolean;
  /** The level's lava mean: tightness × catchMeanFrac. */
  lavaMeanFrac: number;
  rampSeconds: number;
  pars: LevelPars;
}

export interface SeasonManifest {
  format: 1;
  specVersion: number;
  season: SeasonSpec;
  levels: ManifestLevel[];
}

export class ConfigUnwinnableError extends Error {
  constructor(
    readonly level: number,
    readonly failures: string[]
  ) {
    super(
      `config unwinnable: level ${level} failed on all ${failures.length} seeds:\n  ` +
        failures.join("\n  ")
    );
    this.name = "ConfigUnwinnableError";
  }
}

function lavaOf(row: Pick<ManifestLevel, "lavaMeanFrac" | "rampSeconds">) {
  return levelHazard({ meanFrac: row.lavaMeanFrac, rampSeconds: row.rampSeconds });
}

/** Pace (share of the route bot's) the prove-red bot runs at. */
export function proveRedPace(spec: LevelSpec): number {
  return spec.tightness - GATE.proveRedMargin;
}

/** Steps 1-2: measure one seed revision and build its manifest row. */
export function measureLevel(
  season: SeasonSpec,
  level: number,
  rev: number
): { row: ManifestLevel } | { failure: string } {
  const spec = levelSpec(season, level, rev);
  const route = runLevel(spec, { hazard: NO_LAVA });
  if (route.outcome !== "cleared") {
    return { failure: `rev ${rev}: route bot ${route.outcome} at ${route.peakY.toFixed(1)} ft` };
  }
  const rampSeconds = levelLavaRampSeconds(route.ticks);
  const catches = (meanFrac: number) =>
    runLevel(spec, { hazard: levelHazard({ meanFrac, rampSeconds }) }).outcome !== "cleared";

  let hi = maxLavaMeanFrac();
  const catchCapped = !catches(hi);
  if (!catchCapped) {
    let lo = 0;
    for (let i = 0; i < GATE.catchSearchSteps; i++) {
      const mid = (lo + hi) / 2;
      if (catches(mid)) hi = mid;
      else lo = mid;
    }
  }
  return {
    row: {
      level,
      rev,
      routeTicks: route.ticks,
      catchMeanFrac: hi,
      catchCapped,
      lavaMeanFrac: spec.tightness * hi,
      rampSeconds,
      pars: levelPars(level, route.ticks),
    },
  };
}

/** Steps 3-4 plus the row's derived values. Empty when the row passes. */
export function verifyLevelRow(season: SeasonSpec, row: ManifestLevel): string[] {
  const out: string[] = [];
  const tag = `L${row.level} rev ${row.rev}`;
  const spec = levelSpec(season, row.level, row.rev);
  if (Math.abs(row.lavaMeanFrac - spec.tightness * row.catchMeanFrac) > EPS) {
    out.push(`${tag}: lava mean is not tightness × catch point`);
  }
  if (Math.abs(row.rampSeconds - levelLavaRampSeconds(row.routeTicks)) > EPS) {
    out.push(`${tag}: lava ramp does not match the route time`);
  }
  const pars = levelPars(row.level, row.routeTicks);
  if (pars.twoStarTicks !== row.pars.twoStarTicks || pars.threeStarTicks !== row.pars.threeStarTicks) {
    out.push(`${tag}: star pars do not match the route time`);
  }
  if (!(row.catchMeanFrac > 0 && row.catchMeanFrac <= maxLavaMeanFrac() + EPS)) {
    out.push(`${tag}: catch point out of range`);
  }
  if (out.length > 0) return out;

  const lava = lavaOf(row);
  const clear = runLevel(spec, { hazard: lava });
  if (clear.outcome !== "cleared") {
    out.push(`${tag}: route bot ${clear.outcome} by the level's lava at ${clear.peakY.toFixed(1)} ft`);
  } else if (clear.ticks !== row.routeTicks) {
    out.push(`${tag}: route bot finished in ${clear.ticks} ticks, manifest says ${row.routeTicks}`);
  }

  if (row.level >= GATE.proveRedFromLevel && clear.outcome === "cleared") {
    if (row.catchCapped) {
      out.push(`${tag}: no lava can catch the route bot, so the level cannot be proven loseable`);
    } else {
      const pace = proveRedPace(spec);
      const idleShare = idleShareForPace(clear, pace);
      const slow = runLevel(spec, { hazard: lava, idleShare });
      if (slow.outcome !== "caught") {
        out.push(`${tag}: prove-red bot (${pace.toFixed(2)} pace) was ${slow.outcome}, not caught`);
      }
      const slowFree = runLevel(spec, { hazard: NO_LAVA, idleShare });
      if (slowFree.outcome !== "cleared") {
        out.push(`${tag}: prove-red bot ${slowFree.outcome} with no lava, so the catch proves nothing`);
      } else if (Math.abs(clear.ticks / slowFree.ticks - pace) > GATE.proveRedPaceTolerance) {
        out.push(
          `${tag}: prove-red bot ran at ${(clear.ticks / slowFree.ticks).toFixed(3)} pace, meant ${pace.toFixed(3)}`
        );
      }
    }
  }
  return out;
}

/** Generate one level: first seed revision that measures and verifies. */
export function generateLevel(season: SeasonSpec, level: number): ManifestLevel {
  const failures: string[] = [];
  for (let rev = 0; rev < GATE.maxRevisions; rev++) {
    const m = measureLevel(season, level, rev);
    if ("failure" in m) {
      failures.push(m.failure);
      continue;
    }
    const problems = verifyLevelRow(season, m.row);
    if (problems.length === 0) return m.row;
    failures.push(...problems);
  }
  throw new ConfigUnwinnableError(level, failures);
}

/** Step 5 across the season, on the manifest's measured rows. */
export function neverEasierProblems(season: SeasonSpec, rows: readonly ManifestLevel[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const sa = levelSpec(season, a.level, a.rev);
    const sb = levelSpec(season, b.level, b.rev);
    const tag = `L${a.level} → L${b.level}`;
    if (!(sb.goalFt > sa.goalFt)) out.push(`${tag}: goal height does not rise`);
    if (!(sb.layoutDial > sa.layoutDial)) out.push(`${tag}: layout dial does not rise`);
    // L1-3 have no power-ups at all; the rule starts once they unlock.
    if (sa.powerUpChance > 0 && !(sb.powerUpChance <= sa.powerUpChance)) {
      out.push(`${tag}: power-ups get more common`);
    }
    const ta = a.lavaMeanFrac / a.catchMeanFrac;
    const tb = b.lavaMeanFrac / b.catchMeanFrac;
    if (!(tb > ta)) out.push(`${tag}: measured lava tightness does not rise (${ta.toFixed(4)} → ${tb.toFixed(4)})`);
  }
  return out;
}

/** Everything about a manifest that can be checked without running the sim. */
export function manifestShapeProblems(manifest: SeasonManifest, season: SeasonSpec): string[] {
  const out: string[] = [];
  if (manifest.format !== 1) out.push(`unknown manifest format ${String(manifest.format)}`);
  if (manifest.specVersion !== LEVEL_SPEC_VERSION) {
    out.push(`manifest built with level spec v${manifest.specVersion}, engine is v${LEVEL_SPEC_VERSION}`);
  }
  if (JSON.stringify(manifest.season) !== JSON.stringify(season)) {
    out.push(`manifest season spec does not match season ${season.id}'s`);
  }
  if (manifest.levels.length !== LEVELS_PER_SEASON) {
    out.push(`manifest has ${manifest.levels.length} levels, a season has ${LEVELS_PER_SEASON}`);
  }
  manifest.levels.forEach((row, i) => {
    if (row.level !== i + 1) out.push(`row ${i} is level ${row.level}, expected ${i + 1}`);
    if (!Number.isInteger(row.rev) || row.rev < 0 || row.rev >= GATE.maxRevisions) {
      out.push(`L${row.level}: bad seed revision ${row.rev}`);
    }
  });
  if (out.length === 0) out.push(...neverEasierProblems(season, manifest.levels));
  return out;
}

export function buildManifest(season: SeasonSpec, levels: ManifestLevel[]): SeasonManifest {
  return { format: 1, specVersion: LEVEL_SPEC_VERSION, season, levels };
}

/** One row per line, so a regenerated level shows up as a one-line diff. */
export function serializeManifest(manifest: SeasonManifest): string {
  const { levels, ...head } = manifest;
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const rows = levels.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  return `${headJson},\n  "levels": [\n${rows}\n  ]\n}\n`;
}
