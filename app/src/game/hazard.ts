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
 * Because the time-averaged late-game speed still exceeds the climb rate, a
 * climber who keeps moving upward can use stumble windows to stay ahead, while
 * dawdling on a floor — or missing a surge — lets the lava close in.
 *
 * The function is a pure, deterministic function of (race-time, climb speed,
 * config), which the re-simulation anti-cheat relies on (AC-11).
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
   * Tune so `hazardMeanSpeedFrac` stays above 1 (and above the time-slow bound).
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

export const DEFAULT_HAZARD_CONFIG: HazardConfig = {
  headStartM: 6,
  graceSeconds: 4,
  // Envelope ramps 0.5× → 1.42× over ~90s. Stumbles cut each 8s cycle to 2s at
  // 0.25× envelope, so the TIME-AVERAGED late-game chase is
  // 1.42 · (0.75 + 0.25·0.25) ≈ 1.15× — same pressure as a smooth 1.15× hold,
  // but with recovery windows instead of a constant acceleration. Past that
  // average even a perfect vertical climber cannot keep up.
  startSpeedFrac: 0.5,
  endSpeedFrac: 1.42,
  rampSeconds: 90,
  stumblePeriodSeconds: 8,
  stumbleDurationSeconds: 2,
  stumbleSpeedFrac: 0.25,
  speedScale: 1,
};

/**
 * Time-averaged end-game speed fraction, including stumbles. This — not the
 * raw envelope — is what must stay above 1× (and above the time-slow bound)
 * so every run still ends.
 */
export function hazardMeanSpeedFrac(
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): number {
  const period = Math.max(0, cfg.stumblePeriodSeconds);
  const dur = Math.max(0, Math.min(cfg.stumbleDurationSeconds, period));
  if (period <= 0 || dur <= 0) return cfg.endSpeedFrac;
  const surgeDuty = (period - dur) / period;
  return (
    cfg.endSpeedFrac * (surgeDuty + (1 - surgeDuty) * cfg.stumbleSpeedFrac)
  );
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
  return envelopeFrac(t, cfg) * stumbleMultiplier(t, cfg);
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
  if (t >= ramp) return cfg.endSpeedFrac;
  return cfg.startSpeedFrac + ((cfg.endSpeedFrac - cfg.startSpeedFrac) * t) / ramp;
}

function stumbleMultiplier(t: number, cfg: HazardConfig): number {
  const period = Math.max(0, cfg.stumblePeriodSeconds);
  const dur = Math.max(0, Math.min(cfg.stumbleDurationSeconds, period));
  if (period <= 0 || dur <= 0) return 1;
  const phase = t - Math.floor(t / period) * period;
  return phase >= period - dur ? cfg.stumbleSpeedFrac : 1;
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
  const v0 = cfg.startSpeedFrac * vScale;
  const v1 = cfg.endSpeedFrac * vScale;
  const ramp = Math.max(1e-6, cfg.rampSeconds);
  const accel = (v1 - v0) / ramp;

  const period = Math.max(0, cfg.stumblePeriodSeconds);
  const stumbleDur = Math.max(0, Math.min(cfg.stumbleDurationSeconds, period));
  if (period <= 0 || stumbleDur <= 0) {
    return envelopeIntegral(0, t, v0, v1, ramp, accel);
  }

  const surgeDur = period - stumbleDur;
  const s = cfg.stumbleSpeedFrac;
  let dist = 0;
  let t0 = 0;
  while (t0 < t) {
    const cycleStart = Math.floor(t0 / period + 1e-12) * period;
    const surgeEnd = cycleStart + surgeDur;
    const cycleEnd = cycleStart + period;
    const inSurge = t0 < surgeEnd - 1e-12;
    const t1 = Math.min(t, inSurge ? surgeEnd : cycleEnd);
    const m = inSurge ? 1 : s;
    dist += m * envelopeIntegral(t0, t1, v0, v1, ramp, accel);
    // Force progress if a boundary sits on a float knife-edge.
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
