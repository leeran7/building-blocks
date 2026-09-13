/**
 * Motion helpers shared across the game shell. Keep JS-driven animation
 * (count-ups, RAF loops) honest with the user's accessibility choice — CSS
 * handles the rest via `@media (prefers-reduced-motion)`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
