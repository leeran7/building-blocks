import { useRef, type TouchEvent } from "react";
import { animate, useMotionValue } from "motion/react";
import { prefersReducedMotion } from "../lib/motion";
import { duration, ease, spring, travel } from "../lib/motionTokens";

/** Touches this close to the left edge belong to the screen's swipe-back. */
const EDGE_PX = 28;
/** How far (px) a panel must be dragged to step to its neighbour. */
const STEP_PX = 64;
const FLICK_VELOCITY = 0.55;
/** Past the first or last panel the content gives a little, then springs back. */
const RUBBER = 0.3;

export interface SideSwipe {
  /** Whether there is a panel `step` away (1 the next one, to the right; -1 the previous). */
  canStep: (step: 1 | -1) => boolean;
  /** Move to the panel `step` away. */
  step: (step: 1 | -1) => void;
}

/**
 * Content that swaps in place along a left-to-right row of panels (Ranks'
 * Global | Friends and All-time | Today): the new content slides in from the
 * side the row moved toward, the same axis as the tabs above it. With `swipe`, the content also follows a sideways
 * finger and steps to its neighbour when let go far enough (or flicked).
 *
 * Spread `bind` on the content wrapper and give it `style={{ x, opacity, touchAction: "pan-y" }}`.
 */
export function useSlideSwap(swipe?: SideSwipe) {
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  /**
   * Swap the content with `apply`, the new content arriving from side `from`
   * (1 the right). The swap itself is immediate, so the tabs and the content
   * never disagree; only the arrival is animated.
   */
  const slide = (from: 1 | -1, apply: () => void) => {
    apply();
    if (prefersReducedMotion()) {
      x.set(0);
      opacity.set(1);
      return;
    }
    x.set(from * travel.screen);
    opacity.set(0);
    void animate(x, 0, spring.smooth);
    void animate(opacity, 1, { duration: duration.fast, ease: ease.out });
  };

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const axis = useRef<"none" | "h" | "v">("none");
  const lastX = useRef(0);
  const lastT = useRef(0);
  const vel = useRef(0);

  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    const t = e.touches[0];
    if (!swipe || t.clientX <= EDGE_PX) return;
    tracking.current = true;
    startX.current = t.clientX;
    startY.current = t.clientY;
    lastX.current = 0;
    lastT.current = Date.now();
    vel.current = 0;
    axis.current = "none";
  };

  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    if (!swipe || !tracking.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // The list scrolls up and down: only a clearly sideways move is a swipe.
      axis.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    }
    if (axis.current !== "h") return;
    const next = swipe.canStep(dx < 0 ? 1 : -1) ? dx : dx * RUBBER;
    const now = Date.now();
    const gap = now - lastT.current;
    if (gap > 0) vel.current = (next - lastX.current) / gap;
    lastX.current = next;
    lastT.current = now;
    x.set(next);
  };

  const onTouchEnd = () => {
    if (!swipe || !tracking.current) return;
    tracking.current = false;
    const wasHorizontal = axis.current === "h";
    axis.current = "none";
    if (!wasHorizontal) return;
    const dragged = lastX.current;
    const step: 1 | -1 = dragged < 0 ? 1 : -1;
    const flick = Math.abs(vel.current) > FLICK_VELOCITY && Math.abs(dragged) > 24 && vel.current * dragged > 0;
    if (swipe.canStep(step) && (Math.abs(dragged) > STEP_PX || flick)) {
      slide(step, () => swipe.step(step));
      return;
    }
    if (prefersReducedMotion()) x.set(0);
    else void animate(x, 0, spring.bouncy);
  };

  return {
    x,
    opacity,
    slide,
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  };
}
