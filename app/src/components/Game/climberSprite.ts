/**
 * Climber sprites, one character per avatar id.
 *
 * Which art each avatar wears is data in climberCharacters.ts: a `sheets`
 * entry has its own atlases in /climb/ (layout contract in
 * public/climb/README.md), a `tint` entry recolours the Wraith's. The Wraith
 * (the default, and the fallback for unknown/null ids) ships a poses sheet
 * (wraith-poses-192.png, 4×2 cells) for idle/walk/air/done/dead and a 6-frame
 * back-view climb strip (wraith-climb-192.png) so the climber shows its back on
 * a ladder. Both are the pack's 512px cells downscaled to 192px and palette
 * quantised, ~70 KB for both. Every frame shares one foot anchor per character.
 *
 * Loading is lazy per character: nothing is requested until that character is
 * first drawn, then its sheets decode together (a tint loads the Wraith's).
 * Until its poses sheet is ready climberFrame returns null and the caller draws
 * the vector climber (drawClimber); after that a pose on a sheet still in
 * flight (or one that failed, or a character with no climb strip) borrows its
 * poses-sheet fallback, so the figure never flashes back to the vector climber
 * mid-run. A character whose own poses sheet fails to load draws as the Wraith.
 * A tint is rendered once per character and sheet into an offscreen canvas and
 * reused. Left-facing movement is mirrored in-engine.
 *
 * Motion. The artwork only has two run poses, so smoothness comes from the
 * engine rather than more frames:
 *  - walk/climb cycles advance by DISTANCE (freeze when the climber stops) and
 *    crossfade briefly across each frame boundary;
 *  - a walk bob and stretch synced to the step (low + squashed on contact, high
 *    + stretched mid-stride), and a slight lean into the movement;
 *  - idle breathing, a vy-driven stretch in the air, and a squash on landing;
 *  - a short crossfade when the pose changes (idle → walk → air …).
 * Reduced motion turns all of it off: frame 0 of each cycle, no transforms.
 * The hot path allocates nothing: results land in module-scope scratch objects.
 */

import { parseAvatarId } from "../../lib/avatars";
import {
  BASE_CHARACTER_ID,
  CLIMBER_CHARACTERS,
  WRAITH,
  type ClimberCharacter,
  type SheetCharacter,
} from "./climberCharacters";
import { renderTintedSheet, tintSpec, type TintSpec } from "./climberTint";

/** Source cell edge in the Wraith atlases (px). */
export const CELL = WRAITH.cell;
/** Displayed figure height in `s` units — tuned to sit near the vector body. */
export const DISPLAY_H_IN_S = 3.0;

/**
 * The walk/climb cycles advance by DISTANCE, not wall-clock — so they sync to
 * speed and, crucially, freeze when the climber is not moving. moveSpeed is a
 * constant ~12–16 m/s (the sim has no slow walk), so one step per 4.5 m gives
 * ~3 steps/s: brisk for a chibi without sprint-blur.
 */
export const WALK_M_PER_STEP = 4.5;
const CLIMB_M_PER_FRAME = 0.65; // vertical metres per climb-cycle frame

/** Fraction of each step/frame (either side of a boundary) spent crossfading. */
export const CYCLE_BLEND = 0.14;
/** Seconds a pose change takes to crossfade from the previous frame. */
export const POSE_BLEND_S = 0.08;

// Procedural motion, as fractions of the displayed figure height / radians.
export const WALK_BOB = 0.045; // mid-stride lift
const WALK_STRETCH = 0.035; // ± scaleY across the step
export const WALK_LEAN = 0.06; // ~3.4°, into the direction of travel
const AIR_LEAN = 0.035;
const AIR_STRETCH = 0.09; // at |vy| >= AIR_STRETCH_VY
const AIR_STRETCH_VY = 16;
const BREATH = 0.018; // idle scaleY amplitude
const BREATH_PERIOD_S = 2.6;
export const LAND_SQUASH = 0.16; // max scaleY loss on touchdown
export const LAND_S = 0.16; // touchdown recovery time
const LEAN_RATE = 14; // 1/s — lean eases toward its target

export type Pose = "idle" | "walk" | "climb" | "air" | "done" | "dead";
type Sheet = "poses" | "climb";
const SHEETS: readonly Sheet[] = ["poses", "climb"];

