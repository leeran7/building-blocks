"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Responsive canvas dimensions for the climb game.
 *
 * Measures the space the canvas actually has — its container's width and the
 * distance from its top edge to the bottom of the viewport — instead of
 * guessing with a viewport fraction. On a phone that difference is the whole
 * ballgame: the old `innerHeight * 0.58` budget shrank the canvas to ~226x402
 * on a 390x844 screen, well under the 360x640 desktop baseline.
 *
 * The 9:16 play area is locked. Visible tower metres are `(height / width) *
 * tower.widthM`, so a device-dependent aspect ratio would let tall screens see
 * further ahead — a real edge on a shared leaderboard. Only the pixel scale
 * changes between devices, never how much world you can see.
 */
export function useCanvasSize(
  containerRef: RefObject<HTMLElement | null>,
  { reserveBelow = 0, maxWidth = MAX_WIDTH }: UseCanvasSizeOptions = {}
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>(BASE_SIZE);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = fitCanvas({
      availableWidth: el.clientWidth,
      availableHeight: availableHeight(el, reserveBelow),
      maxWidth,
    });
    // Bail out when nothing moved: the ResizeObserver below also fires for the
    // height change our own resize causes, which would otherwise never settle.
    setSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next
    );
  }, [containerRef, reserveBelow, maxWidth]);

  useEffect(() => {
    measure();

    const el = containerRef.current;
    const observer = new ResizeObserver(measure);
    if (el) observer.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // Mobile browser chrome collapsing on scroll changes the usable height.
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [measure, containerRef]);

  return size;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface UseCanvasSizeOptions {
  /** Vertical px to keep free below the canvas (touch controls, breathing room). */
  reserveBelow?: number;
  /** Upper bound on canvas width, so the game stays playable on a wide monitor. */
  maxWidth?: number;
}

/** Locked play-area aspect ratio — see the note on useCanvasSize. */
const ASPECT = 360 / 640;
/** Server-render / pre-measurement size; also the historical desktop size. */
const BASE_SIZE: CanvasSize = { width: 360, height: 640 };
/**
 * A sanity guard against a degenerate canvas, not a comfortable minimum. It is
 * kept this low on purpose: a floor overrides the height budget, and a canvas
 * taller than the viewport drags the touch controls overlaid on it off screen.
 * Fitting the viewport wins; a cramped canvas means the layout owes the game
 * more room, which is not something this function can fix.
 */
const MIN_WIDTH = 120;
const MAX_WIDTH = 560;
/** Keeps the canvas off the very bottom edge of the viewport. */
const EDGE_MARGIN = 12;

/** Usable height from the container's top edge down to the viewport bottom. */
function availableHeight(el: HTMLElement, reserveBelow: number): number {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  // Viewport-relative, clamped: a container scrolled above the fold would
  // otherwise report a negative top and inflate the budget.
  const top = Math.max(0, el.getBoundingClientRect().top);
  return viewportHeight - top - reserveBelow - EDGE_MARGIN;
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
  let width = Math.min(availableWidth, maxWidth);
  if (availHeight > 0) width = Math.min(width, availHeight * ASPECT);
  width = Math.max(width, MIN_WIDTH);
  // Applied last: a canvas wider than its container is silently clipped by the
  // viewport, which is what made an earlier "make it bigger" change invisible.
  width = Math.min(width, availableWidth);
  const rounded = Math.round(width);
  return { width: rounded, height: Math.round(rounded / ASPECT) };
}
