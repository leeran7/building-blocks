/**
 * Tower v3 "The Climb" — endless stack generator.
 *
 * The tower has NO summit: it climbs forever and gets harder with altitude. It
 * acts as a leaderboard — your peak height is your score. Geometry is generated
 * DETERMINISTICALLY PER FLOOR from (seed, floorIndex): floor i is a solid
 * platform (with a jumpable gap on higher floors) at a seeded height, joined to
 * floor i+1 by ONE OR TWO ladders at seeded x positions — giving route choice
 * without overcrowding. The category slug picks physics; a per-run seed
 * (applyRunSeed) is what makes each game a different layout. Same (slug, runSeed)
 * still replays exactly (AC-11).
 *
 * Difficulty scales with altitude: the gap you must jump on each floor widens
 * toward the physical jump limit, ladders shift further sideways, and crates
 * show up on most floors — jump-over hurdles on the traverse and stacked stairs
 * to the next slab. Because gaps, hurdles, and stair steps stay within jump
 * reach, every floor remains solvable. Ladders offset from the floors below so
 * they do not stack into a single column.
 */

import { TowerSpec, Platform, Ladder } from "./types";
import {
  GameCategory,
  TrackArchetype,
  resolveGameCategory,
} from "./categories";
import { createRng } from "./rng";
import { createSeedCache } from "./seedCache";

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

/**
 * Fastest vertical values across every archetype. Derived rather than written
 * down so a retune of ARCHETYPE_TUNING cannot silently loosen or invalidate the
 * server-side score bound in ./scoreBounds.
 */
export const FASTEST_ARCHETYPE = {
  maxClimbSpeed: Math.max(
    ...Object.values(ARCHETYPE_TUNING).map((t) => t.maxClimbSpeed)
  ),
  jumpSpeed: Math.max(...Object.values(ARCHETYPE_TUNING).map((t) => t.jumpSpeed)),
} as const;

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

/**
 * Height (metres) of floor i's walking surface.
 *
 * Backed by a cached prefix sum. Floor gaps became per-floor seeded, which made
 * the obvious loop O(i) with a fresh RNG allocated per floor — and since
 * geometry is queried every tick, the per-frame cost grew with the player's
 * score in an endless climber. Measured before this change: a floorHeight scan
 * cost 30.6ms at 400 floors, 123.2ms at 800 and 480.7ms at 1600, and the
 * powerups and simulation suites ran 3.1s and 3.7s against a prior 250ms.
 */
export function floorHeight(tower: TowerSpec, i: number): number {
  if (i <= 0) return 0;
  const prefix = FLOOR_PREFIX_CACHE.get(tower.seed);
  growPrefixTo(tower, prefix, i);
  return prefix[i]!;
}

