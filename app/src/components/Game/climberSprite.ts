/**
 * Default climber sprite — the lime "Wraith" character.
 *
 * Artwork lives in /climb/: a poses sheet (wraith-poses-192.png, 4×2 cells) for
 * idle/walk/air/done/dead, and the 6-frame back-view climb strip
 * (wraith-climb-192.png) so the climber shows its back while on a ladder. Both
 * are the wraith pack's 512px cells downscaled to 192px (the figure draws at
 * ~30 CSS px, ~160 device px at most for a giant on a 3× screen) and palette
 * quantised, ~70 KB for both. Every frame shares the pack's anchor: foot root at
 * (256, 460) of a 512 cell with a 380px idle body height, scaled with the cell.
 *
 * Both sheets start decoding together on the first call. Until the poses sheet
 * is ready climberFrame returns null and the caller draws the vector climber
 * (drawClimber); after that a pose on a sheet still in flight (or one that
 * failed) borrows its poses-sheet fallback, so the figure never flashes back to
 * the vector climber mid-run. Left-facing movement is mirrored in-engine.
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

/** Source cell edge in the shipped atlases (px). */
export const CELL = 192;
const PACK_CELL = 512; // the pack's original cell, where its anchors are measured
const K = CELL / PACK_CELL;
const ROOT_X = 256 * K; // foot anchor within a cell (manifest pivot)
const ROOT_Y = 460 * K;
const REF_H = 380 * K; // idle visible height — one common scale for every state
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
 * are its fallback while the strip loads.
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

export const CLIMBER_SPRITE_SRC: Record<Sheet, string> = {
  poses: "/climb/wraith-poses-192.png",
  climb: "/climb/wraith-climb-192.png",
};

const src: Record<Sheet, string> = { ...CLIMBER_SPRITE_SRC };
const images: Partial<Record<Sheet, HTMLImageElement>> = {};
const failed: Partial<Record<Sheet, boolean>> = {};

/**
 * Point the sheets at bundled asset URLs (the Capacitor app has no server root
 * for "/climb/…", same as the volcano tile). Resets the decode cache so the new
 * sources load on the next draw. Empty or unchanged sources are ignored.
 */
export function setClimberSpriteSrc(
  next: Partial<Record<Sheet, string>>,
): void {
  let changed = false;
  for (const sheet of Object.keys(src) as Sheet[]) {
    const url = next[sheet];
    if (!url || url === src[sheet]) continue;
    src[sheet] = url;
    changed = true;
  }
  if (!changed) return;
  for (const sheet of Object.keys(src) as Sheet[]) {
    delete images[sheet];
    delete failed[sheet];
  }
}

function loadSheet(sheet: Sheet): void {
  const img = new Image();
  img.onerror = () => {
    failed[sheet] = true;
  };
  img.src = src[sheet];
  images[sheet] = img;
}

