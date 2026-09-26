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

export function climbView(
  width: number,
  height: number,
  towerWidthM: number
): ClimbView {
  const pxPerM = width > 0 && towerWidthM > 0 ? width / towerWidthM : 1;
  const viewH = pxPerM > 0 ? height / pxPerM : 0;
  return { pxPerM, viewH };
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
  /** Pixels per tower metre. */
  pxPerM: number;
  /** Vertical metres visible on the canvas. */
  viewH: number;
}
