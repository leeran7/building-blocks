"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/**
 * Responsive canvas dimensions for the climb game.
 *
 * Fills the wrapper's parent box — width and height — so the play surface can
 * occupy the whole viewport (or a fullscreen overlay stage). The wrapper
 * itself is typically `absolute inset-0`, so its own size is driven by the
 * parent; reading the parent keeps that axis out of a feedback loop.
 *
 * Visible tower metres are `(height / width) * tower.widthM`. That varies with
 * the device aspect ratio, which is the cost of mapping the tower across the
 * full screen instead of letterboxing a locked 9:16 play area.
 */
export function useCanvasSize(
  wrapperRef: RefObject<HTMLElement | null>,
  { maxWidth }: UseCanvasSizeOptions = {}
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>(BASE_SIZE);

  const measure = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const parent = el.parentElement ?? el;
    const next = fitCanvas({
      availableWidth: parent.clientWidth,
      availableHeight: parent.clientHeight,
      maxWidth,
    });
    // Bail out when nothing moved: the ResizeObserver below also fires for the
    // height change our own resize causes, which would otherwise never settle.
    setSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next
    );
  }, [wrapperRef, maxWidth]);

  useLayoutEffect(() => {
    measure();

    const el = wrapperRef.current;
    const observer = new ResizeObserver(measure);
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
  /** Optional cap on canvas width. Omit to fill the parent. */
  maxWidth?: number;
}

/** Server-render / pre-measurement size; replaced on mount by the parent box. */
const BASE_SIZE: CanvasSize = { width: 360, height: 640 };

/**
 * Canvas filling the given box, exported for unit tests.
 *
 * Height is the binding constraint when it would overflow: a canvas taller
 * than its parent drags the touch controls overlaid on it off screen.
 */
export function fitCanvas({
  availableWidth,
  availableHeight: availHeight,
  maxWidth,
}: {
  availableWidth: number;
  availableHeight: number;
  maxWidth?: number;
}): CanvasSize {
  const boxWidth = finite(availableWidth);
  const boxHeight = finite(availHeight);

  let width = boxWidth;
  if (maxWidth !== undefined) width = Math.min(width, finite(maxWidth));
  width = Math.min(width, boxWidth);

  return { width: Math.floor(width), height: Math.floor(boxHeight) };
}

/** Non-finite or negative measurements collapse to 0 rather than propagating. */
function finite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
