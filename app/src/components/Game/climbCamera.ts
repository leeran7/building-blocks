/**
 * Climb camera — world-to-view geometry used by the canvas and the SFX layer.
 *
 * The renderer eases toward this target so crate stairs do not hitch the view.
 * Audio uses the target (not the eased camera) so the "lava is on screen"
 * decision is a pure function of (player, hazard, canvas) and can be tested
 * without a ref. The ease lags by a fraction of a view; lava rise is slow
 * enough that the sting still lands on the frame the band becomes visible.
 *
 * Touch controls overlay the bottom of the canvas. Lava drawn only in that
 * overlay is not "shown" in the playable view, so threat fill is measured
 * above the overlay. Desktop has a zero inset, so the two coincide.
 */

import { TICK_DT } from "../../game/types";

export const CAMERA_FOCUS_FRAC = 0.62;
/** How fast the eased camera closes on the target each tick (1 = snap). */
export const CAMERA_FOLLOW = 0.3;
/**
 * Visual scale of the climb. Sprites (ladders, orbs, slabs, HUD) draw this
 * much larger. Width stays locked to the canvas: the view never pans.
 * Render-only — the simulation, scores and replays are in unscaled metres.
 */
export const GAME_DRAW_SCALE = 1.2;
/**
 * How much taller world height draws than width (ladders, floor gaps, and all
 * vertical motion including the camera). 1 keeps metres square on screen.
 */
export const WORLD_HEIGHT_STRETCH = 1;
/**
 * The climber alone draws at this scale (instead of GAME_DRAW_SCALE) so the
 * player reads clearly on a phone without shrinking the view any further.
 */
export const CLIMBER_DRAW_SCALE = 1.35;

export function climbView(
  width: number,
  height: number,
  towerWidthM: number
): ClimbView {
  const pxPerM = width > 0 && towerWidthM > 0 ? width / towerWidthM : 1;
  const pxPerMY = pxPerM * WORLD_HEIGHT_STRETCH;
  const viewH = pxPerMY > 0 ? height / pxPerMY : 0;
  return { pxPerM, pxPerMY, viewH };
}

/**
 * Half-height of the airborne dead band, as a fraction of the view. A normal
 * or super jump stays inside it, so the camera holds still instead of riding
 * every arc up and back down. A long fall leaves it and the camera follows.
 */
export const CAMERA_AIR_BAND_FRAC = 0.12;

/**
 * Fastest the camera closes the gap left by a hold, in metres/second. Only
 * the gap is rate-limited: a supported climber's own motion (ladder, jetpack,
 * replay at 4x) moves the focus one-for-one, so the climber never drifts.
 */
export const CAMERA_CATCHUP_MPS = 25;

/**
 * The height the camera frames.
 *
 * Supported (ground, ladder, jetpack thrust): follows the climber's motion
 * exactly, and shrinks any leftover gap by at most `maxStepM` this frame.
 * Airborne: holds, and only moves once the climber leaves the ±band around
 * it, dragging the edge of the band along. The gap therefore never exceeds
 * the band, so switching between the two never lurches.
 */
export function cameraFocusY(
  prevFocusY: number | null,
  prevPlayerY: number | null,
  playerY: number,
  supported: boolean,
  bandM: number,
  maxStepM: number
): number {
  if (prevFocusY === null || prevPlayerY === null) return playerY;
  if (supported) {
    const gap = prevFocusY - prevPlayerY;
    const step = maxStepM > 0 ? maxStepM : 0;
    return playerY + gap - Math.max(-step, Math.min(step, gap));
  }
  return Math.min(playerY + bandM, Math.max(playerY - bandM, prevFocusY));
}

/**
 * World-Y of the bottom of the view if the camera snapped to the climber.
 * `bottomInsetPx` is the touch-control overlay; the camera sits that far
 * below the base so the climber is never hidden behind the buttons.
 */
export function cameraTargetY(
  playerY: number,
  viewH: number,
  bottomInsetPx: number,
  pxPerM: number
): number {
  const insetM = pxPerM > 0 ? bottomInsetPx / pxPerM : 0;
  const floor = insetM > 0 ? -insetM : 0;
  return Math.max(floor, playerY - viewH * (1 - CAMERA_FOCUS_FRAC));
}

/**
 * Fraction of the uncovered view (above the bottom overlay) filled by lava.
 *
 * 0 — the lava line is still below the overlay (or off the bottom of the
 *     canvas on desktop).
 * 1 — lava has eaten the whole playable view.
 */
export function lavaThreatFill(
  hazardY: number,
  camWorldY: number,
  viewH: number,
  bottomInsetM: number
): number {
  const inset = bottomInsetM > 0 ? bottomInsetM : 0;
  const visibleH = viewH - inset;
  if (visibleH <= 0) return 0;
  const visibleBottom = camWorldY + inset;
  const shown = Math.min(visibleH, Math.max(0, hazardY - visibleBottom));
  return shown / visibleH;
}

export function isLavaThreatening(fill: number): boolean {
  return fill > 0;
}

/**
 * Ease the camera toward `target`. Snaps on a new run, a seek, or a gap
 * bigger than half a view (respawn).
 *
 * CAMERA_FOLLOW is the fraction closed per TICK_DT, so the ease is rescaled to
 * the frame's own elapsed time: the camera then lags by the same wall-clock
 * amount on a 60 Hz and a 144 Hz display. Applying it raw per frame made the
 * follow twice as tight on a 120 Hz panel as the feel was tuned for.
 */
export function followCamY(
  current: number | null,
  target: number,
  viewH: number,
  dtSec: number,
  snap: boolean
): number {
  if (current === null || snap) return target;
  const err = target - current;
  if (Math.abs(err) > viewH * 0.55) return target;
  if (!(dtSec > 0)) return current;
  const closed = 1 - Math.pow(1 - CAMERA_FOLLOW, dtSec / TICK_DT);
  return current + err * closed;
}

export interface ClimbView {
  /** Horizontal pixels per tower metre (tower width fills the canvas). */
  pxPerM: number;
  /** Vertical pixels per tower metre: pxPerM stretched by WORLD_HEIGHT_STRETCH. */
  pxPerMY: number;
  /** Vertical metres visible on the canvas. */
  viewH: number;
}
