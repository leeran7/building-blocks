import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * Swipe-down-to-dismiss for a bottom sheet (the grab handle's promise).
 *
 * A drag from the element marked `data-swipe-handle` (the handle and header)
 * always moves the sheet. A drag from anywhere else moves it only when it goes
 * down and the content under the finger is scrolled to the top, so inner
 * scrolling keeps working. A drag that starts on a button, link or field never
 * moves the sheet: taps and accordions behave as before.
 *
 * The sheet follows the finger by `transform` only; the scrim fades with the
 * drag. On release `shouldDismiss` decides: slide out and call `onDismiss`, or
 * spring back. Reduced motion skips both animations.
 */

/** Past this far down (or SWIPE_DISMISS_FRACTION of the sheet, if less), a release dismisses. */
export const SWIPE_DISMISS_DISTANCE_PX = 120;
/** Share of the sheet's height that dismisses, when that is less than the distance above. */
export const SWIPE_DISMISS_FRACTION = 0.3;
/** A short sheet still needs at least this much drag to dismiss without a flick. */
export const SWIPE_DISMISS_MIN_PX = 64;
/** A release moving down at least this fast (px/ms) is a flick and dismisses. */
export const SWIPE_FLICK_VELOCITY = 0.5;
/** A flick must still have moved the sheet this far, so a jittery tap never dismisses. */
export const SWIPE_FLICK_MIN_PX = 24;
/** Movement before a press becomes a drag (or is let go as a scroll or tap). */
export const SWIPE_SLOP_PX = 6;
/** The most an upward drag can lift the sheet (rubber band). */
export const SWIPE_UPWARD_MAX_PX = 32;
/** Release velocity is measured over the last this many ms of movement. */
const VELOCITY_WINDOW_MS = 100;
/** Samples closer together than this give no usable velocity. */
const MIN_VELOCITY_DT_MS = 8;
export const SWIPE_OUT_MS = 200;
export const SWIPE_BACK_MS = 260;
/** Fallback in case transitionend never fires (hidden tab, zero-size sheet). */
const TRANSITION_GRACE_MS = 60;

/** The handle and header: a drag from here always moves the sheet. */
export const SWIPE_HANDLE_ATTR = "data-swipe-handle";

/** Presses on these never start a drag. */
const INTERACTIVE =
  'button, a[href], input, select, textarea, label, summary, [role="button"], [role="slider"], [contenteditable="true"], [data-swipe-ignore]';

/** The distance a release must reach to dismiss, for a sheet this tall. */
export function dismissDistance(height: number): number {
  if (!(height > 0) || !Number.isFinite(height)) return SWIPE_DISMISS_DISTANCE_PX;
  return Math.max(SWIPE_DISMISS_MIN_PX, Math.min(SWIPE_DISMISS_DISTANCE_PX, height * SWIPE_DISMISS_FRACTION));
}

/**
 * Whether a release dismisses the sheet. `dy` is the drag distance in px
 * (positive = down), `velocity` the release speed in px/ms (positive = down),
 * `height` the sheet's height in px. An upward drag, or a flick back up, never
 * dismisses; neither does any non-finite input.
 */
export function shouldDismiss({ dy, velocity, height }: { dy: number; velocity: number; height: number }): boolean {
  if (!Number.isFinite(dy) || !Number.isFinite(velocity) || !(dy > 0)) return false;
  if (velocity <= -SWIPE_FLICK_VELOCITY) return false;
  if (dy >= dismissDistance(height)) return true;
  return velocity >= SWIPE_FLICK_VELOCITY && dy >= SWIPE_FLICK_MIN_PX;
}

/** Where the sheet sits for a drag of `dy`: 1:1 down, resisted and capped up. */
export function dragOffset(dy: number): number {
  if (!Number.isFinite(dy)) return 0;
  if (dy >= 0) return dy;
  const up = -dy;
  return -(up * SWIPE_UPWARD_MAX_PX) / (up + SWIPE_UPWARD_MAX_PX);
}

type Phase = "idle" | "pending" | "dragging" | "settling";

interface Track {
  phase: Phase;
  pointerId: number;
  fromHandle: boolean;
  startX: number;
  startY: number;
  lastY: number;
  samples: { y: number; t: number }[];
}

const IDLE: Track = { phase: "idle", pointerId: -1, fromHandle: false, startX: 0, startY: 0, lastY: 0, samples: [] };

/** True when an element between the target and the sheet (inclusive) is scrolled down. */
function scrolledAbove(target: Element, sheet: HTMLElement): boolean {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
    if (el === sheet) return false;
  }
  return false;
}

