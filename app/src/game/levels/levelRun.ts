/**
 * Play one level with the route bot through the real `stepMatch` (design doc
 * §3 winnability gate). Used by the season generator and CI's season check.
 *
 * The finish is "feet reach the goal height". Until the level engine marks the
 * finish itself (`goalFt` in stepMatch), this runner checks it after each
 * tick, which is the same rule.
 */

import { createMatch, stepMatch } from "../simulation";
import { NO_INPUT, TICK_HZ } from "../types";
import type { HazardConfig } from "../hazard";
import { DEFAULT_HAZARD_CONFIG } from "../hazard";
import { createRouteBot } from "./routeBot";
import { levelTower, type LevelSpec } from "./levelSpec";

const BOT_ID = "bot";

/** A run that has not set a new peak for this long is stuck on the layout. */
export const STUCK_SECONDS = 30;
/** Hard cap on one run. The longest season 1 route takes about 4 minutes. */
export const MAX_RUN_SECONDS = 15 * 60;

/** Lava that never rises: measures the bot's own route. */
export const NO_LAVA: HazardConfig = { ...DEFAULT_HAZARD_CONFIG, speedScale: 0 };

export type LevelRunOutcome = "cleared" | "caught" | "stuck";

export interface LevelRunResult {
  outcome: LevelRunOutcome;
  /** Climb ticks when the run ended (the finish tick on a clear). */
  ticks: number;
  peakY: number;
}

export interface LevelRunOptions {
  hazard: HazardConfig;
  /**
   * Share of the bot's grounded and ladder ticks replaced by no input, spread
   * evenly: 0.2 makes a bot about 20% slower on the same route. Airborne
   * ticks are left alone so the slow bot takes the same jumps.
   */
  idleShare?: number;
}

export function runLevel(spec: LevelSpec, opts: LevelRunOptions): LevelRunResult {
  const idleShare = opts.idleShare ?? 0;
  if (!(idleShare >= 0 && idleShare < 1)) throw new RangeError(`bad idleShare: ${idleShare}`);
  const state = createMatch({
    seed: spec.seed,
    mode: "solo",
    tower: levelTower(spec),
    playerIds: [BOT_ID],
  });
  const cfg = { hazard: opts.hazard };
  while (state.phase === "countdown") stepMatch(state, {}, cfg);

  const bot = createRouteBot();
  const stuckTicks = STUCK_SECONDS * TICK_HZ;
  const maxTicks = MAX_RUN_SECONDS * TICK_HZ;
  let peakTick = 0;
  let peakY = 0;
  let controlled = 0;
  let idled = 0;

  while (state.phase === "climb") {
    const p = state.players[0];
    if (p.status === "eliminated") return { outcome: "caught", ticks: state.tick, peakY };
    if (p.y >= spec.goalFt) return { outcome: "cleared", ticks: state.tick, peakY: p.y };
    if (p.y > peakY) {
      peakY = p.y;
      peakTick = state.tick;
    }
    if (state.tick - peakTick > stuckTicks || state.tick >= maxTicks) break;

    let input = bot(p, state.tower, state.tick);
    if (idleShare > 0 && (p.onGround || p.onLadder)) {
      controlled += 1;
      if (Math.floor(controlled * idleShare) > idled) {
        idled += 1;
        input = NO_INPUT;
      }
    }
    stepMatch(state, { [BOT_ID]: input }, cfg);
  }
  const p = state.players[0];
  if (p.status === "eliminated") return { outcome: "caught", ticks: state.tick, peakY };
  return { outcome: "stuck", ticks: state.tick, peakY };
}
