/**
 * Landing motion model — the numbers and pure steps behind the animated
 * landing ("the page is the climb"). Components in this folder read these;
 * tests import them, so a tuning change happens in one place.
 *
 * Units: the hero scene measures the tower in metres; the scene shows
 * VIEW_M metres of tower top to bottom (1 m = 100 / VIEW_M cqh). Lava gap is
 * a fraction of the scene height between the climber's feet and the lava
 * crest.
 */

/** Metres the hero climber climbs over the pinned scroll. */
export const CLIMB_M = 96;
/** Metres of tower visible in the scene viewport. */
export const VIEW_M = 40;
/** Metres between floors (one ledge per floor). */
export const FLOOR_M = 8;
/** Metres climbed per climb-strip frame (the strip has 6 frames). */
export const CLIMB_M_PER_FRAME = 1.2;
export const CLIMB_FRAMES = 6;
/** Climber's feet sit this far up from the scene's bottom (fraction). */
export const CLIMBER_FEET_FROM_BOTTOM = 0.36;
/** Scroll progress at which the climber has topped out. */
export const SUMMIT_AT = 0.97;

/** Lava gap bounds, start value, and how fast it moves. */
export const LAVA_GAP_MIN = 0.03;
export const LAVA_GAP_MAX = CLIMBER_FEET_FROM_BOTTOM - 0.02;
export const LAVA_GAP_START = 0.24;
/** Gap the lava eats per second while you are not scrolling. */
export const LAVA_CREEP_PER_S = 0.03;
/** Gap won back per pixel scrolled (either direction counts as climbing). */
export const LAVA_PULL_PER_PX = 0.0005;
/** Below this gap the scene warns you to keep scrolling. */
export const LAVA_WARN_GAP = 0.09;

/** Shared springs (Motion `transition` objects). */
export const SPRING_DROP = { type: "spring", stiffness: 520, damping: 24, mass: 1.1 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 160, damping: 26 } as const;
export const SPRING_MAGNET = { type: "spring", stiffness: 260, damping: 18, mass: 0.5 } as const;

/** Duration (s) of the lava flood that covers the page before a CTA navigates. */
export const FLOOD_S = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Metres climbed at a scroll progress (0..1). */
export function climbMetres(progress: number): number {
  return clamp(progress, 0, 1) * CLIMB_M;
}

/** Climb-strip frame (0..5) for metres climbed: distance-driven, like the game. */
export function climbFrame(metres: number): number {
  const f = Math.floor(Math.max(0, metres) / CLIMB_M_PER_FRAME) % CLIMB_FRAMES;
  return f;
}

/** Floor number (1-based) the climber is on. */
export function floorAt(metres: number): number {
  return Math.floor(Math.max(0, metres) / FLOOR_M) + 1;
}

/** Floors in the hero tower, ground floor to summit; the last one is the summit. */
export function towerFloors(): number {
  return Math.floor(CLIMB_M / FLOOR_M) + 1;
}

/** Floors drawn below the start, so the climber begins with tower under them. */
export const BASEMENT_FLOORS = 3;

/**
 * One animation-frame step of the lava gap: scrolling pulls you away from the
 * lava, standing still lets it creep up. At the summit it falls back to the
 * maximum. Bounds hold for any dt or speed, including negative speed values.
 */
export function stepLavaGap(
  gap: number,
  dtS: number,
  scrollSpeedPxPerS: number,
  atSummit: boolean,
): number {
  if (atSummit) return LAVA_GAP_MAX;
  const dt = clamp(dtS, 0, 0.1); // a backgrounded tab must not drown you in one frame
  const pulled = Math.abs(scrollSpeedPxPerS) * dt * LAVA_PULL_PER_PX;
  return clamp(gap + pulled - LAVA_CREEP_PER_S * dt, LAVA_GAP_MIN, LAVA_GAP_MAX);
}

/** Marquee speed multiplier from scroll velocity (signed: scrolling up reverses it). */
export function marqueeFactor(scrollVelocityPxPerS: number): number {
  const boost = clamp(Math.abs(scrollVelocityPxPerS) / 400, 0, 6);
  const dir = scrollVelocityPxPerS < 0 ? -1 : 1;
  return dir * (1 + boost);
}

/** Marquee skew (deg) from scroll velocity, capped so the text stays legible. */
export function marqueeSkew(scrollVelocityPxPerS: number): number {
  return clamp(scrollVelocityPxPerS / 220, -9, 9);
}

/** Per-letter delay (ms) for the stacking headline: lines land bottom-up feel, letters left to right. */
export function letterDelayMs(line: number, index: number): number {
  return 120 + line * 210 + index * 38;
}

/** Ease-out cubic value for a count-up at t (0..1). */
export function countUpValue(target: number, t: number): number {
  const k = clamp(t, 0, 1);
  return Math.round(target * (1 - Math.pow(1 - k, 3)));
}
