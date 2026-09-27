/**
 * Play one level with the route bot through the real `stepMatch` (design doc
 * §3 winnability gate). Used by the season generator and CI's season check.
 *
 * The finish is the engine's own: feet at the tower's goal height mark the
 * climber finished (stepMatch step 4).
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
  /** Ticks the climber spent on the ground or a ladder (not airborne). */
  groundedTicks: number;
}

export interface LevelRunOptions {
  hazard: HazardConfig;
  /**
   * Share of the bot's grounded and ladder ticks replaced by no input, spread
   * evenly. Airborne ticks are left alone so the slow bot takes the same
   * jumps. `idleShareForPace` turns a target pace into this share.
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
  let grounded = 0;
  let idled = 0;

  while (state.phase === "climb") {
    const p = state.players[0];
    if (p.status !== "climbing") break;
    if (p.y > peakY) {
      peakY = p.y;
      peakTick = state.tick;
    }
    if (state.tick - peakTick > stuckTicks || state.tick >= maxTicks) break;

    let input = bot(p, state.tower, state.tick);
    if (p.onGround || p.onLadder) grounded += 1;
    if (idleShare > 0 && (p.onGround || p.onLadder)) {
      if (Math.floor(grounded * idleShare) > idled) {
        idled += 1;
        input = NO_INPUT;
      }
    }
    stepMatch(state, { [BOT_ID]: input }, cfg);
  }
  const p = state.players[0];
  if (p.status === "finished" && p.finishedTick !== null) {
    return { outcome: "cleared", ticks: p.finishedTick, peakY: p.y, groundedTicks: grounded };
  }
  const outcome = p.status === "eliminated" ? "caught" : "stuck";
  return { outcome, ticks: state.tick, peakY, groundedTicks: grounded };
}

/**
 * Idle share that makes the bot take `1 / pace` times its route time: the
 * extra ticks all land on its grounded ticks, the only ones it idles. From a
 * full-speed clear of `routeTicks` with `groundedTicks` on the ground.
 */
export function idleShareForPace(
  route: Pick<LevelRunResult, "ticks" | "groundedTicks">,
  pace: number
): number {
  if (!(pace > 0 && pace <= 1)) throw new RangeError(`bad pace: ${pace}`);
  const extra = route.ticks / pace - route.ticks;
  return extra / (route.groundedTicks + extra);
}
