/**
 * Tower v3 "The Climb" — endless stack generator.
 *
 * The tower has NO summit: it climbs forever and gets harder with altitude. It
 * acts as a leaderboard — your peak height is your score. Geometry is generated
 * DETERMINISTICALLY PER FLOOR from (seed, floorIndex): floor i is a solid
 * platform (with a jumpable gap on higher floors) at height i·floorGap, joined to
 * floor i+1 by a ladder at a seeded x. Nothing is precomputed or stored, so the
 * world is unbounded yet fully reproducible for re-simulation (AC-11).
 *
 * Difficulty scales with altitude: the gap you must jump on each floor widens
 * toward the physical jump limit, and ladders shift further sideways, so higher
 * floors demand tighter jumps and longer traverses (more exposure to the lava).
 * Because these stay within the jump reach, every floor remains solvable.
 */

import { TowerSpec, Platform, Ladder } from "./types";
import {
  GameCategory,
  TrackArchetype,
  resolveGameCategory,
} from "./categories";
import { createRng } from "./rng";

/** Physics + layout tuning per archetype. */
interface ArchetypeTuning {
  maxClimbSpeed: number;
  moveSpeed: number;
  jumpSpeed: number;
  gravity: number;
  fallDeathBelowPeakM: number;
  ladderGrabRadius: number;
  floorGap: number;
}

const ARCHETYPE_TUNING: Record<TrackArchetype, ArchetypeTuning> = {
  "ladder-climb": {
    maxClimbSpeed: 9, moveSpeed: 14, jumpSpeed: 15, gravity: 40,
    fallDeathBelowPeakM: 90, ladderGrabRadius: 2.2, floorGap: 24,
  },
  "platform-gauntlet": {
    maxClimbSpeed: 8, moveSpeed: 16, jumpSpeed: 17, gravity: 44,
    fallDeathBelowPeakM: 80, ladderGrabRadius: 2.2, floorGap: 22,
  },
  "crumble-stairs": {
    maxClimbSpeed: 8, moveSpeed: 15, jumpSpeed: 16, gravity: 42,
    fallDeathBelowPeakM: 85, ladderGrabRadius: 2.2, floorGap: 23,
  },
  "wall-jump-chimney": {
    maxClimbSpeed: 10, moveSpeed: 12, jumpSpeed: 16, gravity: 40,
    fallDeathBelowPeakM: 100, ladderGrabRadius: 2.4, floorGap: 26,
  },
};

const WIDTH_M = 100;
/** Floors over which difficulty ramps from easy → hard (then holds). */
const DIFFICULTY_FLOORS = 50;

export interface BuildTowerOptions {
  widthM?: number;
}

/** Build an endless TowerSpec for a category. Deterministic per (slug, options). */
export function buildTower(
  slugOrCategory: string | GameCategory,
  opts: BuildTowerOptions = {}
): TowerSpec {
  const category =
    typeof slugOrCategory === "string"
      ? resolveGameCategory(slugOrCategory)
      : slugOrCategory;
  const t = ARCHETYPE_TUNING[category.themeArchetype];
  return {
    categorySlug: category.slug,
    widthM: opts.widthM ?? WIDTH_M,
    floorGap: t.floorGap,
    seed: `tower:${category.slug}`,
    ladderGrabRadius: t.ladderGrabRadius,
    maxClimbSpeed: t.maxClimbSpeed,
    moveSpeed: t.moveSpeed,
    jumpSpeed: t.jumpSpeed,
    gravity: t.gravity,
    fallDeathBelowPeakM: t.fallDeathBelowPeakM,
  };
}

/** The MVP tower (endless solo climb). */
export const MVP_TOWER: TowerSpec = buildTower("indie-games");

// ── Deterministic per-floor geometry ───────────────────────────────────────

/** Height (metres) of floor i's walking surface. */
export function floorHeight(tower: TowerSpec, i: number): number {
  return i * tower.floorGap;
}

/** Floor index whose surface is at or just below height y. */
export function floorIndexAt(tower: TowerSpec, y: number): number {
  return Math.floor(y / tower.floorGap);
}

/** Max horizontal distance a running jump can cover (same-height landing). */
function horizontalJumpReach(tower: TowerSpec): number {
  const airtime = (2 * tower.jumpSpeed) / tower.gravity;
  return tower.moveSpeed * airtime;
}

function ladderMargin(tower: TowerSpec): number {
  return Math.min(14, tower.widthM * 0.16);
}

/** Seeded x of the ladder leaving floor i upward (deterministic). */
function ladderXForFloor(tower: TowerSpec, i: number): number {
  const m = ladderMargin(tower);
  // Difficulty pushes ladders further apart floor-to-floor (longer traverses).
  const r = createRng(`${tower.seed}:lx:${i}`);
  return m + r.next() * (tower.widthM - 2 * m);
}

/** The ladder that leads UP from floor i to floor i+1. */
export function ladderForFloor(tower: TowerSpec, i: number): Ladder {
  return {
    x: ladderXForFloor(tower, i),
    y0: floorHeight(tower, i),
    y1: floorHeight(tower, i + 1),
  };
}

/** Gap width to jump on floor i — widens with altitude but stays jumpable. */
function gapWidthForFloor(tower: TowerSpec, i: number): number {
  const reach = horizontalJumpReach(tower);
  const d = Math.min(1, i / DIFFICULTY_FLOORS);
  const frac = 0.34 + (0.6 - 0.34) * d; // 34% → 60% of jump reach
  return reach * frac;
}

/** Solid platform pieces making up floor i (1 piece, or 2 around a gap). */
export function platformsForFloor(tower: TowerSpec, i: number): Platform[] {
  const y = floorHeight(tower, i);
  const w = tower.widthM;
  // Floor 0 is a safe full-width base (spawn); no incoming ladder.
  const inX = i > 0 ? ladderXForFloor(tower, i - 1) : null;
  const outX = ladderXForFloor(tower, i);
  const clearance = tower.ladderGrabRadius + 2;

  if (inX !== null) {
    const lo = Math.min(inX, outX);
    const hi = Math.max(inX, outX);
    const gapW = gapWidthForFloor(tower, i);
    const room = hi - lo - 2 * clearance;
    if (room >= gapW) {
      const mid = (lo + hi) / 2;
      const g0 = mid - gapW / 2;
      const g1 = mid + gapW / 2;
      return [
        { x0: 0, x1: g0, y },
        { x0: g1, x1: w, y },
      ];
    }
  }
  return [{ x0: 0, x1: w, y }];
}

/** Platforms whose surfaces lie within [yLow, yHigh] (a generation window). */
export function platformsNearY(tower: TowerSpec, yLow: number, yHigh: number): Platform[] {
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  const out: Platform[] = [];
  for (let i = lo; i <= hi; i++) out.push(...platformsForFloor(tower, i));
  return out;
}

/** Ladders (with their floor index) intersecting [yLow, yHigh]. */
export function laddersNearY(
  tower: TowerSpec,
  yLow: number,
  yHigh: number
): { ix: number; ladder: Ladder }[] {
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  const out: { ix: number; ladder: Ladder }[] = [];
  for (let i = lo; i <= hi; i++) out.push({ ix: i, ladder: ladderForFloor(tower, i) });
  return out;
}
