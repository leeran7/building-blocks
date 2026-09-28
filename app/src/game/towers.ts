/**
 * Tower v3 "The Climb" — endless stack generator.
 *
 * The tower has NO summit: it climbs forever and gets harder with altitude. It
 * acts as a leaderboard — your peak height is your score. Geometry is generated
 * DETERMINISTICALLY PER FLOOR from (seed, floorIndex): floor i is a solid
 * platform (with 1–3 jumpable gaps on higher floors) at a seeded height, joined
 * to floor i+1 by ONE OR TWO ladders at seeded x positions — giving route choice
 * without overcrowding. Multi-gap floors are dampened after another multi-gap
 * floor so back-to-back doubles stay uncommon. The category slug picks physics;
 * a per-run seed (applyRunSeed) is what makes each game a different layout.
 * Same (slug, runSeed) still replays exactly (AC-11).
 *
 * Difficulty scales with altitude: gaps widen toward the physical jump limit
 * (never past it — every floor stays passable), ladders shift sideways, and
 * crates show up on most floors. Ladders offset from the floors below so they
 * do not stack into a single column.
 */

import { TowerSpec, Platform, Ladder } from "./types";
import {
  GameCategory,
  TrackArchetype,
  resolveGameCategory,
} from "./categories";
import { createRng, hashSeed } from "./rng";
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
export const DIFFICULTY_FLOORS = 50;

/**
 * Layout difficulty (0 easy → 1 hard) that floor i is generated at. The free
 * stack ramps with altitude over DIFFICULTY_FLOORS then holds; a level tower
 * pins one value for every floor via `tower.difficulty`. Every difficulty
 * knob in towers.ts, obstacles.ts and powerups.ts reads it from here.
 */
export function difficultyAt(tower: TowerSpec, i: number): number {
  const fixed = tower.difficulty;
  if (fixed === undefined) return Math.min(1, i / DIFFICULTY_FLOORS);
  if (!Number.isFinite(fixed) || fixed < 0 || fixed > 1) {
    throw new RangeError(`tower.difficulty must be in [0, 1], got ${fixed}`);
  }
  return fixed;
}

/**
 * Cache key for geometry that depends on difficulty or orb density. Towers
 * without the level fields keep the bare seed, so free-stack caches are
 * untouched; a level tower that reuses a seed at another difficulty cannot
 * read a stale layout.
 */
export function geometryCacheKey(tower: TowerSpec): string {
  const layout = [
    tower.gapReachFrac,
    tower.oneLadderChance,
    tower.minWalkM,
    tower.ladderHangM,
    tower.ladderTopGapM,
    tower.hangingLadderShare,
    tower.shortTopShare,
  ];
  if (
    tower.difficulty === undefined &&
    tower.powerUpChance === undefined &&
    layout.every((v) => v === undefined)
  ) {
    return tower.seed;
  }
  const knobs = layout.map((v) => v ?? "ramp").join(",");
  return `${tower.seed}|d=${tower.difficulty ?? "ramp"}|pu=${tower.powerUpChance ?? "ramp"}|layout=${knobs}`;
}

/** Share of a standing jump's rise a hanging ladder's bottom may sit at. */
export const MAX_LADDER_HANG_FRAC = 0.7;
/** Share of a ladder jump's rise a short top may leave to the floor above. */
export const MAX_LADDER_TOP_GAP_FRAC = 0.7;
/** A jump off a ladder launches at this share of tower.jumpSpeed (stepMatch). */
export const LADDER_JUMP_SPEED_FRAC = 0.7;
/** Gap width ceiling for level towers, as a share of a running jump's reach. */
export const MAX_GAP_REACH_FRAC = 0.75;

/** Peak rise (m) of a jump launched at `speed` under the tower's gravity. */
function jumpRise(tower: TowerSpec, speed: number): number {
  return (speed * speed) / (2 * tower.gravity);
}

/** A level layout knob, validated against [lo, hi], or undefined when unset. */
function knob(tower: TowerSpec, name: keyof TowerSpec, lo: number, hi: number): number | undefined {
  const v = tower[name];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
    throw new RangeError(`tower.${name} must be in [${lo}, ${hi}], got ${String(v)}`);
  }
  return v;
}

/** Hanging-ladder height (m) above the floor a ladder leaves; 0 on endless towers. */
export function ladderHangM(tower: TowerSpec): number {
  const max = MAX_LADDER_HANG_FRAC * jumpRise(tower, tower.jumpSpeed);
  return knob(tower, "ladderHangM", 0, max) ?? 0;
}

