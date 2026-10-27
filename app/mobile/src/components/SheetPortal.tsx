import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useIsPresent } from "motion/react";
import { duration, ease, spring } from "../lib/motionTokens";

/** How every bottom sheet arrives and leaves. Exported for tests. */
export const SHEET_MOTION = {
  panel: {
    initial: { y: "100%" },
    animate: { y: 0, transition: spring.smooth },
    exit: { y: "100%", transition: { duration: duration.slow * 0.6, ease: ease.in } },
  },
  scrim: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: duration.fast, ease: ease.out } },
    exit: { opacity: 0, transition: { duration: duration.slow * 0.6, ease: ease.in } },
  },
} as const;

/**
 * The frame every bottom sheet sits in: portalled to the body so no screen's
 * stacking context traps it, with the scrim fading and the panel springing up
 * from the bottom edge. Render it under an `AnimatePresence` and the sheet
 * also slides away when it closes, from a button as much as from a swipe.
 *
 * The scrim and panel you pass keep their own refs, so useSwipeToDismiss can
 * still drag the panel: the motion lives on wrappers around them, never on the
 * element the gesture moves.
 */
export function SheetPortal({
  scrim,
  children,
  centered = true,
}: {
  /** The tap-to-close layer behind the sheet. */
  scrim: ReactNode;
  /** The sheet panel itself (role="dialog"). */
  children: ReactNode;
  /** Centre the panel on wide screens (max-w-md). */
  centered?: boolean;
}) {
  // Closing: the sheet is on its way out, so nothing in it may be pressed
  // (a Play tapped mid-slide would still start the run) or read as modal.
  const present = useIsPresent();
  const rootRef = useRef<HTMLDivElement>(null);
  useSheetFocus(rootRef);
  return createPortal(
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 flex items-end ${centered ? "justify-center" : ""} ${present ? "" : "pointer-events-none"}`}
      role="presentation"
      inert={!present}
      data-sheet-leaving={present ? undefined : ""}
    >
      <motion.div data-sheet-scrim-motion className="absolute inset-0" {...SHEET_MOTION.scrim}>
        {scrim}
      </motion.div>
      <motion.div
        data-sheet-motion
        className={`pointer-events-none relative flex h-full w-full flex-col justify-end [&>*]:pointer-events-auto ${centered ? "max-w-md" : ""}`}
        {...SHEET_MOTION.panel}
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard focus belongs to the open sheet: it moves into the sheet when it
 * opens, Tab and Shift+Tab cycle inside it, and it goes back to whatever had
 * it before when the sheet closes. With a sheet stacked on another (the gem
 * packs over a level card) the top one's listener, added last, runs last and
 * keeps Tab inside it. Escape stays with each sheet, which knows how it closes.
 */
function useSheetFocus(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Only the panel's own controls: the scrim is a tabindex=-1 close button.
    const focusables = () =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.closest("[inert]") && el.closest('[role="dialog"]') !== null,
      );
    // The panel itself takes focus, not its first control: on a phone,
    // focusing a field would pop the keyboard over a sheet just opened.
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog && !root.contains(document.activeElement)) {
      if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      dialog.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const inside = root.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Leaving, the sheet is inert, which drops its focus to the body.
      const active = document.activeElement;
      const lost = !active || active === document.body || root.contains(active);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [rootRef]);
}
