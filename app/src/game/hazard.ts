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
 *     `endSpeedFrac` over `rampSeconds`, then creeps up by `creepPerMinute`
 *     until it reaches `MAX_HAZARD_SPEED_FRAC` (1×), then holds;
 *   - that envelope is not applied smoothly: the lava *surges*, then *stumbles*
 *     (drops to `stumbleSpeedFrac` of the envelope) on a fixed cycle, so the
 *     chase is not accelerating at every moment — there are windows to recover;
 *   - it begins `headStartM` BELOW the base, giving a fair opening buffer;
 *   - height is the integral of that speed over race-time.
 *
 * Two knobs
 * ---------
 * 1. The CURVE (`DEFAULT_HAZARD_CONFIG`) sets the kill threshold: its
 *    time-averaged speed (`hazardMeanSpeedFrac`) is the sustained pace below
 *    which a climber is always caught. It is 0.64× ladder speed when the
 *    ramp ends, and the late creep lifts it to 0.70× at the cap (~6.5 min).
 * 2. The LEASH (`HAZARD_LEASH_M`, `HAZARD_LEASH_RANGE_M`,
 *    `HAZARD_CATCHUP_MAX_SCALE`) caps how far a climber can get ahead:
 *    beyond HAZARD_LEASH_M the lava clock runs faster in proportion to the
 *    excess, so the lava stays on screen. It only ever speeds the clock up
 *    (scale >= 1), so it never lets a slow climber escape. The sim keys it on
 *    the LOWEST climbing player (simulation.ts `climbingLeadM`): in a duel the
 *    lava hunts the trailer, and the leader simply outruns the view. A peer's
 *    self-reported ghost height can never push the local lava above the
 *    local player's own solo curve (SEC-LAVA-1). It can still hold the local
 *    lava ABOVE the server's: when the peer really trails, the server keys
 *    the leash on the peer and its lava sits lower, and a high spoofed y
 *    withholds that, raising the local lava up to the solo curve
 *    (SEC-LAVA-11; the server-side fix is SEC-LAVA-9 in loop/learnings.md).
 *    Solo and daily have one climber, so min and max agree.
 *
 * The knobs are NOT independent below the kill threshold. While the curve
 * ramps, anyone faster than ~0.45× pulls ahead of it, and the leash erases
 * that lead. Measured flawless unaided play is ~0.55–0.62× ladder speed
 * (walking between ladders caps it), and at 0.50–0.62× the leash is engaged
 * for 36–46% of the run (26–46% before the creep). So the leash sets how far
 * most real runs get (curve alone → with leash: 0.50× 771 → 580 ft, 0.55×
 * 1244 → 697 ft, 0.60× 2143 → 982 ft, 0.62× 2754 → 1260 ft). Changing either
 * leash constant moves beginner reach as well as visibility; re-run
 * tests/game/hazardLeash.test.ts after touching any knob. Only the curve
 * (`endSpeedFrac`, `rampSeconds`, `creepPerMinute`, the cycle) decides who
 * could survive indefinitely: with the creep, nobody without power-ups.
 *
 * Measured through the real stepMatch (tests/game/hazardLeash.test.ts drives
 * a constant-pace climber on the free tower, 9 ft/s ladder, creep on; units
 * are 1:1 feet; the camera shows ~80 ft below the climber; "was" is the
 * curve before the leash):
 *
 *   pace (× ladder) | gap band after 30 s | caught at → peak
 *   0.45            | –                   | ~118 s → ~480 ft (was 296)
 *   0.50            | –                   | ~129 s → ~580 ft
 *   0.55            | –                   | ~141 s → ~697 ft (was 585)
 *   0.60            | –                   | ~182 s → ~982 ft (was 839)
 *   0.62            | –                   | ~226 s → ~1260 ft
 *   -- sustained paces above ~0.62× need power-ups (sprint, jetpack) --
 *   0.66            | –                   | ~362 s → ~2147 ft (never w/o creep)
 *   0.70            | ~24–88 ft           | not in 10 min (on the threshold)
 *   0.75            | ~37–92 ft           | never
 *   0.85            | ~48–101 ft          | never
 *   1.00            | ~56–111 ft          | never
 *   1.30 (jetpack)  | ~72–136 ft          | never (off screen while bursting)
 *
 * A full stall at 0.85 pace survives 8 s from any phase and ~10 s if it
 * starts as the lava stumbles; 20 s is always fatal. At the end of the ramp
 * the kill threshold moved from ~0.70× to ~0.64× ladder pace (0.45× climbers
 * get ~60% further, 0.55–0.60× ~17–19%), and the creep raises it back to
 * 0.70× so every unaided run ends. Unaided climbers have the lava in view for
 * the whole run after the opening and are eventually caught. The steady
 * 0.75–1.30× bands hold only while a power-up carries the climber above the
 * threshold.
 * The envelope never exceeds 1× the ladder climb rate (`MAX_HAZARD_SPEED_FRAC`),
 * so while the lowest climber's gap is within `HAZARD_LEASH_M` (50 ft; leash
 * scale 1) the lava never outruns a climber holding climb on a ladder (after
 * the cap a surge matches ladder speed; the gap opens only during stumbles).
 * Beyond `HAZARD_LEASH_M` the leash speeds the lava clock up to
 * `HAZARD_CATCHUP_MAX_SCALE`×, so there it does outrun a ladder climber until
 * the gap closes back to `HAZARD_LEASH_M`; that is the leash's job.
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
  /** Seconds over which the envelope ramps start → end (then creeps). */
  rampSeconds: number;
  /**
   * Late-game creep: after the ramp the envelope keeps rising by this much
   * (fraction of climb speed) per minute of hazard time, until it reaches
   * `MAX_HAZARD_SPEED_FRAC`, then holds. 0 = hold at `endSpeedFrac` forever
   * (the pre-creep curve, bit for bit). Negative or non-finite reads as 0: the
   * envelope never falls after the ramp.
   */
  creepPerMinute: number;
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
  // chase is 0.91 · (10/16 + 6/16·0.2) = 0.64× — the kill threshold when
  // the ramp ends (the creep below then raises it).
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
  // After the ramp the envelope creeps +0.02 per minute up to the 1× cap
  // (reached ~6.5 min in), so the time-averaged speed goes 0.64× → 0.70×.
  // 0.70× is above the best unaided pace (~0.55–0.62×), so every unaided run
  // ends; only power-ups extend one. hazard.test.ts pins both means.
  creepPerMinute: 0.02,
  stumblePeriodSeconds: 16,
  stumbleDurationSeconds: 6,
  stumbleSpeedFrac: 0.2,
  speedScale: 1,
};

