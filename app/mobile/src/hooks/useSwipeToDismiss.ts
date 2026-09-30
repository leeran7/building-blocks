import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "../lib/motion";

/** How far down (px) the finger must move before the sheet follows it. */
const SLOP_PX = 8;
/** Past this share of the sheet's height, letting go closes it. */
const CLOSE_FRACTION = 0.25;
/** ...or past this many pixels, whichever is smaller. */
const CLOSE_PX = 140;
/** A flick this fast (px/ms) closes it from a shorter drag. */
const FLICK_SPEED = 0.5;
const FLICK_MIN_PX = 24;
/** Held still this long (ms) before letting go, it counts as a drag, not a flick. */
const FLICK_HOLD_MS = 100;
const SETTLE_MS = 220;
const EASE = "cubic-bezier(0.16,1,0.3,1)";

/**
 * Swipe a bottom sheet down to close it, the way an iOS sheet does. The sheet
 * follows the finger once a downward drag starts from its top (or from the
 * grabber anywhere), then either slides away and calls `onClose`, or springs
 * back if the drag was short and slow. A sheet scrolled down scrolls first; the
 * drag only takes over once it is back at the top.
 *
 * `scrimRef`, when given, fades with the drag so the screen behind shows
 * through as the sheet goes.
 */
export function useSwipeToDismiss(
  sheetRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  scrimRef?: RefObject<HTMLElement | null>,
) {
  // The latest onClose without re-binding the listeners on every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;
    let fromGrabber = false;
    let tracking = false;
    let dragging = false;
    let offset = 0;
    // The last two samples, for the release speed.
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let closing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scrim = () => scrimRef?.current ?? null;

    const paint = (y: number, animate: boolean) => {
      const transition = animate ? `transform ${SETTLE_MS}ms ${EASE}` : "none";
      sheet.style.transition = transition;
      sheet.style.transform = y > 0 ? `translateY(${y}px)` : "";
      const s = scrim();
      if (s) {
        s.style.transition = animate ? `opacity ${SETTLE_MS}ms ${EASE}` : "none";
        s.style.opacity = y > 0 ? String(Math.max(0, 1 - y / sheet.offsetHeight)) : "";
      }
    };

    // A drag that ends over a button must not also press it: swallow the one
    // click the release may fire, until the next touch or a short while.
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    function unswallow() {
      clearTimeout(clickTimer);
      window.removeEventListener("click", stopClick, { capture: true });
    }
    function stopClick(e: Event) {
      e.stopPropagation();
      e.preventDefault();
      unswallow();
    }
    const swallowClick = () => {
      window.addEventListener("click", stopClick, { capture: true });
      clickTimer = setTimeout(unswallow, 400);
    };

    const onStart = (e: TouchEvent) => {
      unswallow();
      if (closing || e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      lastY = t.clientY;
      lastT = e.timeStamp;
      speed = 0;
      startScrollTop = sheet.scrollTop;
      fromGrabber = e.target instanceof Element && e.target.closest("[data-sheet-grabber]") !== null;
      tracking = true;
      dragging = false;
      offset = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      if (!dragging) {
        if (Math.abs(dy) < SLOP_PX && Math.abs(dx) < SLOP_PX) return;
        // Up, sideways, or inside a scrolled list: let the page have it.
        const atTop = sheet.scrollTop <= 0 && startScrollTop <= 0;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !(atTop || fromGrabber)) {
          tracking = false;
          return;
        }
        dragging = true;
        // The opening slide-up animation holds transform; drop it so the drag shows.
        sheet.style.animation = "none";
        const s = scrim();
        if (s) s.style.animation = "none";
        // Count from where the drag took over, so the sheet doesn't jump by the slop.
        startY += SLOP_PX;
      }
      e.preventDefault();
      offset = Math.max(0, t.clientY - startY);
      const dt = e.timeStamp - lastT;
      if (dt > 0) speed = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastT = e.timeStamp;
      paint(offset, false);
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      swallowClick();
      if (e.type === "touchcancel") {
        paint(0, !prefersReducedMotion());
        return;
      }
      // A finger that stopped before lifting is not a flick.
      if (e.timeStamp - lastT > FLICK_HOLD_MS) speed = 0;
      const far = offset > Math.min(CLOSE_PX, sheet.offsetHeight * CLOSE_FRACTION);
      const flick = speed > FLICK_SPEED && offset > FLICK_MIN_PX;
      if (!far && !flick) {
        paint(0, !prefersReducedMotion());
        return;
      }
      closing = true;
      if (prefersReducedMotion()) {
        closeRef.current();
        return;
      }
      paint(sheet.offsetHeight + 40, true);
      timer = setTimeout(() => closeRef.current(), SETTLE_MS);
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: once the sheet is following the finger, the page must not scroll too.
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      clearTimeout(timer);
      unswallow();
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [sheetRef, scrimRef]);
}
