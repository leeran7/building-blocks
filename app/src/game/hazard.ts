/**
 * Tower v3 "The Climb" — Rising Hazard.
 *
 * The rising hazard (lava / flood / collapsing floor) chases the climber upward
 * and supplies the Doodle-Jump "keep moving or you're caught" pressure. Its rise
 * speed is expressed as a FRACTION OF THE CLIMBER'S SPEED (the stack's ladder
 * climb rate), so the chase is always proportional to how fast you can move and
 * scales automatically across archetypes:
 *
 *   - the *envelope* starts at `startSpeedFrac` of the climb speed and ramps to
 *     `endSpeedFrac` over `rampSeconds`, then holds;
 *   - that envelope is not applied smoothly: the lava *surges*, then *stumbles*
 *     (drops to `stumbleSpeedFrac` of the envelope) on a fixed cycle, so the
 *     chase is not accelerating at every moment — there are windows to recover;
 *   - it begins `headStartM` BELOW the base, giving a fair opening buffer;
 *   - height is the integral of that speed over race-time.
 *
 * Two independent knobs
 * ---------------------
 * 1. The CURVE (`DEFAULT_HAZARD_CONFIG`) decides WHO DIES. Its time-averaged
 *    late speed (`hazardMeanSpeedFrac`, 0.64× ladder speed) is the kill
 *    threshold: a climber who averages less than that is eventually caught.
 * 2. The LEASH (`HAZARD_LEASH_M`, `HAZARD_LEASH_RANGE_M`,
 *    `HAZARD_CATCHUP_MAX_SCALE`) decides HOW CLOSE IT RIDES behind anyone
 *    faster than the curve. `hazardCatchupTimeScale` runs the lava clock
 *    faster in proportion to how far the lead climber is beyond the leash, so
 *    the lava settles a few tens of feet behind a good climber and stays on
 *    screen instead of becoming a HUD number.
 *
 * Tune them separately: `endSpeedFrac` / `rampSeconds` move the kill
 * threshold, `HAZARD_LEASH_M` moves where the lava rides (visibility) and
 * `HAZARD_LEASH_RANGE_M` moves how quickly it closes. The leash only ever
 * speeds the clock up (scale >= 1), so it never lets a slow climber escape.
 *
 * Measured through the real stepMatch (tests/game/hazardLeash.test.ts drives
 * a constant-pace climber on the free tower, 9 ft/s ladder; units are 1:1
 * feet; the camera shows ~80 ft below the climber):
 *
 *   pace (× ladder) | gap band after 30 s | caught at → peak
 *   0.45            | –                   | ~118 s → ~480 ft (was 296)
 *   0.50            | –                   | ~129 s → ~581 ft
 *   0.55            | –                   | ~141 s → ~699 ft (was 585)
 *   0.60            | –                   | ~199 s → ~1072 ft (was 839)
 *   0.70            | ~41–87 ft           | never
 *   0.85            | ~53–101 ft          | never
 *   1.00            | ~62–111 ft          | never
 *   1.30 (jetpack)  | ~80–136 ft          | never (off screen while bursting)
 *
 * A full stall at 0.85 pace survives 8 s from any phase and ~10 s if it
 * starts as the lava stumbles; 20 s is always fatal. The kill threshold moved
 * from ~0.70× to ~0.64× ladder pace (beginners get ~60% further) while mid
 * and strong climbers see the lava almost all match.
 * The envelope never exceeds 1× the ladder climb rate (`MAX_HAZARD_SPEED_FRAC`),
 * so holding climb on a ladder still outruns the lava inside the leash band.
 * Runs end when the player dawdles on a floor, misses a ladder, or stops.
 *
 * Height is a pure, deterministic function of (race-time, climb speed,
 * config), which the re-simulation anti-cheat relies on (AC-11). The leash is
 * a clock multiplier in the sim, not a second random curve.
 */

