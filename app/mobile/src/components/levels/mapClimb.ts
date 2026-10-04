import { ladderX, pinX, slabTop } from "./towerGeometry";

/**
 * The climb the level map plays when the player comes back having cleared
 * floors: their character walks to each ladder, climbs it, and steps onto the
 * next floor, one floor per level cleared since the map last showed them.
 *
 * Positions use the map's units (towerGeometry): x is % of its width, y is px
 * from its bottom edge, at the figure's feet.
 */

/** The most floors one climb shows; a bigger jump (another device) starts this far below. */
export const MAX_CLIMB_FLOORS = 12;
/** Walking pace along a floor, % of the map's width per second. */
export const WALK_PCT_PER_S = 70;
/** Climbing pace up a ladder, px per second. */
export const CLIMB_PX_PER_S = 220;
/** A climb longer than this at the paces above runs faster to fit, seconds. */
export const MAX_CLIMB_S = 7;
/** A beat standing still before the first step, so the eye finds the figure, seconds. */
export const CLIMB_LEAD_IN_S = 0.45;

/** Where a climb starts, or null when there is nothing to climb. */
export function climbFrom(seen: number | null, frontier: number): number | null {
  if (seen === null || seen >= frontier) return null;
  return Math.max(seen, frontier - MAX_CLIMB_FLOORS, 1);
}

export interface ClimbSegment {
  pose: "walk" | "climb";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Start time from the climb's start, seconds. */
  at: number;
  seconds: number;
  /** The floor this segment ends standing on, when it ends on one. */
  lands: number | null;
}

/** The segments from floor `from` up to floor `to`, timed from 0 (after the lead-in). */
export function climbPath(from: number, to: number): ClimbSegment[] {
  const raw: Array<Omit<ClimbSegment, "at" | "seconds"> & { length: number }> = [];
  const walk = (x0: number, x1: number, y: number, lands: number | null) => {
    if (Math.abs(x1 - x0) > 1e-6) raw.push({ pose: "walk", x0, y0: y, x1, y1: y, lands, length: Math.abs(x1 - x0) / WALK_PCT_PER_S });
    else if (lands !== null && raw.length > 0) raw[raw.length - 1].lands = lands;
  };
  for (let n = from; n < to; n++) {
    const x = ladderX(n);
    walk(pinX(n), x, slabTop(n), null);
    raw.push({ pose: "climb", x0: x, y0: slabTop(n), x1: x, y1: slabTop(n + 1), lands: null, length: (slabTop(n + 1) - slabTop(n)) / CLIMB_PX_PER_S });
    walk(x, pinX(n + 1), slabTop(n + 1), n + 1);
  }
  const total = raw.reduce((sum, s) => sum + s.length, 0);
  const scale = total > MAX_CLIMB_S ? MAX_CLIMB_S / total : 1;
  let at = 0;
  return raw.map(({ length, ...s }) => {
    const seg = { ...s, at, seconds: length * scale };
    at += seg.seconds;
    return seg;
  });
}

/** How long a path runs, seconds. */
export function climbDuration(path: readonly ClimbSegment[]): number {
  const last = path[path.length - 1];
  return last ? last.at + last.seconds : 0;
}

export interface ClimbFrame {
  x: number;
  y: number;
  pose: "idle" | "walk" | "climb";
  facing: 1 | -1;
  /** The highest floor reached so far, or null before the first. */
  landed: number | null;
}

/** Where the figure is `t` seconds into `path` (clamped to its ends). */
export function climbFrameAt(path: readonly ClimbSegment[], t: number): ClimbFrame {
  let landed: number | null = null;
  for (const seg of path) {
    if (t < seg.at + seg.seconds) {
      if (t < seg.at) break;
      const k = seg.seconds > 0 ? (t - seg.at) / seg.seconds : 1;
      return {
        x: seg.x0 + (seg.x1 - seg.x0) * k,
        y: seg.y0 + (seg.y1 - seg.y0) * k,
        pose: seg.pose,
        facing: seg.x1 < seg.x0 ? -1 : 1,
        landed,
      };
    }
    if (seg.lands !== null) landed = seg.lands;
  }
  const end = t <= 0 || path.length === 0 ? path[0] : path[path.length - 1];
  if (!end) return { x: 0, y: 0, pose: "idle", facing: 1, landed };
  const atEnd = t > 0;
  return { x: atEnd ? end.x1 : end.x0, y: atEnd ? end.y1 : end.y0, pose: "idle", facing: 1, landed };
}