// Columns per sheet, so a frame's cell index maps to a source rect.
const COLS: Record<Sheet, number> = { poses: 4, climb: 6 };

type Anim = { sheet: Sheet; frames: readonly number[] };

/**
 * Per pose: which sheet and the cell indices it cycles through. Walk and climb
 * are distance-driven cycles; the rest are single poses out of the poses sheet.
 *
 * Walk alternates the poses sheet's upright run-a/run-b (cells 1,2) — the
 * pack's 8-frame side-profile strips read as a thin, leaning figure at game
 * size and do not match the three-quarter poses. Climb uses the back-view strip
 * so the climber faces the ladder; the front-facing reach poses (cells 3,4)
 * are its fallback while the strip loads (or when a character has none).
 */
const ANIM: Record<Pose, Anim & { fallback?: Anim }> = {
  idle: { sheet: "poses", frames: [0] },
  walk: { sheet: "poses", frames: [1, 2] },
  climb: {
    sheet: "climb",
    frames: [0, 1, 2, 3, 4, 5],
    fallback: { sheet: "poses", frames: [3, 4] },
  },
  air: { sheet: "poses", frames: [5] },
  done: { sheet: "poses", frames: [6] },
  dead: { sheet: "poses", frames: [7] },
};

const mod = (n: number, m: number): number => ((n % m) + m) % m;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => t * t * (3 - 2 * t);
// Own-property check (avatars.ts explains why not Object.hasOwn here).
const hasOwn = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/** Default Wraith sheet URLs (web: served from public/climb/). */
export const CLIMBER_SPRITE_SRC: Record<Sheet, string> = {
  poses: WRAITH.poses,
  climb: WRAITH.climb ?? "",
};

/** What a frame is cut from: a decoded sheet, or a tint's offscreen canvas. */
export type SpriteSource = HTMLImageElement | HTMLCanvasElement;

/** A character's cell geometry. */
export type ClimberGeometry = Pick<
  SheetCharacter,
  "cell" | "rootX" | "rootY" | "refH"
>;

interface TintCache {
  /** The base image the canvas was rendered from; a new base re-renders. */
  from: HTMLImageElement;
  /** Null when the tint could not be rendered: draw the base as-is. */
  out: HTMLCanvasElement | null;
}

/** Runtime state for one character, created on its first draw. */
interface CharacterRuntime {
  readonly id: string;
  readonly def: ClimberCharacter;
  /** Sheets kind: the URLs in use (after overrides); null = no such sheet. */
  readonly src: Record<Sheet, string | null>;
  images: Partial<Record<Sheet, HTMLImageElement>>;
  failed: Partial<Record<Sheet, boolean>>;
  /** Tint kind only. */
  readonly spec: TintSpec | null;
  tints: Partial<Record<Sheet, TintCache>>;
}

const runtimes = new Map<string, CharacterRuntime>();
const overrides = new Map<string, Partial<Record<Sheet, string>>>();

/**
 * The registry id to draw for an avatar id: the avatar's own entry, or the
 * Wraith for null, unknown, retired, or prototype-key ids ("__proto__").
 */
export function resolveClimberCharacter(avatarId: unknown): string {
  const id = parseAvatarId(avatarId);
  return id !== null && hasOwn(CLIMBER_CHARACTERS, id) ? id : BASE_CHARACTER_ID;
}

/** The character's registry entry (via resolveClimberCharacter). */
export function climberCharacter(avatarId: unknown): ClimberCharacter {
  return CLIMBER_CHARACTERS[resolveClimberCharacter(avatarId)];
}

function runtimeFor(id: string): CharacterRuntime {
  let rt = runtimes.get(id);
  if (rt) return rt;
  const def = CLIMBER_CHARACTERS[id];
  const over = overrides.get(id) ?? {};
  rt = {
    id,
    def,
    src:
      def.kind === "sheets"
        ? { poses: over.poses ?? def.poses, climb: def.climb === null ? null : (over.climb ?? def.climb) }
        : { poses: null, climb: null },
    images: {},
    failed: {},
    spec: def.kind === "tint" ? tintSpec(def) : null,
    tints: {},
  };
  runtimes.set(id, rt);
  return rt;
}