/**
 * Leash length (metres above lava). At or under this lead the lava clock runs
 * at 1×; beyond it the clock speeds up so the lava rides about this far behind
 * the lowest climbing player. Chosen for visibility, but it also moves how far
 * sub-threshold runs get (see the header).
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

/** `creepPerMinute` is per minute of hazard time; the sim runs in seconds. */
const SECONDS_PER_MINUTE = 60;

/**
 * Time-averaged speed fraction over one surge/stumble cycle, at the envelope
 * reached `seconds` into the race (hazard time, grace included). Defaults to
 * the end of the ramp: 0.64× for the default tune, the kill threshold a
 * climber must beat when the ramp ends. Pass `Infinity` for the creep's
 * ceiling (the envelope held at `MAX_HAZARD_SPEED_FRAC`): 0.70× for the
 * default tune, reached ~395 s in.
 */
export function hazardMeanSpeedFrac(
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG,
  seconds: number = cfg.graceSeconds + Math.max(1e-6, cfg.rampSeconds)
): number {
  const env = envelopeAt(Math.max(0, seconds - cfg.graceSeconds), envelopeOf(cfg, 1));
  const { period, duration, speedFrac } = stumbleWindow(cfg);
  if (period <= 0 || duration <= 0) return env;
  const surgeDuty = (period - duration) / period;
  return env * (surgeDuty + (1 - surgeDuty) * speedFrac);
}

/**
 * Instantaneous rise-speed fraction at race-time (0 during the opening grace).
 * Envelope (ramp, creep, cap) × the current surge/stumble multiplier. The same
 * envelope `hazardHeightAt` integrates.
 */