/** Tuning for the movement-proportional rising hazard. */
export interface HazardConfig {
  /** Metres the hazard starts BELOW the base (spawn buffer). */
  headStartM: number;
  /**
   * Seconds the hazard holds below the base before it starts rising — a fixed
   * opening grace so the initial run to the first ladder is always survivable,
   * independent of climb speed (a metres-only head-start evaporates too fast on
   * fast-climb towers).
   */
  graceSeconds: number;
  /** Envelope rise speed at race start, as a fraction of the climber's climb speed. */
  startSpeedFrac: number;
  /**
   * Envelope rise speed after the ramp, as a fraction of the climber's climb
   * speed. Applied during surges; stumbles multiply this by stumbleSpeedFrac.
   * Capped at `MAX_HAZARD_SPEED_FRAC` (1× climb) so lava never outruns a ladder.
   */
  endSpeedFrac: number;
  /** Seconds over which the envelope ramps start → end (then holds). */
  rampSeconds: number;
  /**
   * Length of one surge+stumble cycle, in seconds of post-grace race-time.
   * The lava surges for (period − duration), then stumbles for `duration`.
   */
  stumblePeriodSeconds: number;
  /** Seconds at the end of each cycle that the lava stumbles (slows). */
  stumbleDurationSeconds: number;
  /**
   * Fraction of the current envelope applied during a stumble (0 = full pause,
   * 1 = no stumble). Kept well below 1 so the player can pull ahead.
   */
  stumbleSpeedFrac: number;
  /** Global speed multiplier — 1 = normal (knob for tuning + tests). */
  speedScale: number;
}

/** Lava never rises faster than the tower's max ladder climb speed. */
export const MAX_HAZARD_SPEED_FRAC = 1;

export const DEFAULT_HAZARD_CONFIG: HazardConfig = {
  headStartM: 9,
  graceSeconds: 5,
  // Opening is the gentler tune from main (9m head-start, 5s grace, 0.42×).
  // Envelope ramps 0.42× → 0.91× over 120s. Each 16s cycle surges for 10s
  // and stumbles for 6s at 0.2× envelope, so the time-averaged late-game
  // chase is 0.91 · (10/16 + 6/16·0.2) = 0.64× — the kill threshold.
  //
  // `endSpeedFrac` is DERIVED from that target mean and the cycle duty:
  // endSpeedFrac = mean / (surgeDuty + stumbleDuty·stumbleSpeedFrac). Change
  // the cycle and you must recompute it (hazard.test.ts pins the 0.64 mean).
  // The 16s / 6s @ 0.2 rhythm gives a ~29 ft gap swing at 0.85 pace — a
  // third of the visible band, readable as breathing — while a stall that
  // lands at the start of a surge only loses ~1s versus the old 12s cycle.
  startSpeedFrac: 0.42,
  endSpeedFrac: 0.91,
  rampSeconds: 120,
  stumblePeriodSeconds: 16,
  stumbleDurationSeconds: 6,
  stumbleSpeedFrac: 0.2,
  speedScale: 1,
};

/**
 * Leash length (metres above lava). At or under this lead the lava clock runs
 * at 1×; beyond it the clock speeds up so the lava rides about this far behind
 * the lead climber. This is the visibility knob, not the kill threshold.
 */
export const HAZARD_LEASH_M = 50;

/**
 * Metres beyond the leash over which the clock gains one extra 1×: at
 * `HAZARD_LEASH_M + HAZARD_LEASH_RANGE_M` the clock runs at 2×. Smaller closes
 * the gap faster.
 */
export const HAZARD_LEASH_RANGE_M = 40;

/** Hard cap on the leash clock multiplier (a jetpack burst cannot warp it). */
export const HAZARD_CATCHUP_MAX_SCALE = 3;

/** Float slack so `hazardY + lead − hazardY` noise does not engage the leash. */
const LEASH_SLACK_M = 1e-6;

/**
 * Time-averaged end-game speed fraction, including stumbles.
 */
export function hazardMeanSpeedFrac(
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): number {
  const { period, duration, speedFrac } = stumbleWindow(cfg);
  if (period <= 0 || duration <= 0) return cfg.endSpeedFrac;
  const surgeDuty = (period - duration) / period;
  return cfg.endSpeedFrac * (surgeDuty + (1 - surgeDuty) * speedFrac);
}

