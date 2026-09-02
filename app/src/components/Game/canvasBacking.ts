/**
 * Canvas backing-store sizing.
 *
 * ClimbCanvas's draw effect depends on `state`, so it runs every tick. Assigning
 * `canvas.width` or `canvas.height` reallocates and zeroes the bitmap even when
 * the number is unchanged — cheap at 360×640, ruinous at the 2560px cap. These
 * helpers are the decision that assignment is gated on: they live outside the
 * component so the "do not resize if the size is the same" rule can be tested
 * without a 2D context.
 */

/**
 * Backing-store scale.
 *
 * Clamped to 2 rather than using devicePixelRatio raw. The scene is drawn from
 * simple vector primitives, so past 2× there is nothing more to resolve, while
 * a 3× phone would make the buffer 2.25× larger than a 2× one — and the buffer
 * is already the largest allocation in the game at wide widths.
 */
export function clampDevicePixelRatio(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(2, Math.max(1, dpr));
}

export function backingStoreSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number
): { width: number; height: number } {
  const scale = clampDevicePixelRatio(dpr);
  return {
    width: Math.round(cssWidth * scale),
    height: Math.round(cssHeight * scale),
  };
}

/**
 * True when assigning canvas.width/height would change the bitmap.
 *
 * The comparison is on the integer backing size, not the CSS size: a 1px CSS
 * change that rounds to the same backing pixel must not reallocate.
 */
export function canvasNeedsResize(
  currentWidth: number,
  currentHeight: number,
  targetWidth: number,
  targetHeight: number
): boolean {
  return currentWidth !== targetWidth || currentHeight !== targetHeight;
}
