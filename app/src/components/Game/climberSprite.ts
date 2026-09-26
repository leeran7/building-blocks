/**
 * Default climber sprite — the lime "Wraith" character.
 *
 * Artwork comes from the wraith pack, copied into /climb/: a poses sheet
 * (wraith-poses.png, 4×2 of 512px cells) for idle/walk/air/done/dead, and the
 * dedicated 6-frame back-view climb strip (wraith-climb.png) so the climber
 * shows its back to the camera while going up a ladder. Every frame shares the
 * manifest anchor: a 512px cell whose foot root is (256, 460), with a ~380px
 * idle body height, so one scale and one draw path cover them all.
 *
 * Both sheets start decoding together on the first call. Until the poses sheet
 * is ready climberFrame returns null and the caller draws the vector climber
 * (drawClimber); after that a pose on a sheet still in flight (or one that
 * failed) borrows its poses-sheet fallback, so the figure never flashes back to
 * the vector climber mid-run. Left-facing movement is mirrored in-engine.
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
const CLIMB_M_PER_FRAME = 0.65; // vertical metres per climb-cycle frame

type Pose = "idle" | "walk" | "climb" | "air" | "done" | "dead";
type Sheet = "poses" | "climb";

// Columns per sheet, so a frame's cell index maps to a source rect.
const COLS: Record<Sheet, number> = { poses: 4, climb: 6 };

type Anim = { sheet: Sheet; frames: readonly number[] };

/**
 * Per pose: which sheet and the cell indices it cycles through. Walk and climb
 * are distance-driven cycles; the rest are single poses out of wraith-poses.png.
 *
 * Walk uses the poses sheet's upright run-a/run-b (cells 1,2). Climb uses the
 * dedicated 6-frame back-view strip so the climber faces the ladder (back to
 * the camera) rather than the front-facing reach poses; those reach poses
 * (cells 3,4) are its fallback while the strip loads.
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

const SRC: Record<Sheet, string> = {
  poses: "/climb/wraith-poses.png",
  climb: "/climb/wraith-climb.png",
};

const images: Partial<Record<Sheet, HTMLImageElement>> = {};
const failed: Partial<Record<Sheet, boolean>> = {};

function loadSheet(sheet: Sheet): void {
  const img = new Image();
  img.onerror = () => {
    failed[sheet] = true;
  };
  img.src = SRC[sheet];
  images[sheet] = img;
}

/** The sheet's image once decoded, else null. The first call requests every sheet. */
function ensureSheet(sheet: Sheet): HTMLImageElement | null {
  if (typeof Image === "undefined") return null; // SSR / offscreen export
  if (!images.poses) (Object.keys(SRC) as Sheet[]).forEach(loadSheet);
  if (failed[sheet]) return null;
  const img = images[sheet];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
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
  const anim = ANIM[pose];
  let cfg: Anim = anim;
  let img = ensureSheet(anim.sheet);
  if (!img && anim.fallback) {
    cfg = anim.fallback;
    img = ensureSheet(cfg.sheet);
  }
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