/**
 * Point a character's sheets at bundled asset URLs (the Capacitor app has no
 * server root for "/climb/…", same as the volcano tile). Only characters with
 * their own sheets take overrides; tints follow the Wraith's. Drops that
 * character's decode cache so the new sources load on its next draw. Empty or
 * unchanged sources are ignored, as are ids that are not a sheets character.
 */
export function setClimberSpriteSrc(
  next: Partial<Record<Sheet, string>>,
  avatarId: string = BASE_CHARACTER_ID,
): void {
  const id = parseAvatarId(avatarId);
  if (id === null || !hasOwn(CLIMBER_CHARACTERS, id)) return;
  const current = runtimeFor(id).src; // all null for a tint: nothing to override
  const over = { ...(overrides.get(id) ?? {}) };
  let changed = false;
  for (const sheet of SHEETS) {
    const url = next[sheet];
    if (!url || url === current[sheet] || current[sheet] === null) continue;
    over[sheet] = url;
    changed = true;
  }
  if (!changed) return;
  overrides.set(id, over);
  runtimes.delete(id); // rebuilt with the new URLs on the next draw
}

function loadSheet(rt: CharacterRuntime, sheet: Sheet): void {
  const url = rt.src[sheet];
  if (url === null) return;
  const img = new Image();
  img.onerror = () => {
    rt.failed[sheet] = true;
  };
  img.src = url;
  rt.images[sheet] = img;
}

