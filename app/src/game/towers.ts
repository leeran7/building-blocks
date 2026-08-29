/**
 * Tower v3 "The Climb" — endless stack generator.
 *
 * The tower has NO summit: it climbs forever and gets harder with altitude. It
 * acts as a leaderboard — your peak height is your score. Geometry is generated
 * DETERMINISTICALLY PER FLOOR from (seed, floorIndex): floor i is a solid
 * platform (with a jumpable gap on higher floors) at a seeded height, joined to
 * floor i+1 by ONE TO THREE ladders at seeded x positions — several routes up, so
 * the climber picks a line instead of being funnelled. The category slug picks
 * physics; a per-run seed (applyRunSeed) is what makes each game a different
 * layout. Same (slug, runSeed) still replays exactly (AC-11).
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
  /**
   * Per-run id mixed into geometry. Same slug without this always yields the
   * same map; pass a fresh `newRunSeed()` so each game is a different layout.
   */
  runSeed?: string;
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
  const base: TowerSpec = {
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
  return opts.runSeed ? applyRunSeed(base, opts.runSeed) : base;
}

/**
 * Bind a run id into the tower seed so ladders, floor heights, and power-ups
 * all change. Same (slug, runSeed) still replays bit-identically (AC-11).
 */
export function applyRunSeed(tower: TowerSpec, runSeed: string): TowerSpec {
  return { ...tower, seed: `tower:${tower.categorySlug}:${runSeed}` };
}

/** The MVP tower (endless solo climb). */
export const MVP_TOWER: TowerSpec = buildTower("indie-games");

// ── Deterministic per-floor geometry ───────────────────────────────────────

/** Height (metres) of floor i's walking surface. */
export function floorHeight(tower: TowerSpec, i: number): number {
  let h = 0;
  for (let f = 0; f < i; f++) h += floorGapForFloor(tower, f);
  return h;
}

/** Floor index whose surface is at or just below height y. */
export function floorIndexAt(tower: TowerSpec, y: number): number {
  if (y < 0) return 0;
  let i = 0;
  let h = 0;
  while (h + floorGapForFloor(tower, i) <= y) {
    h += floorGapForFloor(tower, i);
    i++;
  }
  return i;
}

/** Max horizontal distance a running jump can cover (same-height landing). */
function horizontalJumpReach(tower: TowerSpec): number {
  const airtime = (2 * tower.jumpSpeed) / tower.gravity;
  return tower.moveSpeed * airtime;
}

function ladderMargin(tower: TowerSpec): number {
  return Math.min(10, tower.widthM * 0.08);
}

/** Per-floor vertical span (metres) — varies around the archetype base gap. */
export function floorGapForFloor(tower: TowerSpec, i: number): number {
  const r = createRng(`${tower.seed}:fg:${i}`);
  const base = tower.floorGap;
  // 68%–132% of base — noticeable variety without breaking jump solvability.
  return base * (0.68 + r.next() * 0.64);
}

/** Seeded x of the primary ladder leaving floor i upward (deterministic). */
function ladderXForFloor(tower: TowerSpec, i: number): number {
  const m = ladderMargin(tower);
  const span = tower.widthM - 2 * m;
  const r = createRng(`${tower.seed}:lx:${i}`);
  // Mix full-span rolls with left/right/third bias so ladders feel less evenly spaced.
  const zone = r.next();
  if (zone < 0.22) return m + r.next() * span * 0.28;
  if (zone < 0.44) return m + span * 0.72 + r.next() * span * 0.28;
  if (zone < 0.62) return m + r.next() * span;
  // Wild swing relative to an independent prior-x estimate (separate RNG stream).
  if (i > 0) {
    const rAway = createRng(`${tower.seed}:lx-away:${i}`);
    const prevApprox = m + rAway.next() * span;
    const away = prevApprox < tower.widthM / 2 ? 0.75 : 0.15;
    return m + span * away + r.next() * span * 0.2;
  }
  return m + r.next() * span;
}

/**
 * Minimum centre-to-centre spacing between two ladders on one floor. Wide
 * enough that the grab radii never overlap, so "which ladder am I on" is never
 * ambiguous and letting go of one cannot snap the climber onto its neighbour.
 */
