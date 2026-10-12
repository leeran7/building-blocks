/**
 * Canvas size for a portal iframe.
 *
 * The visible tower is `(height / width) * tower.widthM` metres tall, so a
 * landscape canvas would show only a sliver of the climb. Landscape and square
 * frames (821x462 on CrazyGames desktop) get a full-height 9:16 column with the
 * HUD spread across the whole frame; a tall portrait frame (a phone) is used
 * edge to edge.
 */

export const PLAY_ASPECT = 9 / 16;
/** Taller than this (height / width) and the canvas fills the frame. */
export const FILL_MIN_TALLNESS = 16 / 9;
const MIN_SIDE = 120;

export interface PortalCanvas {
  width: number;
  height: number;
  /** The canvas covers the whole frame (no column, no border). */
  fill: boolean;
}

export function portalCanvasSize(frameWidth: number, frameHeight: number): PortalCanvas {
  const w = Number.isFinite(frameWidth) && frameWidth > 0 ? Math.floor(frameWidth) : 0;
  const h = Number.isFinite(frameHeight) && frameHeight > 0 ? Math.floor(frameHeight) : 0;
  if (w === 0 || h === 0) return { width: 360, height: 640, fill: false };
  if (h / w >= FILL_MIN_TALLNESS) return { width: w, height: h, fill: true };
  const width = Math.max(Math.min(w, MIN_SIDE), Math.min(w, Math.floor(h * PLAY_ASPECT)));
  return { width, height: h, fill: false };
}