/** Floor index whose surface is at or just below height y. */
export function floorIndexAt(tower: TowerSpec, y: number): number {
  if (y < 0) return 0;
  const prefix = FLOOR_PREFIX_CACHE.get(tower.seed);

  // Extend in blocks until the prefix covers y, then binary search it.
  while (prefix[prefix.length - 1]! <= y) {
    growPrefixTo(tower, prefix, prefix.length - 1 + PREFIX_GROWTH_BLOCK);
  }

  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (prefix[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Max horizontal distance a running jump can cover (same-height landing). */
function horizontalJumpReach(tower: TowerSpec): number {
  const airtime = (2 * tower.jumpSpeed) / tower.gravity;
  return tower.moveSpeed * airtime;
}

function ladderMargin(tower: TowerSpec): number {
  return Math.min(10, tower.widthM * 0.08);
}

/**
 * Cumulative floor heights per tower seed: prefix[i] is floor i's surface, so
 * prefix[0] is always 0 and the array grows lazily as the climb goes higher.
 *
 * Bounded because tower seeds now include a per-run id, so an unbounded map
 * retains one growing array per game ever played. Eight is generous: a session
 * climbs one tower, and the menu may preview a couple more.
 */
const FLOOR_PREFIX_CACHE = createSeedCache<number[]>(8, () => [0]);
/**
 * Ladder x positions per floor, grown in order so floor i can offset from the
 * real xs on i-1 / i-2 / i-3. Recursing `ladderXsForFloor(i-1)` would be
 * exponential; this cache is O(floors) like the height prefix.
 */
const LADDER_XS_CACHE = createSeedCache<number[][]>(8, () => []);

/** Centre-to-centre keep-out vs ladders on the floor below (then fading). */
const STACK_CLEAR_M = 14;
const STACK_LOOKBACK = 3;

/** Floors to extend by when searching past the cached range. */
const PREFIX_GROWTH_BLOCK = 64;

/** Extend a prefix sum so index `floor` exists. */
function growPrefixTo(tower: TowerSpec, prefix: number[], floor: number): void {
  for (let f = prefix.length - 1; f < floor; f++) {
    const gap = floorGapForFloor(tower, f);
    // floorGap is archetype tuning and the multiplier bottoms out at 0.68, so
    // this cannot happen — but a non-positive gap would make floorIndexAt's
    // growth loop spin forever, so fail loudly instead of hanging.
    if (!(gap > 0)) {
      throw new Error(
        `floorGapForFloor returned ${gap} for floor ${f} of ${tower.seed}`
      );
    }
    prefix.push(prefix[f]! + gap);
  }
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
 * How many ladders leave floor i. Limited to 1-2 to avoid visual clutter while
 * still giving route choice. Two ladders let the climber pick the near one instead
 * of being forced into one long traverse. Weighted toward 2 as altitude grows,
 * which partly offsets the widening gaps.
 */
function ladderCountForFloor(tower: TowerSpec, i: number): number {
  const r = createRng(`${tower.seed}:ln:${i}`);
  const d = Math.min(1, i / DIFFICULTY_FLOORS);
  const roll = r.next();
  // Single-ladder floors stay common low down (readable opening) and thin out.
  // Higher floors favor 2 ladders to help with wider gaps. Max is 2 (never 3).
  const oneChance = 0.5 - 0.2 * d; // 50% at floor 0, 30% at floor 50+
  if (roll < oneChance) return 1;
  return 2;
}

/** X positions of every ladder leaving floor i, primary first (deterministic). */
function ladderXsForFloor(tower: TowerSpec, i: number): number[] {
  const cache = LADDER_XS_CACHE.get(tower.seed);
  growLadderXsTo(tower, cache, i);
  return cache[i]!;
}

function growLadderXsTo(
  tower: TowerSpec,
  cache: number[][],
  floor: number
): void {
  for (let f = cache.length; f <= floor; f++) {
    cache.push(placeLadderXs(tower, f, cache));
  }
}

/**
 * Place floor `i` after lower floors are already in `cache`. Punch keep-out
 * around recent ladders so columns of 4 aligned routes are rare; if the floor
 * is fully covered, fall back to the x farthest from those ladders.
 */
function placeLadderXs(
  tower: TowerSpec,
  i: number,
  cache: number[][]
): number[] {
  const m = ladderMargin(tower);
  const loBound = m;
  const hiBound = tower.widthM - m;
  const sep = ladderSeparation(tower);
  const keepOut = stackKeepOut(cache, i);
  const raw = ladderXForFloor(tower, i);
  const xs = [snapAwayFromStack(raw, keepOut, loBound, hiBound)];
  const count = ladderCountForFloor(tower, i);
  const r = createRng(`${tower.seed}:lx-extra:${i}`);

  for (let k = 1; k < count; k++) {
    // Place each extra in the widest stretch still clear of this floor's
    // ladders and the vertical keep-out, so spacing is guaranteed without a
    // rejection loop.
    let spans: { lo: number; hi: number }[] = [{ lo: loBound, hi: hiBound }];
    for (const x of xs) spans = punchSpan(spans, x - sep, x + sep);
    for (const o of keepOut) spans = punchSpan(spans, o.x - o.r, o.x + o.r);
    let best: { lo: number; hi: number } | null = null;
    let bestRoom = 0;
    for (const s of spans) {
      const room = s.hi - s.lo;
      if (room > bestRoom) {
        bestRoom = room;
        best = s;
      }
    }
    if (!best || bestRoom <= 0) break;
    xs.push(best.lo + r.next() * (best.hi - best.lo));
  }
  return xs;
}

function stackKeepOut(
  cache: number[][],
  i: number
): { x: number; r: number }[] {
  const out: { x: number; r: number }[] = [];
  for (let d = 1; d <= STACK_LOOKBACK && i - d >= 0; d++) {
    const r = d === 1 ? STACK_CLEAR_M : d === 2 ? 10 : 8;
    for (const x of cache[i - d] ?? []) out.push({ x, r });
  }
  return out;
}

function snapAwayFromStack(
  raw: number,
  keepOut: { x: number; r: number }[],
  loBound: number,
  hiBound: number
): number {
  if (keepOut.length === 0) return raw;
  let spans: { lo: number; hi: number }[] = [{ lo: loBound, hi: hiBound }];
  for (const o of keepOut) {
    spans = punchSpan(spans, o.x - o.r, o.x + o.r);
  }
  if (spans.length > 0) {
    for (const s of spans) {
      if (raw >= s.lo && raw <= s.hi) return raw;
    }
    let best = spans[0];
    let bestD = spanDist(raw, best);
    for (const s of spans) {
      const d = spanDist(raw, s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return raw < best.lo ? best.lo : best.hi;
  }
  // Fully covered: pick the x that maximises distance to the nearest keep-out.
  let bestX = (loBound + hiBound) / 2;
  let bestMin = -1;
  const samples = 24;
  for (let s = 0; s <= samples; s++) {
    const x = loBound + ((hiBound - loBound) * s) / samples;
    let nearest = Infinity;
    for (const o of keepOut) nearest = Math.min(nearest, Math.abs(x - o.x));
    if (nearest > bestMin) {
      bestMin = nearest;
      bestX = x;
    }
  }
  return bestX;
}

function punchSpan(
  spans: { lo: number; hi: number }[],
  cutLo: number,
  cutHi: number
): { lo: number; hi: number }[] {
  const next: { lo: number; hi: number }[] = [];
  for (const s of spans) {
    if (cutHi <= s.lo || cutLo >= s.hi) {
      next.push(s);
      continue;
    }
    if (cutLo > s.lo) next.push({ lo: s.lo, hi: Math.min(s.hi, cutLo) });
    if (cutHi < s.hi) next.push({ lo: Math.max(s.lo, cutHi), hi: s.hi });
  }
  return next.filter((s) => s.hi - s.lo > 0.5);
}

function spanDist(x: number, s: { lo: number; hi: number }): number {
  if (x < s.lo) return s.lo - x;
  if (x > s.hi) return x - s.hi;
  return 0;
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