function ladderSeparation(tower: TowerSpec): number {
  return tower.ladderGrabRadius * 3 + 2;
}

/**
 * How many ladders leave floor i. Multiple routes up are the point: a floor with
 * two or three ladders lets the climber pick the near one instead of being
 * forced into one long traverse. Weighted toward 2 as altitude grows, which
 * partly offsets the widening gaps.
 */
function ladderCountForFloor(tower: TowerSpec, i: number): number {
  const r = createRng(`${tower.seed}:ln:${i}`);
  const d = Math.min(1, i / DIFFICULTY_FLOORS);
  const roll = r.next();
  // Single-ladder floors stay common low down (readable opening) and thin out.
  const oneChance = 0.42 - 0.14 * d;
  if (roll < oneChance) return 1;
  if (roll < oneChance + 0.42) return 2;
  return 3;
}

/** X positions of every ladder leaving floor i, primary first (deterministic). */
function ladderXsForFloor(tower: TowerSpec, i: number): number[] {
  const m = ladderMargin(tower);
  const loBound = m;
  const hiBound = tower.widthM - m;
  const sep = ladderSeparation(tower);
  const xs = [ladderXForFloor(tower, i)];
  const count = ladderCountForFloor(tower, i);
  const r = createRng(`${tower.seed}:lx-extra:${i}`);

  for (let k = 1; k < count; k++) {
    // Place each extra in the widest stretch still clear of the ladders already
    // on this floor, so spacing is guaranteed without a rejection loop.
    const sorted = [...xs].sort((a, b) => a - b);
    const edges = [loBound - sep, ...sorted, hiBound + sep];
    let best: [number, number] | null = null;
    let bestRoom = 0;
    for (let e = 0; e < edges.length - 1; e++) {
      const lo = Math.max(loBound, edges[e] + sep);
      const hi = Math.min(hiBound, edges[e + 1] - sep);
      if (hi - lo > bestRoom) {
        bestRoom = hi - lo;
        best = [lo, hi];
      }
    }
    if (!best || bestRoom <= 0) break;
    xs.push(best[0] + r.next() * (best[1] - best[0]));
  }
  return xs;
}

/** Every ladder leading UP from floor i to floor i+1 (one or more routes). */
export function laddersForFloor(tower: TowerSpec, i: number): Ladder[] {
  const y0 = floorHeight(tower, i);
  const y1 = floorHeight(tower, i + 1);
  return ladderXsForFloor(tower, i).map((x) => ({ x, y0, y1 }));
}

/** The primary ladder leading UP from floor i (floors may have more). */
export function ladderForFloor(tower: TowerSpec, i: number): Ladder {
  return laddersForFloor(tower, i)[0];
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
  if (i === 0) return [{ x0: 0, x1: w, y }];

  // Every ladder that touches this surface: the ones leaving it, plus the tops
  // of the ones arriving from the floor below. The gap has to miss all of them.
  const anchors = [...ladderXsForFloor(tower, i), ...ladderXsForFloor(tower, i - 1)].sort(
    (a, b) => a - b
  );
  const clearance = tower.ladderGrabRadius + 2;
  const gapW = gapWidthForFloor(tower, i);

  let best: [number, number] | null = null;
  let bestRoom = 0;
  for (let k = 0; k < anchors.length - 1; k++) {
    const lo = anchors[k] + clearance;
    const hi = anchors[k + 1] - clearance;
    if (hi - lo > bestRoom) {
      bestRoom = hi - lo;
      best = [lo, hi];
    }
  }

  if (best && bestRoom >= gapW) {
    const mid = (best[0] + best[1]) / 2;
    return [
      { x0: 0, x1: mid - gapW / 2, y },
      { x0: mid + gapW / 2, x1: w, y },
    ];
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

/** Ladders (with floor index + slot on that floor) intersecting [yLow, yHigh]. */
export function laddersNearY(
  tower: TowerSpec,
  yLow: number,
  yHigh: number
): { ix: number; slot: number; ladder: Ladder }[] {
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  const out: { ix: number; slot: number; ladder: Ladder }[] = [];
  for (let i = lo; i <= hi; i++) {
    laddersForFloor(tower, i).forEach((ladder, slot) => out.push({ ix: i, slot, ladder }));
  }
  return out;
}