/** The sheet's image once decoded, else null. The first call requests every sheet. */
function ensureSheet(sheet: Sheet): HTMLImageElement | null {
  if (typeof Image === "undefined") return null; // SSR / offscreen export
  if (!images.poses) (Object.keys(src) as Sheet[]).forEach(loadSheet);
  if (failed[sheet]) return null;
  const img = images[sheet];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export interface ClimberFrame {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  /** Frame to blend in over `sx/sy` (equal to them when not blending). */
  bx: number;
  by: number;
  /** Weight of the b frame, 0…0.5 — 0.5 exactly on a frame boundary. */
  blend: number;
  /** Walk only: fraction through the current step, 0 = foot contact. */
  step: number;
}

// Scratch result: valid until the next climberFrame call.
const frameOut = {
  img: null as unknown as HTMLImageElement,
  sx: 0,
  sy: 0,
  bx: 0,
  by: 0,
  blend: 0,
  step: 0,
} satisfies ClimberFrame;

/**
 * The atlas frame for a pose given the climber's world position (tower metres),
 * or null when its sheet has not decoded (caller draws the vector climber
 * instead). Walk/climb advance with distance travelled — so a stationary
 * climber holds a frame — and crossfade into the neighbouring frame across each
 * boundary: weight rises to 0.5 at the boundary and, since the dominant frame
 * swaps there, falls back symmetrically, so the blend is continuous.
 * Reduced motion: frame 0, no blend.
 *
 * Returns a shared object — read it before the next call.
 */
export function climberFrame(
  pose: Pose,
  x: number,
  y: number,
  reducedMotion: boolean,
): ClimberFrame | null {
  const anim = ANIM[pose];
  let cfg: Anim = anim;
  let img = ensureSheet(anim.sheet);
  if (!img && anim.fallback) {
    cfg = anim.fallback;
    img = ensureSheet(cfg.sheet);
  }
  if (!img) return null;
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
  frameOut.sx = (a % cols) * CELL;
  frameOut.sy = Math.floor(a / cols) * CELL;
  frameOut.bx = (b % cols) * CELL;
  frameOut.by = Math.floor(b / cols) * CELL;
  frameOut.blend = blend;
  frameOut.step = step;
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
  airVy: number;
  landAt: number;
  landImpact: number;
  lean: number;
  /** Frame on screen before the last pose change, and when it changed. */
  prevImg: HTMLImageElement | null;
  prevSx: number;
  prevSy: number;
  curImg: HTMLImageElement | null;
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
}

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scratchTried = false;

/** A CELL×CELL canvas for true (additive, premultiplied) crossfades. */
function blendCanvas(): CanvasRenderingContext2D | null {
  if (!scratchTried) {
    scratchTried = true;
    if (typeof document !== "undefined") {
      scratch = document.createElement("canvas");
      scratch.width = CELL;
      scratch.height = CELL;
      scratchCtx = scratch.getContext("2d");
    }
  }
  return scratchCtx;
}

type DrawCtx = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "translate" | "scale" | "rotate" | "drawImage"
>;

/**
 * Draw the Wraith for one climber, foot-anchored at (fx, fy) and scaled to the
 * climber's `s`. Returns false (nothing drawn) until the atlas decodes, so the
 * caller can draw the vector climber instead.
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
  const f = climberFrame(c.pose, c.x, c.y, reducedMotion);
  if (!f) return false;

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

  const scale = (DISPLAY_H_IN_S * s) / REF_H; // cell px → screen px
  const size = CELL * scale;
  ctx.save();
  ctx.translate(fx, fy - mo.lift * DISPLAY_H_IN_S * s);
  if (facing === -1) ctx.scale(-1, 1);
  if (lean !== 0) ctx.rotate(lean);
  if (mo.scaleX !== 1 || mo.scaleY !== 1) ctx.scale(mo.scaleX, mo.scaleY);
  const dx = -ROOT_X * scale;
  const dy = -ROOT_Y * scale;
  const sameFrame = blendImg === f.img && bx === f.sx && by === f.sy;
  const bctx = blend > 0.002 && !sameFrame ? blendCanvas() : null;
  if (bctx && scratch) {
    bctx.globalCompositeOperation = "copy";
    bctx.globalAlpha = 1 - blend;
    bctx.drawImage(f.img, f.sx, f.sy, CELL, CELL, 0, 0, CELL, CELL);
    bctx.globalCompositeOperation = "lighter";
    bctx.globalAlpha = blend;
    bctx.drawImage(blendImg, bx, by, CELL, CELL, 0, 0, CELL, CELL);
    ctx.drawImage(scratch, 0, 0, CELL, CELL, dx, dy, size, size);
  } else {
    // No scratch canvas (SSR/tests) or no blend: draw the nearer frame.
    const useB = blend > 0.5 && !sameFrame;
    ctx.drawImage(
      useB ? blendImg : f.img,
      useB ? bx : f.sx,
      useB ? by : f.sy,
      CELL,
      CELL,
      dx,
      dy,
      size,
      size,
    );
  }
  ctx.restore();
  return true;
}
