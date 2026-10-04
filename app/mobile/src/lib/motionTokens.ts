/**
 * The motion system's values: one set of durations, curves and springs for
 * every animated surface. See lib/motion.ts for how they are used.
 */
import type { Transition } from "motion/react";

/** Seconds. Keep in step with the `--motion-duration-*` properties in styles.css. */
export const duration = {
  /** Leaving: things get out of the way fast. */
  exit: 0.14,
  /** Small UI: a toggle, a chip, a highlight. */
  fast: 0.18,
  /** Entering content: a screen, a list. */
  base: 0.32,
  /** Large surfaces travelling far: a sheet, a hero. */
  slow: 0.44,
} as const;

/** Cubic-bezier control points. Keep in step with `--motion-ease-*` in styles.css. */
export const ease = {
  /** Decelerate: arrive and settle. The default for anything entering. */
  out: [0.2, 0, 0, 1],
  /** Accelerate: leave without lingering. */
  in: [0.4, 0, 1, 1],
  /** Move between two on-screen places. */
  inOut: [0.4, 0, 0.2, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Springs, for anything the finger moves or that should feel physical. */
export const spring = {
  /** Screens, sheets and shared elements: quick, no visible bounce. */
  smooth: { type: "spring", stiffness: 380, damping: 38, mass: 1 },
  /** Highlights and selections that hop between places: a hint of overshoot. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.8 },
  /** Presses and pops: a small, lively overshoot. */
  bouncy: { type: "spring", stiffness: 600, damping: 22, mass: 0.7 },
} as const satisfies Record<string, Transition>;

/** Distances (px) screens travel on the shared horizontal axis. */
export const travel = {
  screen: 56,
  behind: 40,
} as const;

/**
 * Scales for the depth axis: going into a run zooms the game up from just past
 * the glass while the screen behind sinks back, and coming out reverses it.
 */
export const zoom = {
  /** Where an arriving run starts, and where a finished one leaves to. */
  near: 1.06,
  /** Where the screen behind a run sinks to, and rises back from. */
  far: 0.96,
} as const;

/** A plain cross-fade: overlays and the app's top-level states (splash, Sign In, the app). */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.in } },
} as const;

/** A press: the scale a tappable surface dips to, and how it springs back. */
export const press = {
  whileTap: { scale: 0.96 },
  transition: spring.bouncy,
} as const;

/** Children that arrive one after another (cards in a list, rows on a screen). */
export const STAGGER_S = 0.035;
/** Past this many items the stagger stops growing, so long lists don't drag. */
export const STAGGER_CAP = 8;

/** The delay for the `index`th item of a staggered entrance. */
export function staggerDelay(index: number): number {
  return Math.min(Math.max(0, index), STAGGER_CAP) * STAGGER_S;
}

/** Variants for an item that rises into place as part of a staggered list. */
export const riseIn = {
  hidden: { opacity: 0, y: 12 },
  shown: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...spring.smooth, delay: staggerDelay(index), opacity: { duration: duration.fast, delay: staggerDelay(index) } },
  }),
} as const;

/**
 * layoutIds for elements that travel between screens. Both ends render the
 * same id and Motion flies one into the other (RouteTransition's LayoutGroup).
 */
export const sharedId = {
  /** The figure on a Shop card and the preview on Skin Details, per look. */
  shopLook: (lookId: string) => `shop-look-${lookId}`,
} as const;
