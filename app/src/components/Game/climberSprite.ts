/**
 * Default climber sprite — the lime "Wraith" character.
 *
 * Artwork comes from the wraith pack, copied into /climb/: a single poses sheet
 * (wraith-poses.png, 4×2 of 512px cells). Walk and climb are 2-frame cycles out
 * of that sheet (run-a/run-b, reach-a/reach-b) — the pronounced 3/4-view poses
 * read at the ~30px in-game size, where the dedicated back-view climb strip's
 * subtle motion vanished into a glide. Every frame shares the manifest anchor:
 * a 512px cell whose foot root is (256, 460), with a ~380px idle body height,
 * so one scale and one draw path cover them all.
 *
 * Images decode lazily (same pattern as climbBackground's ensureTile); until a
 * pose's sheet is ready, climberFrame returns null and the caller falls back to
 * the vector climber (drawClimber). Left-facing movement is mirrored in-engine.
 */

const CELL = 512;
const ROOT_X = 256; // foot anchor within a cell (manifest pivot)
const ROOT_Y = 460;
const REF_H = 380; // idle visible height — one common scale for every state
/** Displayed figure height in `s` units — tuned to sit near the vector body. */
const DISPLAY_H_IN_S = 3.0;
/**
 * The walk/climb cycles advance by DISTANCE, not wall-clock — so they sync to
 * speed and, crucially, freeze when the climber is not moving. These set how
 * far (tower metres) the climber travels per animation frame.
 */
// Cadence = moveSpeed / WALK_M_PER_FRAME. moveSpeed is a constant ~14 m/s
// (the sim has no slow walk — you're stopped or full speed), so a large value
// here keeps the leg turnover to ~2 steps/s instead of a sprint-blur.
const WALK_M_PER_FRAME = 6.0; // horizontal metres per walk-cycle frame
const CLIMB_M_PER_FRAME = 2.0; // vertical metres per climb-cycle (reach) frame

type Pose = "idle" | "walk" | "climb" | "air" | "done" | "dead";
type Sheet = "poses";

// Columns in the poses sheet, so a cell index maps to a source rect.
const COLS: Record<Sheet, number> = { poses: 4 };

/**
 * Per pose: the poses-sheet cells it cycles through. Walk and climb are 2-frame
 * distance-driven cycles; the rest are single poses.
 *
 * Walk uses upright run-a/run-b (cells 1,2) and climb uses the reach-a/reach-b
 * overhead reaches (cells 3,4) — both pronounced 3/4-view poses. The dedicated
 * 8-frame run strip read as a hunched "troll run", and the 6-frame back-view
 * climb strip's motion was too subtle to see at game size (it looked like a
 * glide), so both are dropped in favour of these readable poses.
 */
const ANIM: Record<Pose, { sheet: Sheet; frames: readonly number[] }> = {
  idle: { sheet: "poses", frames: [0] },
  walk: { sheet: "poses", frames: [1, 2] },
  climb: { sheet: "poses", frames: [3, 4] },
  air: { sheet: "poses", frames: [5] },
  done: { sheet: "poses", frames: [6] },
  dead: { sheet: "poses", frames: [7] },
};

const mod = (n: number, m: number): number => ((n % m) + m) % m;

const SRC: Record<Sheet, string> = {
  poses: "/climb/wraith-poses.png",
};

const images: Partial<Record<Sheet, HTMLImageElement>> = {};
const failed: Partial<Record<Sheet, boolean>> = {};

function ensureSheet(sheet: Sheet): HTMLImageElement | null {
  if (failed[sheet]) return null;
  const cached = images[sheet];
  if (cached && cached.complete && cached.naturalWidth > 0) return cached;
  if (typeof Image === "undefined") return null; // SSR / offscreen export
  if (!cached) {
    const img = new Image();
    img.onload = () => undefined;
    img.onerror = () => {
      failed[sheet] = true;
    };
    img.src = SRC[sheet];
    images[sheet] = img;
    return null;
  }
  return cached.complete && cached.naturalWidth > 0 ? cached : null;
}

export interface ClimberFrame {
  img: HTMLImageElement;
  sx: number;
  sy: number;
}

/**
 * The atlas frame for a pose given the climber's world position (tower metres),
 * or null when its sheet has not decoded (caller draws the vector climber
 * instead). Walk/climb advance with distance travelled — so a stationary
 * climber holds a frame — and freeze to frame 0 under reduced motion.
 */
export function climberFrame(
  pose: Pose,
  x: number,
  y: number,
  reducedMotion: boolean
): ClimberFrame | null {
  const cfg = ANIM[pose];
  const img = ensureSheet(cfg.sheet);
  if (!img) return null;
  let i = 0;
  if (!reducedMotion && cfg.frames.length > 1) {
    const phase =
      pose === "climb" ? y / CLIMB_M_PER_FRAME : x / WALK_M_PER_FRAME;
    i = mod(Math.floor(phase), cfg.frames.length);
  }
  const cell = cfg.frames[i];
  const cols = COLS[cfg.sheet];
  return { img, sx: (cell % cols) * CELL, sy: Math.floor(cell / cols) * CELL };
}

/**
 * Draw an atlas frame foot-anchored at (fx, fy) — feet on the ground, centred
 * horizontally — scaled to the climber's `s`. Mirrors horizontally when facing
 * left (reflected around the foot anchor, per the manifest). Preserves the
 * frame's intended body bob / raised feet (never fit to opaque bounds).
 */
export function drawClimberSprite(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  s: number,
  facing: 1 | -1,
  frame: ClimberFrame
): void {
  const scale = (DISPLAY_H_IN_S * s) / REF_H; // cell px → screen px
  const size = CELL * scale;
  const dx = fx - ROOT_X * scale;
  const dy = fy - ROOT_Y * scale;
  ctx.save();
  if (facing === -1) {
    ctx.translate(fx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-fx, 0);
  }
  ctx.drawImage(frame.img, frame.sx, frame.sy, CELL, CELL, dx, dy, size, size);
  ctx.restore();
}