/** A sheets character's decoded image, else null. The first call requests every sheet. */
function ownSheet(rt: CharacterRuntime, sheet: Sheet): HTMLImageElement | null {
  if (typeof Image === "undefined") return null; // SSR / offscreen export
  if (!rt.images.poses && !rt.failed.poses) SHEETS.forEach((s) => loadSheet(rt, s));
  if (rt.failed[sheet]) return null;
  const img = rt.images[sheet];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** A tint's recoloured sheet (rendered once per base image), or the base itself. */
function tintedSheet(rt: CharacterRuntime, sheet: Sheet): SpriteSource | null {
  const base = ownSheet(runtimeFor(BASE_CHARACTER_ID), sheet);
  if (!base) return null;
  let cache = rt.tints[sheet];
  if (!cache || cache.from !== base) {
    cache = { from: base, out: rt.spec ? renderTintedSheet(base, rt.spec) : null };
    rt.tints[sheet] = cache;
  }
  return cache.out ?? base;
}

function sheetFor(rt: CharacterRuntime, sheet: Sheet): SpriteSource | null {
  return rt.def.kind === "sheets" ? ownSheet(rt, sheet) : tintedSheet(rt, sheet);
}

/** The runtime whose art draws for `id`: itself, or the Wraith if its own poses failed. */
function artFor(id: string): CharacterRuntime {
  const rt = runtimeFor(id);
  if (rt.def.kind === "sheets" && id !== BASE_CHARACTER_ID) {
    ownSheet(rt, "poses"); // starts the load on first use
    if (rt.failed.poses) return runtimeFor(BASE_CHARACTER_ID);
  }
  return rt;
}

function geometryOf(rt: CharacterRuntime): ClimberGeometry {
  return rt.def.kind === "sheets" ? rt.def : WRAITH;
}

export interface ClimberFrame {
  img: SpriteSource;
  sx: number;
  sy: number;
  /** Frame to blend in over `sx/sy` (equal to them when not blending). */
  bx: number;
  by: number;
  /** Weight of the b frame, 0…0.5 — 0.5 exactly on a frame boundary. */
  blend: number;
  /** Walk only: fraction through the current step, 0 = foot contact. */
  step: number;
  /** Cell size and foot anchor of the character drawn. */
  geom: ClimberGeometry;
  /** Registry id of the art drawn (the Wraith when falling back). */
  character: string;
}

// Scratch result: valid until the next climberFrame call.
const frameOut = {
  img: null as unknown as SpriteSource,
  sx: 0,
  sy: 0,
  bx: 0,
  by: 0,
  blend: 0,
  step: 0,
  geom: WRAITH as ClimberGeometry,
  character: BASE_CHARACTER_ID,
} satisfies ClimberFrame;

/**
 * The atlas frame for a pose given the climber's world position (tower metres),
 * or null when its sheet has not decoded (caller draws the vector climber
 * instead). Walk/climb advance with distance travelled — so a stationary
 * climber holds a frame — and crossfade into the neighbouring frame across each
 * boundary: weight rises to 0.5 at the boundary and, since the dominant frame
 * swaps there, falls back symmetrically, so the blend is continuous.
 * Reduced motion: frame 0, no blend. `avatarId` picks the character (null or
 * unknown: the Wraith).
 *
 * Returns a shared object — read it before the next call.
 */
export function climberFrame(
  pose: Pose,
  x: number,
  y: number,
  reducedMotion: boolean,
  avatarId: unknown = null,
): ClimberFrame | null {
  const rt = artFor(resolveClimberCharacter(avatarId));
  const anim = ANIM[pose];
  let cfg: Anim = anim;
  let img = sheetFor(rt, anim.sheet);
  if (!img && anim.fallback) {
    cfg = anim.fallback;
    img = sheetFor(rt, cfg.sheet);
  }
  if (!img) return null;
  const geom = geometryOf(rt);
  const cell = geom.cell;
  const n = cfg.frames.length;
  let i = 0;
  let j = 0;
  let blend = 0;
  let step = 0;
  if (!reducedMotion && n > 1) {
    const phase =
      pose === "climb" ? y / CLIMB_M_PER_FRAME : x / WALK_M_PER_STEP;
    const whole = Math.floor(phase);
    const f = phase - whole;
    step = f;
    i = mod(whole, n);
    j = i;
    if (f > 1 - CYCLE_BLEND) {
      j = mod(whole + 1, n);
      blend = 0.5 * smooth((f - (1 - CYCLE_BLEND)) / CYCLE_BLEND);
    } else if (f < CYCLE_BLEND) {
      j = mod(whole - 1, n);
      blend = 0.5 * smooth(1 - f / CYCLE_BLEND);
    }
  }
  const cols = COLS[cfg.sheet];
  const a = cfg.frames[i];
  const b = cfg.frames[j];
  frameOut.img = img;
  frameOut.sx = (a % cols) * cell;
  frameOut.sy = Math.floor(a / cols) * cell;
  frameOut.bx = (b % cols) * cell;
  frameOut.by = Math.floor(b / cols) * cell;
  frameOut.blend = blend;
  frameOut.step = step;
  frameOut.geom = geom;
  frameOut.character = rt.id;
  return frameOut;
}

/** Procedural transform about the foot anchor. Heights are in figure heights. */
export interface ClimberMotion {
  lift: number;
  scaleX: number;
  scaleY: number;
  /** Radians, positive leans toward the facing direction. */
  lean: number;
}

export interface ClimberMotionInput {
  pose: Pose;
  /** Walk step fraction from climberFrame (0 = contact). */
  step: number;
  vx: number;
  vy: number;
  /** Seconds on a free-running clock (idle breathing). */
  timeSec: number;
  /** Seconds since touchdown, or Infinity. */
  landAgeSec: number;
  /** Touchdown strength 0…1. */
  landImpact: number;
  reducedMotion: boolean;
}

const motionOut: ClimberMotion = { lift: 0, scaleX: 1, scaleY: 1, lean: 0 };

/** Lean the pose wants (before easing). */
export function targetLean(pose: Pose, vx: number): number {
  if (Math.abs(vx) <= 0.1) return 0;
  return pose === "walk" ? WALK_LEAN : pose === "air" ? AIR_LEAN : 0;
}

/**
 * Secondary motion for a pose — pure; returns a shared object. Identity under
 * reduced motion and for climb/done/dead (their art carries the motion).
 */
export function climberMotion(m: ClimberMotionInput): ClimberMotion {
  motionOut.lift = 0;
  motionOut.scaleX = 1;
  motionOut.scaleY = 1;
  motionOut.lean = 0;
  if (m.reducedMotion) return motionOut;
  let sy = 1;
  if (m.pose === "walk") {
    const arc = Math.sin(Math.PI * m.step); // 0 at contact, 1 mid-stride
    motionOut.lift = WALK_BOB * arc;
    sy = 1 + WALK_STRETCH * (2 * arc - 1);
    motionOut.lean = targetLean("walk", m.vx);
  } else if (m.pose === "idle") {
    sy = 1 + BREATH * Math.sin((2 * Math.PI * m.timeSec) / BREATH_PERIOD_S);
  } else if (m.pose === "air") {
    sy = 1 + AIR_STRETCH * clamp01(Math.abs(m.vy) / AIR_STRETCH_VY);
    motionOut.lean = targetLean("air", m.vx);
  }
  if ((m.pose === "walk" || m.pose === "idle") && m.landAgeSec < LAND_S) {
    const k = 1 - m.landAgeSec / LAND_S;
    sy -= LAND_SQUASH * clamp01(m.landImpact) * k * k;
    if (m.pose === "walk") motionOut.lift *= 1 - k; // feet stay planted on impact
  }
  motionOut.scaleY = sy;
  // Keep the volume roughly constant: wider when squashed, thinner when stretched.
  motionOut.scaleX = 1 - (sy - 1) * 0.6;
  return motionOut;
}

/** Per-climber memory for the effects that need history. */
interface SlotMotion {
  pose: Pose | null;
  /** Art drawn last; a change drops the pose crossfade (cells may differ). */
  character: string | null;
  airVy: number;
  landAt: number;
  landImpact: number;
  lean: number;
  /** Frame on screen before the last pose change, and when it changed. */
  prevImg: SpriteSource | null;
  prevSx: number;
  prevSy: number;
  curImg: SpriteSource | null;
  curSx: number;
  curSy: number;
  changedAt: number;
  /** Bag clock at this climber's last draw (lean easing step). */
  drawnAt: number;
}

/**
 * Persistent motion state across paints, like the camera bag: create one per
 * canvas and pass it every frame. Without it the draw is stateless (no landing
 * squash, pose crossfade or eased lean; breathing follows the sim tick).
 */
export interface ClimberMotionBag {
  clock: number;
  slots: SlotMotion[];
}

export function createClimberMotionBag(): ClimberMotionBag {
  return { clock: 0, slots: [] };
}

/** Advance the bag's clock once per paint. */
export function tickClimberMotion(bag: ClimberMotionBag, dtSec: number): void {
  if (dtSec > 0 && Number.isFinite(dtSec)) bag.clock += Math.min(dtSec, 0.25);
}

function slotOf(bag: ClimberMotionBag, slot: number): SlotMotion {
  let s = bag.slots[slot];
  if (!s) {
    s = {
      pose: null,
      character: null,
      airVy: 0,
      landAt: -Infinity,
      landImpact: 0,
      lean: 0,
      prevImg: null,
      prevSx: 0,
      prevSy: 0,
      curImg: null,
      curSx: 0,
      curSy: 0,
      changedAt: -Infinity,
      drawnAt: -Infinity,
    };
    bag.slots[slot] = s;
  }
  return s;
}

export interface ClimberSpriteState {
  pose: Pose;
  x: number;
  y: number;
  vx: number;
  vy: number;
  slot: number;
  /** Avatar id choosing the character; null/unknown/absent draws the Wraith. */
  avatarId?: string | null;
}

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scratchTried = false;

/** A canvas at least `cell` square for true (additive, premultiplied) crossfades. */
function blendCanvas(cell: number): CanvasRenderingContext2D | null {
  if (!scratchTried) {
    scratchTried = true;
    if (typeof document !== "undefined") {
      scratch = document.createElement("canvas");
      scratchCtx = scratch.getContext("2d");
    }
  }
  // Guarded: assigning a canvas dimension clears it even when unchanged.
  if (scratch && (scratch.width < cell || scratch.height < cell)) {
    scratch.width = Math.max(scratch.width, cell);
    scratch.height = Math.max(scratch.height, cell);
  }
  return scratchCtx;
}

type DrawCtx = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "translate" | "scale" | "rotate" | "drawImage"
>;

/**
 * Draw one climber as its avatar's character, foot-anchored at (fx, fy) and
 * scaled to the climber's `s`. Returns false (nothing drawn) until the
 * character's atlas decodes, so the caller can draw the vector climber instead.
 *
 * The transform is applied around the foot anchor: mirror for facing, then
 * lean, then squash/stretch, so feet stay put and the lean always lands in the
 * direction of travel. `tickSec` drives breathing when there is no bag.
 */
export function drawClimberSprite(
  ctx: DrawCtx,
  fx: number,
  fy: number,
  s: number,
  facing: 1 | -1,
  c: ClimberSpriteState,
  reducedMotion: boolean,
  bag: ClimberMotionBag | null,
  tickSec: number,
): boolean {
  const f = climberFrame(c.pose, c.x, c.y, reducedMotion, c.avatarId ?? null);
  if (!f) return false;
  const { cell, rootX, rootY, refH } = f.geom;

  let blendImg = f.img;
  let bx = f.bx;
  let by = f.by;
  let blend = f.blend;
  let lean = targetLean(c.pose, c.vx);
  let landAge = Infinity;
  let landImpact = 0;
  let timeSec = tickSec;

  if (bag) {
    const m = slotOf(bag, c.slot);
    const now = bag.clock;
    timeSec = now;
    if (m.character !== f.character) {
      // New art for this slot: never crossfade from another character's cell.
      m.character = f.character;
      m.prevImg = null;
    }
    if (m.pose !== c.pose) {
      if (m.pose === "air" && (c.pose === "idle" || c.pose === "walk")) {
        m.landAt = now;
        m.landImpact = clamp01(Math.abs(m.airVy) / AIR_STRETCH_VY);
      }
      if (m.pose !== null) {
        m.prevImg = m.curImg;
        m.prevSx = m.curSx;
        m.prevSy = m.curSy;
        m.changedAt = now;
      }
      m.pose = c.pose;
    }
    if (c.pose === "air") m.airVy = c.vy;
    m.curImg = f.img;
    m.curSx = f.sx;
    m.curSy = f.sy;
    landAge = now - m.landAt;
    landImpact = m.landImpact;
    // First draw (or after a long gap) snaps; otherwise ease toward the target.
    const dt = now - m.drawnAt;
    m.drawnAt = now;
    m.lean =
      dt > 0.25
        ? lean
        : m.lean + (lean - m.lean) * (1 - Math.exp(-LEAN_RATE * dt));
    lean = m.lean;
    const poseAge = now - m.changedAt;
    if (!reducedMotion && m.prevImg && poseAge < POSE_BLEND_S) {
      // The pose change wins over the in-cycle blend for its first ~80 ms.
      blendImg = m.prevImg;
      bx = m.prevSx;
      by = m.prevSy;
      blend = 1 - poseAge / POSE_BLEND_S;
    }
  }

  const mo = climberMotion({
    pose: c.pose,
    step: f.step,
    vx: c.vx,
    vy: c.vy,
    timeSec,
    landAgeSec: landAge,
    landImpact,
    reducedMotion,
  });
  if (reducedMotion) lean = 0;

  const scale = (DISPLAY_H_IN_S * s) / refH; // cell px → screen px
  const size = cell * scale;
  ctx.save();
  ctx.translate(fx, fy - mo.lift * DISPLAY_H_IN_S * s);
  if (facing === -1) ctx.scale(-1, 1);
  if (lean !== 0) ctx.rotate(lean);
  if (mo.scaleX !== 1 || mo.scaleY !== 1) ctx.scale(mo.scaleX, mo.scaleY);
  const dx = -rootX * scale;
  const dy = -rootY * scale;
  const sameFrame = blendImg === f.img && bx === f.sx && by === f.sy;
  const bctx = blend > 0.002 && !sameFrame ? blendCanvas(cell) : null;
  if (bctx && scratch) {
    bctx.globalCompositeOperation = "copy";
    bctx.globalAlpha = 1 - blend;
    bctx.drawImage(f.img, f.sx, f.sy, cell, cell, 0, 0, cell, cell);
    bctx.globalCompositeOperation = "lighter";
    bctx.globalAlpha = blend;
    bctx.drawImage(blendImg, bx, by, cell, cell, 0, 0, cell, cell);
    ctx.drawImage(scratch, 0, 0, cell, cell, dx, dy, size, size);
  } else {
    // No scratch canvas (SSR/tests) or no blend: draw the nearer frame.
    const useB = blend > 0.5 && !sameFrame;
    ctx.drawImage(
      useB ? blendImg : f.img,
      useB ? bx : f.sx,
      useB ? by : f.sy,
      cell,
      cell,
      dx,
      dy,
      size,
      size,
    );
  }
  ctx.restore();
  return true;
}
