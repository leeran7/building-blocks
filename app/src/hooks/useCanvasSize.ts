"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Responsive canvas dimensions for the climb game.
 *
 * Measures the space the canvas actually has — the width of its container and
 * the height between its own top edge and the bottom of the scrolling area it
 * lives in — instead of guessing with a viewport fraction. On a phone that
 * difference is the whole ballgame: an `innerHeight * 0.58` budget shrank the
 * canvas to 167x297 on a 390x664 viewport, well under the 360x640 baseline.
 *
 * Pass a ref to the element that *wraps the canvas itself*, not to an ancestor.
 * The budget starts at that element's top edge, so anything rendered between an
 * ancestor's top and the canvas (a status banner, say) would otherwise be left
 * out of the budget and push the canvas off the bottom of the screen.
 *
 * The 9:16 play area is locked. Visible tower metres are `(height / width) *
 * tower.widthM`, so a device-dependent aspect ratio would let tall screens see
 * further ahead — a real edge if those scores shared a ranking. Mobile
 * (fill-stage) and desktop (9:16) therefore rank on separate boards
 * (`src/game/climbBoard.ts`). Only the pixel scale changes between devices of
 * the same board, never how much world you can see.
 */
export function useCanvasSize(
  wrapperRef: RefObject<HTMLElement | null>,
  { maxWidth = MAX_WIDTH, fill = false }: UseCanvasSizeOptions = {}
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>(BASE_SIZE);

  const measure = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // Fill mode (touch / iOS-first): the canvas owns the whole viewport as a
    // full-bleed stage, so it matches the device aspect exactly — no 9:16 lock
    // and no max width. The safe-area insets are handled by the overlaid HUD and
    // controls, not by shrinking the canvas, so it truly reaches every edge.
    const next = fill
      ? fillCanvas({
          availableWidth: viewportWidth(),
          availableHeight: viewportHeight(),
        })
      : fitCanvas({
          // The wrapper's own width is driven by what we return, so read the
          // width from its parent to keep that axis out of the feedback loop.
          availableWidth: (el.parentElement ?? el).clientWidth,
          availableHeight: availableHeight(el),
          maxWidth,
        });
    // Bail out when nothing moved: the ResizeObserver below also fires for the
    // height change our own resize causes, which would otherwise never settle.
    setSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next
    );
  }, [wrapperRef, maxWidth, fill]);

  useEffect(() => {
    measure();

    const el = wrapperRef.current;
    const observer = new ResizeObserver(measure);
    // Observing the parent catches layout shifts above the canvas (a banner
    // appearing) without reacting to the canvas's own height.
    const observed = el?.parentElement ?? el;
    if (observed) observer.observe(observed);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // Mobile browser chrome collapsing changes the usable height.
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [measure, wrapperRef]);

  return size;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface UseCanvasSizeOptions {
  /** Upper bound on canvas width, so the game stays playable on a wide monitor. */
  maxWidth?: number;
  /**
   * Full-bleed stage mode: the canvas fills the whole viewport and matches the
   * device aspect (no 9:16 lock, no max width). Used on touch devices where the
   * game runs edge-to-edge; desktop stays framed with the default fit path.
   */
  fill?: boolean;
}

/** Locked play-area aspect ratio — see the note on useCanvasSize. */
const ASPECT = 360 / 640;
/** Server-render / pre-measurement size; also the historical desktop size. */
const BASE_SIZE: CanvasSize = { width: 360, height: 640 };
/**
 * Sanity guard against a degenerate canvas, not a comfortable minimum: it is
 * clamped to the height budget below, because a canvas taller than the viewport
 * drags the touch controls overlaid on it off screen.
 */
const MIN_WIDTH = 120;
const MAX_WIDTH = 2560;
/** Keeps the canvas off the very bottom edge of the viewport. */
const EDGE_MARGIN = 12;

/**
 * Usable height from the element's top edge down to the bottom of the viewport.
 *
 * Adding the scroll offset back makes this the element's position on the page,
 * so the budget does not change as the player scrolls. Without that, the size
 * would latch to whatever the scroll offset happened to be the last time a
 * resize fired, and a canvas sized while scrolled down overflows at the top.
 *
 * Inside a fixed-position subtree there is no scrolling to correct for and the
 * viewport-relative top is already the right answer.
 */
function availableHeight(el: HTMLElement): number {
  const top = el.getBoundingClientRect().top + (isFixed(el) ? 0 : window.scrollY);
  return viewportHeight() - top - EDGE_MARGIN;
}

/** Excludes a pinch-zoomed visualViewport, which would report a tiny height. */
function viewportHeight(): number {
  const vv = window.visualViewport;
  return vv && vv.scale === 1 ? vv.height : window.innerHeight;
}

/** Width counterpart to viewportHeight, ignoring a pinch-zoom scale. */
function viewportWidth(): number {
  const vv = window.visualViewport;
  return vv && vv.scale === 1 ? vv.width : window.innerWidth;
}

function isFixed(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).position === "fixed") return true;
  }
  return false;
}

/** Largest 9:16 canvas fitting the given box, exported for unit tests. */
export function fitCanvas({
  availableWidth,
  availableHeight: availHeight,
  maxWidth = MAX_WIDTH,
}: {
  availableWidth: number;
  availableHeight: number;
  maxWidth?: number;
}): CanvasSize {
  const boxWidth = finite(availableWidth);
  const boxHeight = finite(availHeight);
  // Fitting the height wins over the floor: overflowing the viewport would take
  // the touch controls overlaid on the canvas off screen with it.
  const heightBound = boxHeight * ASPECT;
  const floor = Math.min(MIN_WIDTH, heightBound);

  let width = Math.min(boxWidth, finite(maxWidth), heightBound);
  width = Math.max(width, floor);
  // Applied last: a canvas wider than its container is silently clipped, which
  // is what made an earlier "make it bigger" change invisible on a phone.
  width = Math.min(width, boxWidth);

  // Floored, not rounded: rounding up could put the height a pixel past the
  // budget, and the budget is a hard limit rather than a target.
  const floored = Math.floor(width);
  return { width: floored, height: Math.floor(floored / ASPECT) };
}

/**
 * Device-matched canvas that fills the box exactly (touch full-bleed stage).
 * Unlike fitCanvas there is no aspect lock and no max width: the whole viewport
 * is the play area. Exported for unit tests. Non-finite / non-positive
 * measurements collapse to the base size rather than propagating a bad value.
 */
export function fillCanvas({
  availableWidth,
  availableHeight: availHeight,
}: {
  availableWidth: number;
  availableHeight: number;
}): CanvasSize {
  const width = finite(availableWidth);
  const height = finite(availHeight);
  if (width === 0 || height === 0) return BASE_SIZE;
  return { width: Math.floor(width), height: Math.floor(height) };
}

/** Non-finite or negative measurements collapse to 0 rather than propagating. */
function finite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
