import type { ReactNode } from "react";
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
  return createPortal(
    <div
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
