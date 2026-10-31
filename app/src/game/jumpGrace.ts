/**
 * Jump timing grace shared by the simulation and input validation, so the
 * validator lets through exactly the late jumps the engine will launch.
 * Pure: no imports beyond types.
 */

import type { PlayerState } from "./types";

/**
 * Late-jump grace ("coyote time"): a jump pressed this many ticks after the
 * feet walk off an edge still launches from the ground. At 1.3x speed the
 * climber crosses a hole's edge in one tick, so a press a moment late did
 * nothing and the climber dropped into the hole.
 */
export const COYOTE_TICKS = 5;

/**
 * Early-jump grace (jump buffer): a jump tapped up to this many ticks before
 * the feet land fires on landing. A quick tap still in the air was lost, so
 * hopping crate to crate or hole to hole stalled against the next crate.
 */
export const JUMP_BUFFER_TICKS = 5;

/** The feet left the ground (not by jumping) within COYOTE_TICKS of `tick`, and are not rising. */
export function inCoyoteWindow(p: PlayerState, tick: number): boolean {
  return (
    !p.onGround &&
    !p.onLadder &&
    p.vy <= 0 &&
    p.groundedTick !== null &&
    tick - p.groundedTick <= COYOTE_TICKS
  );
}