/**
 * Instantaneous rise-speed fraction at race-time (0 during the opening grace).
 * Envelope ramp × the current surge/stumble multiplier.
 */
export function hazardSpeedFracAt(
  seconds: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): number {
  const t = Math.max(0, seconds - cfg.graceSeconds);
  if (t <= 0) return 0;
  return Math.min(
    envelopeFrac(t, cfg) * stumbleMultiplier(t, cfg),
    MAX_HAZARD_SPEED_FRAC
  );
}

/**
 * Rising-hazard height (metres) at the given race-time.
 *
 * The hazard rises at v(t) = climbSpeed · envelope(t) · stumble(t) · speedScale.
 * Height is the integral of v from 0, offset by the head-start. There is no
 * upper bound — the stack is endless. The lava never falls: stumble only slows
 * the rise, it does not reverse it.
 *
 * @param seconds        race-time since match start (>= 0)
 * @param climbSpeedM    the climber's reference speed (tower.maxClimbSpeed)
 * @param cfg            hazard tuning
 */
export function hazardHeightAt(
  seconds: number,
  climbSpeedM: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): number {
  // The lava holds below the base during the opening grace, then rises.
  const t = Math.max(0, seconds - cfg.graceSeconds);
  const dist = integrateRise(t, climbSpeedM, cfg);

  // Endless: no upper ceiling — the lava rises without limit. Only the base
  // head-start floors the value.
  return dist - cfg.headStartM;
}

/**
 * True if the hazard's top edge has reached or passed a climber's feet-height on
 * this tick — the elimination condition (spec AC-7).
 *
 * @param feetHeightM climber's feet altitude in tower metres
 * @param seconds     race-time
 * @param climbSpeedM the climber's reference speed (tower.maxClimbSpeed)
 */
export function hazardHasReached(
  feetHeightM: number,
  seconds: number,
  climbSpeedM: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): boolean {
  return feetHeightM <= hazardHeightAt(seconds, climbSpeedM, cfg);
}

function envelopeFrac(t: number, cfg: HazardConfig): number {
  const ramp = Math.max(1e-6, cfg.rampSeconds);
  const raw =
    t >= ramp
      ? cfg.endSpeedFrac
      : cfg.startSpeedFrac + ((cfg.endSpeedFrac - cfg.startSpeedFrac) * t) / ramp;
  return Math.min(raw, MAX_HAZARD_SPEED_FRAC);
}

function stumbleWindow(cfg: HazardConfig): {
  period: number;
  duration: number;
  speedFrac: number;
} {
  const period = cfg.stumblePeriodSeconds;
  if (!(period > 1e-6)) {
    return { period: 0, duration: 0, speedFrac: 1 };
  }
  const duration = Math.max(0, Math.min(cfg.stumbleDurationSeconds, period));
  const speedFrac = Math.min(1, Math.max(0, cfg.stumbleSpeedFrac));
  return { period, duration, speedFrac };
}

function stumbleMultiplier(t: number, cfg: HazardConfig): number {
  const { period, duration, speedFrac } = stumbleWindow(cfg);
  if (period <= 0 || duration <= 0) return 1;
  const phase = t - Math.floor(t / period) * period;
  return phase >= period - duration ? speedFrac : 1;
}

/**
 * Integral of envelope-speed × stumble multiplier from post-grace time 0 to t.
 * Walks surge/stumble intervals so the result stays a closed-form sum (no
 * tick sampling) — required for bit-stable re-simulation (AC-11).
 */