/**
 * Whether ladder `slot` leaving floor `i` hangs: never without a hang height,
 * always when tower.hangingLadderShare is unset or 1, otherwise a fixed coin
 * per (seed, floor, slot) that comes up hanging at that share.
 */
export function ladderHangs(tower: TowerSpec, i: number, slot: number): boolean {
  if (ladderHangM(tower) === 0) return false;
  const share = knob(tower, "hangingLadderShare", 0, 1) ?? 1;
  if (share >= 1) return true;
  return hashSeed(`${tower.seed}:hang:${i}:${slot}`) / 0x1_0000_0000 < share;
}

/** Short-top gap (m) below the floor a ladder leads to; 0 on endless towers. */
export function ladderTopGapM(tower: TowerSpec): number {
  const max = MAX_LADDER_TOP_GAP_FRAC * jumpRise(tower, LADDER_JUMP_SPEED_FRAC * tower.jumpSpeed);
  return knob(tower, "ladderTopGapM", 0, max) ?? 0;
}

/**
 * Whether ladder `slot` leaving floor `i` stops short of the floor above.
 * Only a tall ladder can: one that stands on its floor (a hanging ladder
 * never also needs a jump off) across one of the longer floor gaps (at least
 * the tower's base gap, the upper half of floorGapForFloor's range). Among
 * those, always when tower.shortTopShare is unset or 1, otherwise a fixed
 * coin per (seed, floor, slot) at that share.
 */
export function ladderHasShortTop(tower: TowerSpec, i: number, slot: number): boolean {
  if (ladderTopGapM(tower) === 0) return false;
  // Read before the tall-ladder checks so a bad share is refused on any floor.
  const share = knob(tower, "shortTopShare", 0, 1) ?? 1;
  if (ladderHangs(tower, i, slot)) return false;
  if (floorGapForFloor(tower, i) < tower.floorGap) return false;
  if (share >= 1) return true;
  return hashSeed(`${tower.seed}:top:${i}:${slot}`) / 0x1_0000_0000 < share;
}

/** Shortest walk (m) between a floor's incoming and outgoing ladders, or null. */
function minWalkM(tower: TowerSpec): number | null {
  return knob(tower, "minWalkM", 0, tower.widthM / 2) ?? null;
}

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
 * Cumulative floor heights per tower seed: prefix[i] is floor i's surface, so
 * prefix[0] is always 0 and the array grows lazily as the climb goes higher.
 *
 * Bounded because tower seeds now include a per-run id, so an unbounded map
 * retains one growing array per game ever played. Eight is generous: a session
 * climbs one tower, and the menu may preview a couple more.
 */
const FLOOR_PREFIX_CACHE = createSeedCache<number[]>(8, () => [0]);

/** Floors to extend by when searching past the cached range. */
const PREFIX_GROWTH_BLOCK = 64;

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
 * Ladder x positions per floor, grown in order so floor i can offset from the
 * real xs on i-1 / i-2 / i-3. Recursing `ladderXsForFloor(i-1)` would be
 * exponential; this cache is O(floors) like the height prefix.
 */
const LADDER_XS_CACHE = createSeedCache<number[][]>(8, () => []);

/** Centre-to-centre keep-out vs ladders on the floor below (then fading). */
const STACK_CLEAR_M = 14;
const STACK_LOOKBACK = 3;

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
  const d = difficultyAt(tower, i);
  const roll = r.next();
  // Single-ladder floors stay common low down (readable opening) and thin out.
  // Higher floors favor 2 ladders to help with wider gaps. Max is 2 (never 3).
  const oneChance = knob(tower, "oneLadderChance", 0, 1) ?? 0.5 - 0.2 * d; // 50% at floor 0, 30% at floor 50+
  if (roll < oneChance) return 1;
  return 2;
}

