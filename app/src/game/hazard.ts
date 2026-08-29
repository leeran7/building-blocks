/**
 * Tower v3 "The Climb" — Rising Hazard.
 *
 * The rising hazard (lava / flood / collapsing floor) chases the climber upward
 * and supplies the Doodle-Jump "keep moving or you're caught" pressure. Its rise
 * speed is expressed as a FRACTION OF THE CLIMBER'S SPEED (the stack's ladder
 * climb rate), so the chase is always proportional to how fast you can move and
 * scales automatically across archetypes:
 *
 *   - it starts at `startSpeedFrac` of the climb speed and accelerates to
 *     `endSpeedFrac` over `rampSeconds`, then holds that top speed;
 *   - it begins `headStartM` BELOW the base, giving a fair opening buffer;
 *   - height is the integral of that speed over race-time, clamped to the stack.
 *
 * Because the speed is a fraction of the climb rate (< 1 early, approaching but
 * below 1), a climber who keeps moving upward stays ahead, while dawdling on a
 * floor — or long horizontal detours to the next ladder — lets the lava close in.
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
  /** Rise speed at race start, as a fraction of the climber's climb speed. */
  startSpeedFrac: number;
  /** Rise speed after the ramp, as a fraction of the climber's climb speed. */
  endSpeedFrac: number;
  /** Seconds over which the rise speed ramps start → end (then holds). */
  rampSeconds: number;
  /** Global speed multiplier — 1 = normal (knob for tuning + tests). */
  speedScale: number;
}

export const DEFAULT_HAZARD_CONFIG: HazardConfig = {
  headStartM: 9,
  graceSeconds: 5,
  // The tower is endless, so the lava must eventually OUTPACE the climb to
  // guarantee every run ends (peak height = score). After the grace it opens at
  // 42% of the climb speed and accelerates to 1.15× over ~78s, drawing level with
  // the climb at ~67s of race time — past that even a perfect vertical climber
  // cannot keep up, and traverses/jumps make it bite sooner.
  //
  // The opening pressure is deliberately a notch gentler than the terminal
  // speed: the endgame is what has to be unwinnable, not the first minute, so
  // the start/ramp are where to tune feel. endSpeedFrac is NOT free to lower —
  // it carries the run-must-end guarantee and the time-slow uptime bound in
  // `powerups.ts`, which `powerups.test.ts` asserts.
  startSpeedFrac: 0.42,
  endSpeedFrac: 1.15,
  rampSeconds: 78,
  speedScale: 1,
};

/**
 * Rising-hazard height (metres) at the given race-time.
 *
 * The hazard rises at v(t) = climbSpeed · frac(t) · speedScale, where frac ramps
 * linearly from startSpeedFrac to endSpeedFrac over rampSeconds and then holds.
 * Height is the integral of v from 0, offset by the head-start. There is no
 * upper bound — the stack is endless.
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
  const ramp = Math.max(1e-6, cfg.rampSeconds);
  const v0 = cfg.startSpeedFrac * climbSpeedM * cfg.speedScale;
  const v1 = cfg.endSpeedFrac * climbSpeedM * cfg.speedScale;

  let dist: number;
  if (t <= ramp) {
    // Linear accel v0 → v0 + (v1−v0)·t/ramp; integrate to get distance.
    dist = v0 * t + ((v1 - v0) * t * t) / (2 * ramp);
  } else {
    const rampDist = v0 * ramp + ((v1 - v0) * ramp) / 2;
    dist = rampDist + v1 * (t - ramp);
  }

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