export function hazardSpeedFracAt(
  seconds: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): number {
  const t = Math.max(0, seconds - cfg.graceSeconds);
  if (t <= 0) return 0;
  return Math.min(
    envelopeAt(t, envelopeOf(cfg, 1)) * stumbleMultiplier(t, cfg),
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

/**
 * The envelope, piecewise linear in post-grace time t, in `unit`s per second
 * (1 for a speed fraction, climb speed × speedScale for m/s):
 *
 *   ramp   0 ≤ t < ramp      v0 → v1 linearly
 *   creep  ramp ≤ t < capAt  v1 + creep · (t − ramp)
 *   cap    t ≥ capAt         cap (holds)
 *
 * `v0`, `v1` are the configured start/end clamped to the cap, exactly as the
 * pre-creep integral clamped them, so `creepPerMinute: 0` reproduces it.
 */
interface Envelope {
  ramp: number;
  v0: number;
  v1: number;
  /** (v1 − v0) / ramp. */
  accel: number;
  /** Rise of the envelope per second after the ramp (>= 0). */
  creep: number;
  cap: number;
  /** Post-grace time the creep reaches the cap; Infinity if it never does. */
  capAt: number;
}

function envelopeOf(cfg: HazardConfig, unit: number): Envelope {
  const ramp = Math.max(1e-6, cfg.rampSeconds);
  const v0 = Math.min(cfg.startSpeedFrac, MAX_HAZARD_SPEED_FRAC) * unit;
  const v1 = Math.min(cfg.endSpeedFrac, MAX_HAZARD_SPEED_FRAC) * unit;
  const cap = MAX_HAZARD_SPEED_FRAC * unit;
  const perMin = cfg.creepPerMinute;
  const creep =
    Number.isFinite(perMin) && perMin > 0 ? (perMin / SECONDS_PER_MINUTE) * unit : 0;
  let capAt = Infinity;
  if (!(v1 < cap)) capAt = ramp;
  else if (creep > 0) capAt = ramp + (cap - v1) / creep;
  return { ramp, v0, v1, accel: (v1 - v0) / ramp, creep, cap, capAt };
}

/** Envelope value at post-grace time t (see `Envelope`). */
function envelopeAt(t: number, e: Envelope): number {
  if (t < e.ramp) return e.v0 + ((e.v1 - e.v0) * t) / e.ramp;
  if (e.creep > 0) return Math.min(e.cap, e.v1 + e.creep * (t - e.ramp));
  return e.v1;
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
 * Walks surge/stumble intervals and integrates each against the piecewise
 * linear envelope in closed form (no tick sampling), which bit-stable
 * re-simulation relies on (AC-11).
 */
function integrateRise(
  t: number,
  climbSpeedM: number,
  cfg: HazardConfig
): number {
  if (t <= 0) return 0;
  const env = envelopeOf(cfg, climbSpeedM * cfg.speedScale);

  const { period, duration, speedFrac } = stumbleWindow(cfg);
  if (period <= 0 || duration <= 0) {
    return envelopeIntegral(0, t, env);
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
    dist += m * envelopeIntegral(t0, t1, env);
    t0 = t1 > t0 ? t1 : Math.min(t, t0 + 1e-9);
  }
  return dist;
}

/**
 * ∫ envelope speed dt over [t0, t1]. Splits at the ramp end and at the cap,
 * then integrates each linear piece exactly (trapezoid = exact for linear).
 */
function envelopeIntegral(t0: number, t1: number, e: Envelope): number {
  if (t1 <= t0) return 0;
  if (t0 < e.ramp && t1 > e.ramp) {
    return envelopeIntegral(t0, e.ramp, e) + envelopeIntegral(e.ramp, t1, e);
  }
  if (t0 < e.capAt && t1 > e.capAt) {
    return envelopeIntegral(t0, e.capAt, e) + envelopeIntegral(e.capAt, t1, e);
  }
  if (t1 <= e.ramp) {
    return e.v0 * (t1 - t0) + (e.accel / 2) * (t1 * t1 - t0 * t0);
  }
  if (t0 >= e.capAt) return e.cap * (t1 - t0);
  // Creep piece (ramp <= t0 < t1 <= capAt). With no creep this is exactly
  // the old hold: v1 · (t1 − t0).
  if (!(e.creep > 0)) return e.v1 * (t1 - t0);
  const a = t0 - e.ramp;
  const b = t1 - e.ramp;
  return e.v1 * (t1 - t0) + (e.creep / 2) * (b * b - a * a);
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
 * Leash: clock multiplier so the lava rides a fixed distance behind the
 * climber. The sim passes the LOWEST climbing player's lead (simulation.ts
 * `climbingLeadM`). Evaluated from the current lead every tick; it does not
 * latch.
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