/** X positions of every ladder leaving floor i, primary first (deterministic). */
function ladderXsForFloor(tower: TowerSpec, i: number): number[] {
  const cache = LADDER_XS_CACHE.get(geometryCacheKey(tower));
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
  const walk = walkKeepOut(tower, cache, i);
  const raw = ladderXForFloor(tower, i);
  const xs = [
    walk.length === 0
      ? snapAwayFromStack(raw, keepOut, loBound, hiBound)
      : placeClearOfWalk(raw, keepOut, walk, loBound, hiBound),
  ];
  const count = ladderCountForFloor(tower, i);
  const r = createRng(`${tower.seed}:lx-extra:${i}`);

  for (let k = 1; k < count; k++) {
    // Place each extra in the widest stretch still clear of this floor's
    // ladders and the vertical keep-out, so spacing is guaranteed without a
    // rejection loop. A level's minimum walk outranks the lookback keep-out.
    let spans: { lo: number; hi: number }[] = [{ lo: loBound, hi: hiBound }];
    for (const x of xs) spans = punchSpan(spans, x - sep, x + sep);
    for (const o of walk) spans = punchSpan(spans, o.x - o.r, o.x + o.r);
    const walkOnly = spans;
    for (const o of keepOut) spans = punchSpan(spans, o.x - o.r, o.x + o.r);
    if (spans.length === 0 && walk.length > 0) spans = walkOnly;
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

/**
 * A level's minimum walk as keep-outs around the ladders arriving on floor i
 * (the ones leaving i-1). The tower wraps, so each is punched at x - W, x and
 * x + W. Empty on endless towers and on floor 0.
 */
function walkKeepOut(
  tower: TowerSpec,
  cache: number[][],
  i: number
): { x: number; r: number }[] {
  const r = minWalkM(tower);
  if (r === null || r === 0 || i === 0) return [];
  const w = tower.widthM;
  const out: { x: number; r: number }[] = [];
  for (const x of cache[i - 1] ?? []) {
    for (const shift of [-w, 0, w]) out.push({ x: x + shift, r });
  }
  return out;
}

/**
 * Snap `raw` clear of both the walk and the lookback keep-outs; if no x
 * clears both, clear the walk alone; if not even that fits, take the x
 * farthest from the arriving ladders (snapAwayFromStack's fallback).
 */
function placeClearOfWalk(
  raw: number,
  keepOut: { x: number; r: number }[],
  walk: { x: number; r: number }[],
  loBound: number,
  hiBound: number
): number {
  let both: { lo: number; hi: number }[] = [{ lo: loBound, hi: hiBound }];
  for (const o of [...walk, ...keepOut]) both = punchSpan(both, o.x - o.r, o.x + o.r);
  if (both.length > 0) return snapAwayFromStack(raw, [...walk, ...keepOut], loBound, hiBound);
  return snapAwayFromStack(raw, walk, loBound, hiBound);
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

/**
 * A level tower's summit: the first floor whose surface is at or above
 * `tower.goalM`, or null on an endless tower. The summit is a solid full-width
 * floor with nothing on it, and nothing exists above it. Throws on a goal that
 * is not a positive finite height (reject, never clamp).
 */
export function summitFloor(tower: TowerSpec): number | null {
  const goal = tower.goalM;
  if (goal === undefined) return null;
  if (!Number.isFinite(goal) || goal <= 0) {
    throw new RangeError(`tower.goalM must be a positive finite height, got ${goal}`);
  }
  const i = floorIndexAt(tower, goal);
  return floorHeight(tower, i) >= goal ? i : i + 1;
}

/** Every ladder leading UP from floor i to floor i+1 (one or more routes). */
export function laddersForFloor(tower: TowerSpec, i: number): Ladder[] {
  const summit = summitFloor(tower);
  if (summit !== null && i >= summit) return [];
  const floorY = floorHeight(tower, i);
  const hang = ladderHangM(tower);
  const nextY = floorHeight(tower, i + 1);
  const gap = ladderTopGapM(tower);
  return ladderXsForFloor(tower, i).map((x, slot) => ({
    x,
    y0: hang > 0 && ladderHangs(tower, i, slot) ? floorY + hang : floorY,
    y1: gap > 0 && ladderHasShortTop(tower, i, slot) ? nextY - gap : nextY,
  }));
}

/** The primary ladder leading UP from floor i (floors may have more). */
export function ladderForFloor(tower: TowerSpec, i: number): Ladder {
  return laddersForFloor(tower, i)[0];
}

/** Gap width to jump on floor i — widens with altitude but stays jumpable. */
function gapWidthForFloor(tower: TowerSpec, i: number): number {
  const reach = horizontalJumpReach(tower);
  const d = difficultyAt(tower, i);
  const frac =
    knob(tower, "gapReachFrac", 0, MAX_GAP_REACH_FRAC) ?? 0.34 + (0.6 - 0.34) * d; // 34% → 60% of jump reach
  // Stay under reach with a margin so float error never bricks a floor.
  return Math.min(reach * frac, reach * 0.92);
}

/** Standable pad between gaps so landings stay usable. */
const MIN_LANDING_M = 3.5;
/** Keep gaps off the absolute tower walls. */
const PLATFORM_EDGE_M = 1.2;
/** Max jumpable holes carved into one floor. */
const MAX_GAPS_PER_FLOOR = 3;

/**
 * Multi-gap desire: base chance for 2 / 3 gaps, ramping with altitude.
 * Kept moderate so single-gap floors stay common early.
 */
const TWO_GAP_BASE = 0.22;
const TWO_GAP_RAMP = 0.28;
const THREE_GAP_BASE = 0.08;
const THREE_GAP_RAMP = 0.22;
/**
 * After a floor that wanted 2+ gaps, cut the next floor's multi-gap odds so
 * back-to-back ("immediate") double gaps are rare without removing them.
 */
const AFTER_MULTI_GAP_FACTOR = 0.28;

/**
 * Desired gap count per floor (before corridor capacity). Grown in order so
 * floor i can dampen after floor i−1 without recomputing platforms.
 */
const DESIRED_GAPS_CACHE = createSeedCache<number[]>(8, () => [0]);

type GapSpan = { lo: number; hi: number };

/** How many gaps floor i wants before corridor / solvability limits. */
function desiredGapCount(tower: TowerSpec, i: number): number {
  const cache = DESIRED_GAPS_CACHE.get(geometryCacheKey(tower));
  growDesiredGapsTo(tower, cache, i);
  return cache[i]!;
}

function growDesiredGapsTo(
  tower: TowerSpec,
  cache: number[],
  floor: number
): void {
  for (let f = cache.length; f <= floor; f++) {
    const rng = createRng(`${tower.seed}:pgap-n:${f}`);
    const d = difficultyAt(tower, f);
    let twoChance = TWO_GAP_BASE + TWO_GAP_RAMP * d;
    let threeChance = THREE_GAP_BASE + THREE_GAP_RAMP * d;
    if (f > 1 && cache[f - 1]! >= 2) {
      twoChance *= AFTER_MULTI_GAP_FACTOR;
      threeChance *= AFTER_MULTI_GAP_FACTOR;
    }
    let want = 1;
    if (rng.next() < twoChance) want = 2;
    if (rng.next() < threeChance) want = 3;
    cache.push(want);
  }
}

/** Solid platform pieces making up floor i (1 piece, or 2–4 around 1–3 gaps). */
export function platformsForFloor(tower: TowerSpec, i: number): Platform[] {
  const y = floorHeight(tower, i);
  const w = tower.widthM;
  // Floor 0 is a safe full-width base (spawn); no incoming ladder.
  if (i === 0) return [{ x0: 0, x1: w, y }];
  // A level's summit is solid, and nothing exists above it.
  const summit = summitFloor(tower);
  if (summit !== null && i >= summit) return i === summit ? [{ x0: 0, x1: w, y }] : [];

  // Every ladder that touches this surface: the ones leaving it, plus the tops
  // of the ones arriving from the floor below. Gaps must miss all of them.
  const anchors = uniqueSorted([
    ...ladderXsForFloor(tower, i),
    ...ladderXsForFloor(tower, i - 1),
  ]);
  const clearance = tower.ladderGrabRadius + 2;
  const gapW = gapWidthForFloor(tower, i);
  const solid: Platform[] = [{ x0: 0, x1: w, y }];

  const corridors = platformCorridors(w, anchors, clearance);
  const proposals = proposeGaps(corridors, gapW, MIN_LANDING_M);
  if (proposals.length === 0) return solid;

  const rng = createRng(`${tower.seed}:pgap:${i}`);
  const maxWant = Math.min(MAX_GAPS_PER_FLOOR, proposals.length);
  const want = Math.min(desiredGapCount(tower, i), maxWant);

  // Try want, then fewer — never ship a floor that traps a ladder in a hole.
  for (let n = want; n >= 1; n--) {
    const chosen = pickGaps(proposals, n, rng);
    const pieces = carveGaps(w, y, chosen);
    if (pieces.length === 0) continue;
    if (!laddersStandable(pieces, anchors, clearance)) continue;
    if (!gapsAllPassable(pieces, horizontalJumpReach(tower))) continue;
    return pieces;
  }
  return solid;
}

/** Corridors clear of ladder keep-outs where a gap may be carved. */
function platformCorridors(
  widthM: number,
  anchors: number[],
  clear: number
): GapSpan[] {
  if (anchors.length === 0) {
    return [{ lo: PLATFORM_EDGE_M, hi: widthM - PLATFORM_EDGE_M }];
  }
  const out: GapSpan[] = [];
  const leftHi = anchors[0]! - clear;
  if (leftHi - PLATFORM_EDGE_M >= MIN_LANDING_M) {
    out.push({ lo: PLATFORM_EDGE_M, hi: leftHi });
  }
  for (let k = 0; k < anchors.length - 1; k++) {
    const lo = anchors[k]! + clear;
    const hi = anchors[k + 1]! - clear;
    if (hi - lo >= MIN_LANDING_M) out.push({ lo, hi });
  }
  const rightLo = anchors[anchors.length - 1]! + clear;
  if (widthM - PLATFORM_EDGE_M - rightLo >= MIN_LANDING_M) {
    out.push({ lo: rightLo, hi: widthM - PLATFORM_EDGE_M });
  }
  return out;
}

/**
 * Propose concrete gap intervals inside corridors. Multiple gaps in one wide
 * corridor keep MIN_LANDING_M pads between them so each landing stays usable.
 */
function proposeGaps(
  corridors: GapSpan[],
  gapW: number,
  minLand: number
): GapSpan[] {
  const props: GapSpan[] = [];
  for (const c of corridors) {
    const room = c.hi - c.lo;
    if (room < gapW) continue;
    let n = MAX_GAPS_PER_FLOOR;
    while (n > 1 && n * gapW + (n - 1) * minLand > room) n -= 1;
    if (n * gapW > room) continue;
    const free = room - n * gapW;
    const inner = n > 1 ? minLand : 0;
    const side = (free - inner * (n - 1)) / 2;
    if (side < 0) continue;
    let x = c.lo + side;
    for (let j = 0; j < n; j++) {
      props.push({ lo: x, hi: x + gapW });
      x += gapW + inner;
    }
  }
  return props;
}

/** Pick up to `n` non-overlapping proposals (seeded shuffle). */
function pickGaps(
  proposals: GapSpan[],
  n: number,
  rng: { next(): number }
): GapSpan[] {
  const order = proposals.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const chosen: GapSpan[] = [];
  for (const ix of order) {
    if (chosen.length >= n) break;
    const g = proposals[ix]!;
    if (chosen.some((c) => !(g.hi <= c.lo || g.lo >= c.hi))) continue;
    chosen.push(g);
  }
  return chosen.sort((a, b) => a.lo - b.lo);
}

function carveGaps(widthM: number, y: number, gaps: GapSpan[]): Platform[] {
  const pieces: Platform[] = [];
  let cursor = 0;
  for (const g of gaps) {
    if (g.lo > cursor + 0.05) pieces.push({ x0: cursor, x1: g.lo, y });
    cursor = g.hi;
  }
  if (cursor < widthM - 0.05) pieces.push({ x0: cursor, x1: widthM, y });
  return pieces.filter((p) => p.x1 - p.x0 > 0.5);
}

function laddersStandable(
  pieces: Platform[],
  anchors: number[],
  clear: number
): boolean {
  const pad = Math.min(clear * 0.5, 1.5);
  return anchors.every((ax) =>
    pieces.some((p) => ax >= p.x0 + pad && ax <= p.x1 - pad)
  );
}

function gapsAllPassable(pieces: Platform[], reach: number): boolean {
  for (let k = 1; k < pieces.length; k++) {
    const gap = pieces[k]!.x0 - pieces[k - 1]!.x1;
    if (!(gap > 0) || gap >= reach) return false;
  }
  return true;
}

function uniqueSorted(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

/**
 * Platforms whose surfaces lie within [yLow, yHigh] (a generation window).
 *
 * Returns a shared reusable buffer — callers must not store references across
 * ticks. The buffer is cleared and refilled on each call.
 */
const _platformBuf: Platform[] = [];
export function platformsNearY(tower: TowerSpec, yLow: number, yHigh: number): Platform[] {
  _platformBuf.length = 0;
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  for (let i = lo; i <= hi; i++) {
    const floors = platformsForFloor(tower, i);
    for (let j = 0; j < floors.length; j++) _platformBuf.push(floors[j]!);
  }
  return _platformBuf;
}

/**
 * Ladders (with floor index + slot on that floor) intersecting [yLow, yHigh].
 *
 * Returns a shared reusable buffer — callers must not store references across
 * ticks. The buffer is cleared and refilled on each call.
 */
const _ladderBuf: { ix: number; slot: number; ladder: Ladder }[] = [];
export function laddersNearY(
  tower: TowerSpec,
  yLow: number,
  yHigh: number
): { ix: number; slot: number; ladder: Ladder }[] {
  _ladderBuf.length = 0;
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  for (let i = lo; i <= hi; i++) {
    const ladders = laddersForFloor(tower, i);
    for (let j = 0; j < ladders.length; j++) {
      _ladderBuf.push({ ix: i, slot: j, ladder: ladders[j]! });
    }
  }
  return _ladderBuf;
}
