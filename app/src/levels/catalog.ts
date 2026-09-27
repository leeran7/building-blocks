/**
 * The seam between the level server and the level engine.
 *
 * The routes need three things they cannot compute themselves: which seasons
 * and levels exist (the server's own copy of each season manifest), which
 * engine and level-spec versions a ticket is pinned to, and a re-simulation
 * of a submitted run (`verifyLevelReplay`, design/xp-and-levels.md §7). All
 * three come from the level engine (levelSpec, goalFt, the season manifest),
 * which lands in separate PRs. Until it does, getLevelCatalog() returns null and every
 * level route answers 503 LEVELS_UNAVAILABLE before touching lives, so no
 * life is ever spent on a run that could not be verified.
 *
 * The engine PR wires this up by returning its catalog from getLevelCatalog.
 * Server-only: `verify` re-simulates untrusted input logs.
 */

import type { RunReplay } from "../game/runReplay";
import type { LevelPars } from "./rules";

/** What a run ticket pins, copied from the ticket row, never the request. */
export interface LevelTicketSpec {
  season: number;
  level: number;
  /** LEVEL_SIM_VERSION the ticket was issued under. */
  simVersion: number;
  /** Level-spec revision (seed re-rolls) the ticket was issued under. */
  specVersion: number;
  /** Power-up granted at GO (win streaks, stuck help), or null. */
  startPowerUp: string | null;
}

export type LevelVerifyFailure = "RUN_TOO_LONG" | "REPLAY_MISMATCH" | "WRONG_LEVEL";

export type LevelVerdict =
  | {
      ok: true;
      /** True when the re-simulated climber reached the summit. */
      finished: boolean;
      /** Server finish tick counted from GO, or null when not finished. */
      finishTicks: number | null;
      /** Race ticks the server simulated before the run ended. */
      raceTicks: number;
      /** False only on a Collect level where a gem was missed. */
      allGems: boolean;
      /** Star thresholds from the server's manifest row for this level. */
      pars: LevelPars;
      /** SHA-256 of the consumed canonical input log (as dailyInputHash). */
      inputHash: string;
      /** Input segments of the same consumed log (as dailyInputSegments). */
      inputSegments: number;
    }
  | { ok: false; code: LevelVerifyFailure; reason: string };

/** One playable season, from the server's own manifest. */
export interface LevelSeasonInfo {
  id: number;
  /** Levels in the season (300 for every generated season). */
  levelCount: number;
  /** SHA-256 of the manifest; must match the level_seasons row to activate. */
  manifestHash: string;
  /** Current spec revision of a level (bumped when its seed is re-rolled). */
  specVersion(level: number): number;
}

export interface LevelCatalog {
  /** LEVEL_SIM_VERSION of the engine this server runs. */
  simVersion: number;
  /** The season, or null when this server has no manifest for it. */
  season(id: number): LevelSeasonInfo | null;
  /**
   * Re-simulate `replay` on the level the ticket names, rebuilt from the
   * server's manifest. Nothing about the level is read from the replay.
   */
  verify(ticket: LevelTicketSpec, replay: RunReplay): LevelVerdict;
}

/** Null until the level engine and season 1 manifest land. */
export function getLevelCatalog(): LevelCatalog | null {
  return null;
}