function integrateRise(
  t: number,
  climbSpeedM: number,
  cfg: HazardConfig
): number {
  if (t <= 0) return 0;
  const vScale = climbSpeedM * cfg.speedScale;
  const v0 = Math.min(cfg.startSpeedFrac, MAX_HAZARD_SPEED_FRAC) * vScale;
  const v1 = Math.min(cfg.endSpeedFrac, MAX_HAZARD_SPEED_FRAC) * vScale;
  const ramp = Math.max(1e-6, cfg.rampSeconds);
  const accel = (v1 - v0) / ramp;

  const { period, duration, speedFrac } = stumbleWindow(cfg);
  if (period <= 0 || duration <= 0) {
    return envelopeIntegral(0, t, v0, v1, ramp, accel);
  }

  const surgeDur = period - duration;
  let dist = 0;
  let t0 = 0;
  const maxIters = Math.max(8, 2 * Math.ceil(t / period) + 8);
  for (let i = 0; i < maxIters && t0 < t; i++) {
    const cycleStart = Math.floor(t0 / period + 1e-12) * period;
    const surgeEnd = cycleStart + surgeDur;
    const cycleEnd = cycleStart + period;
    const inSurge = t0 < surgeEnd - 1e-12;
    const t1 = Math.min(t, inSurge ? surgeEnd : cycleEnd);
    const m = inSurge ? 1 : speedFrac;
    dist += m * envelopeIntegral(t0, t1, v0, v1, ramp, accel);
    t0 = t1 > t0 ? t1 : Math.min(t, t0 + 1e-9);
  }
  return dist;
}

/** ∫ envelope speed dt over [t0, t1], where envelope is linear then holds. */
function envelopeIntegral(
  t0: number,
  t1: number,
  v0: number,
  v1: number,
  ramp: number,
  accel: number
): number {
  if (t1 <= t0) return 0;
  if (t1 <= ramp) {
    return v0 * (t1 - t0) + (accel / 2) * (t1 * t1 - t0 * t0);
  }
  if (t0 >= ramp) {
    return v1 * (t1 - t0);
  }
  return (
    envelopeIntegral(t0, ramp, v0, v1, ramp, accel) +
    envelopeIntegral(ramp, t1, v0, v1, ramp, accel)
  );
}

export type HazardPhaseName = "grace" | "surge" | "stumble";

export interface HazardPhaseInfo {
  phase: HazardPhaseName;
  /** 0 → just entered this phase, 1 → about to leave it. */
  progress: number;
}

/**
 * Which phase the lava is in at `seconds` of effective hazard time (i.e.
 * `raceSeconds − hazardSlowSeconds`): grace (holding still), surge (full
 * envelope speed), or stumble (reduced speed).
 */
export function hazardPhase(
  seconds: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): HazardPhaseInfo {
  const t = seconds - cfg.graceSeconds;
  if (t <= 0) {
    const graceDur = Math.max(1e-6, cfg.graceSeconds);
    return { phase: "grace", progress: Math.max(0, seconds) / graceDur };
  }
  const { period, duration } = stumbleWindow(cfg);
  if (period <= 0 || duration <= 0) {
    return { phase: "surge", progress: 0 };
  }
  const surgeDur = period - duration;
  const phase = t - Math.floor(t / period) * period;
  if (phase < surgeDur) {
    return { phase: "surge", progress: phase / surgeDur };
  }
  return { phase: "stumble", progress: (phase - surgeDur) / duration };
}

/**
 * Leash: clock multiplier so the lava rides a fixed distance behind the lead
 * climber. Evaluated from the current lead every tick — it does not latch.
 *
 *   lead <= HAZARD_LEASH_M  → 1 (the curve alone)
 *   lead >  HAZARD_LEASH_M  → min(MAX, 1 + (lead − LEASH) / RANGE)
 *
 * Continuous at the leash boundary, non-decreasing in lead, capped at
 * `HAZARD_CATCHUP_MAX_SCALE`, and never below 1 (a NaN lead reads as
 * "within the leash"). Deterministic: same lead → same scale (AC-11).
 */
export function hazardCatchupTimeScale(leadM: number): number {
  const beyond = leadM - (HAZARD_LEASH_M + LEASH_SLACK_M);
  if (!(beyond > 0)) return 1;
  return Math.min(
    HAZARD_CATCHUP_MAX_SCALE,
    1 + (leadM - HAZARD_LEASH_M) / HAZARD_LEASH_RANGE_M
  );
}