function releaseVelocity(samples: { y: number; t: number }[]): number {
  const last = samples[samples.length - 1];
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS);
  if (!last || !first) return 0;
  const dt = last.t - first.t;
  return dt < MIN_VELOCITY_DT_MS ? 0 : (last.y - first.y) / dt;
}

export interface SwipeDismiss<S extends HTMLElement, B extends HTMLElement> {
  sheetRef: React.RefObject<S | null>;
  /** Optional: an element whose opacity fades as the sheet is dragged away. */
  scrimRef: React.RefObject<B | null>;
  /** Spread onto the sheet element. */
  sheetHandlers: {
    onPointerDown: (e: ReactPointerEvent<S>) => void;
    onPointerMove: (e: ReactPointerEvent<S>) => void;
    onPointerUp: (e: ReactPointerEvent<S>) => void;
    onPointerCancel: (e: ReactPointerEvent<S>) => void;
    onLostPointerCapture: (e: ReactPointerEvent<S>) => void;
  };
}

export function useSwipeDismiss<S extends HTMLElement = HTMLDivElement, B extends HTMLElement = HTMLElement>({
  onDismiss,
  disabled = false,
}: {
  /** The sheet's own close path; called at most once per mounted sheet. */
  onDismiss: () => void;
  /** While true (e.g. a save in flight), presses never start a drag. */
  disabled?: boolean;
}): SwipeDismiss<S, B> {
  const sheetRef = useRef<S | null>(null);
  const scrimRef = useRef<B | null>(null);
  const track = useRef<Track>(IDLE);
  const dismissed = useRef(false);
  /** Stops waiting on the running settle (slide out or spring back) without finishing it. */
  const cancelSettle = useRef<(() => void) | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const paint = (offset: number, transition: string) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const height = sheet.getBoundingClientRect().height;
    sheet.style.transition = transition;
    sheet.style.transform = `translateY(${offset}px)`;
    const scrim = scrimRef.current;
    if (scrim) {
      scrim.style.transition = transition.replace("transform", "opacity");
      const progress = height > 0 ? Math.min(1, Math.max(0, offset / height)) : 0;
      scrim.style.opacity = String(1 - progress);
    }
  };

  const reset = () => {
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = "";
      sheet.style.transform = "";
      sheet.style.willChange = "";
    }
    const scrim = scrimRef.current;
    if (scrim) {
      scrim.style.transition = "";
      scrim.style.opacity = "";
    }
  };

  /** Run `done` once the sheet's transform transition ends (or its time is up). */
  const afterTransition = (ms: number, done: () => void) => {
    cancelSettle.current?.();
    const sheet = sheetRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function stop() {
      clearTimeout(timer);
      sheet?.removeEventListener("transitionend", onEnd);
      cancelSettle.current = null;
    }
    function finish() {
      stop();
      done();
    }
    function onEnd(e: TransitionEvent) {
      if (e.target === sheet && e.propertyName === "transform") finish();
    }
    sheet?.addEventListener("transitionend", onEnd);
    timer = setTimeout(finish, ms + TRANSITION_GRACE_MS);
    cancelSettle.current = stop;
  };

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    track.current = { ...IDLE, phase: "settling" };
    if (prefersReducedMotion()) {
      onDismissRef.current();
      return;
    }
    const sheet = sheetRef.current;
    const easing = `transform ${SWIPE_OUT_MS}ms cubic-bezier(0.4,0,1,1)`;
    if (sheet) {
      sheet.style.transition = easing;
      sheet.style.transform = "translateY(100%)";
    }
    const scrim = scrimRef.current;
    if (scrim) {
      scrim.style.transition = easing.replace("transform", "opacity");
      scrim.style.opacity = "0";
    }
    afterTransition(SWIPE_OUT_MS, () => onDismissRef.current());
  };

  const springBack = () => {
    if (prefersReducedMotion()) {
      reset();
      track.current = IDLE;
      return;
    }
    track.current = { ...IDLE, phase: "settling" };
    paint(0, `transform ${SWIPE_BACK_MS}ms cubic-bezier(0.16,1,0.3,1)`);
    afterTransition(SWIPE_BACK_MS, () => {
      reset();
      if (track.current.phase === "settling") track.current = IDLE;
    });
  };

  /** Whether a move of (dx, dy) from the press turns it into a sheet drag. */
  const wantsDrag = (dx: number, dy: number): boolean => {
    const t = track.current;
    const sheet = sheetRef.current;
    if (t.phase !== "pending" || !sheet || Math.abs(dy) <= Math.abs(dx)) return false;
    // The body only drags down; pointerdown already refused a scrolled card.
    return t.fromHandle || dy > 0;
  };

  const onPointerDown = (e: ReactPointerEvent<S>) => {
    const sheet = sheetRef.current;
    const target = e.target;
    if (disabledRef.current || dismissed.current || !sheet || !(target instanceof Element)) return;
    if (track.current.phase !== "idle" || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const interactive = target.closest(INTERACTIVE);
    if (interactive && sheet.contains(interactive)) return;
    const handle = target.closest(`[${SWIPE_HANDLE_ATTR}]`);
    const fromHandle = handle !== null && sheet.contains(handle);
    if (!fromHandle && scrolledAbove(target, sheet)) return;
    track.current = {
      phase: "pending",
      pointerId: e.pointerId,
      fromHandle,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      samples: [{ y: e.clientY, t: performance.now() }],
    };
  };

  const onPointerMove = (e: ReactPointerEvent<S>) => {
    const t = track.current;
    if (e.pointerId !== t.pointerId || (t.phase !== "pending" && t.phase !== "dragging")) return;
    const dx = e.clientX - t.startX;
    const dy = e.clientY - t.startY;
    if (t.phase === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_SLOP_PX) return;
      if (!wantsDrag(dx, dy)) {
        // A scroll, or a sideways swipe: not ours.
        track.current = IDLE;
        return;
      }
      const sheet = sheetRef.current;
      if (!sheet) return;
      try {
        sheet.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; pointerup/cancel still end the drag.
      }
      // The entry animation (fill-mode both) would otherwise override the inline transform.
      sheet.style.animation = "none";
      sheet.style.willChange = "transform";
      if (scrimRef.current) scrimRef.current.style.animation = "none";
      t.phase = "dragging";
    }
    const now = performance.now();
    t.lastY = e.clientY;
    t.samples.push({ y: e.clientY, t: now });
    while (t.samples.length > 2 && now - t.samples[0].t > VELOCITY_WINDOW_MS) t.samples.shift();
    paint(dragOffset(dy), "none");
  };

  const onPointerUp = (e: ReactPointerEvent<S>) => {
    const t = track.current;
    if (e.pointerId !== t.pointerId) return;
    if (t.phase === "pending") {
      track.current = IDLE;
      return;
    }
    if (t.phase !== "dragging") return;
    const sheet = sheetRef.current;
    const height = sheet ? sheet.getBoundingClientRect().height : 0;
    const dy = e.clientY - t.startY;
    t.samples.push({ y: e.clientY, t: performance.now() });
    if (shouldDismiss({ dy, velocity: releaseVelocity(t.samples), height })) dismiss();
    else springBack();
  };

  const onPointerCancel = (e: ReactPointerEvent<S>) => {
    const t = track.current;
    if (e.pointerId !== t.pointerId) return;
    if (t.phase === "dragging") springBack();
    else if (t.phase === "pending") track.current = IDLE;
  };

  const onLostPointerCapture = (e: ReactPointerEvent<S>) => {
    // Touch pointers start implicitly captured by the pressed child; moving the
    // capture to the sheet fires lostpointercapture on that child, and it
    // bubbles here. Only the sheet losing its own capture ends the drag.
    if (e.target === sheetRef.current) onPointerCancel(e);
  };

  // Browsers claim a vertical touch pan for scrolling (and cancel the
  // pointer) unless the touchmove is cancelled. Cancel it for our drags only.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onTouchMove = (e: TouchEvent) => {
      const t = track.current;
      if (t.phase === "dragging") {
        if (e.cancelable) e.preventDefault();
        return;
      }
      const touch = e.touches.length === 1 ? e.touches[0] : null;
      if (!touch || t.phase !== "pending") return;
      if (wantsDrag(touch.clientX - t.startX, touch.clientY - t.startY) && e.cancelable) e.preventDefault();
    };
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      sheet.removeEventListener("touchmove", onTouchMove);
      // Unmounted mid-slide: onDismiss must not run after the sheet is gone.
      cancelSettle.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only
  }, []);

  return {
    sheetRef,
    scrimRef,
    sheetHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
    },
  };
}
