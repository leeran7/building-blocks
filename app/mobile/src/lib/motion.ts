/**
 * The app's motion system: one set of durations, curves and springs that every
 * animated surface uses, so screens, sheets, cards and the tab bar move like
 * one product. Motion (motion.dev) drives anything that needs exit
 * animations, springs or shared elements; plain CSS reads the same values from
 * the `--motion-*` custom properties in styles.css.
 *
 * The tokens live in motionTokens.ts; this file keeps the reduced-motion check
 * (tests mock it on its own).
 *
 * Reduced motion: MotionConfig (App) skips transform animations when the user
 * asks, and JS-driven animation (count-ups, RAF loops) checks
 * prefersReducedMotion(). CSS handles the rest via `@media (prefers-reduced-motion)`.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
