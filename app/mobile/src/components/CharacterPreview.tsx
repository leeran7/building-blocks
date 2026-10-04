import { useEffect, useRef } from "react";
import { climberStickColor, DISPLAY_H_IN_S, drawClimberSprite, type ClimberSpriteState } from "@app/components/Game/climberSprite";
import { drawClimber } from "@app/components/Game/paintClimbFrame";
import { prefersReducedMotion } from "../lib/motion";

export type PreviewPose = "idle" | "walk" | "climb";

/** Default figure height in CSS px. */
const FIGURE_PX = 132;
/** Default canvas size (square) in CSS px. */
const SIZE_PX = 168;
/** The figure's feet sit this far above the canvas's bottom edge, CSS px. */
export const PREVIEW_FOOT_PAD = 8;
/**
 * How far above the skull top a character's art can reach, as a share of the
 * figure height: horns, ears, crests, and hands over the head on the climb.
 * The tallest in the registry is the Void Ibex walking, 0.41 of its skull
 * height with the walk's bob; a test measures every cell of every sheet.
 */
export const PREVIEW_HEADROOM = 0.44;

/**
 * The canvas size (sizePx) that shows any character whole at this figure
 * height: the foot pad, the figure, and room above the skull for its horns.
 */
export function previewSize(figurePx: number): number {
  return Math.ceil(figurePx * (1 + PREVIEW_HEADROOM)) + PREVIEW_FOOT_PAD;
}
/** In-game speeds (m/s) so the cycles step at the pace they do in a run. */
const WALK_MPS = 13;
const CLIMB_MPS = 3.2;
/** The stick figure's height in its `s` units: feet to the top of the head (2.4 + 0.52). */
const STICK_H_IN_S = 2.92;
/** drawClimber swings its limbs at tick * 0.5; the sim runs 30 ticks a second. */
const TICKS_PER_SEC = 30;

/** Frame cap for an `ambient` preview, matching the menu backdrop's lava (AnimatedBackdrop LAVA_FPS). */
export const AMBIENT_FPS = 30;
/**
 * Paint when at least this long has passed, ms: a frame interval less some
 * slack, so frame-time jitter at 60/90/120 Hz cannot push every other paint
 * one refresh late (which would drop to 20-24 fps).
 */
const AMBIENT_FRAME_MS = 1000 / AMBIENT_FPS - 2;

/**
 * The character a player would climb as, animated in place: its sprite, or
 * the vector stick figure for a stick character (and for no character: the
 * Green Stick). Reduced motion holds the idle frame. Decorative: the picker
 * names the character beside it.
 *
 * `ambient` is for a figure that sits on a screen that stays open (the level
 * map). It draws once and stops when nothing on the figure moves (a stick
 * character standing idle), otherwise redraws at most AMBIENT_FPS times a
 * second, and pauses while the page is hidden. Without it the preview redraws
 * every animation frame, as the picker and detail screens expect.
 *
 * `still` is for a wall of figures (the Shop grid): it paints the idle frame
 * once the character's sheets decode, then stops, like reduced motion.
 */
export function CharacterPreview({
  avatarId,
  pose,
  locked,
  figurePx = FIGURE_PX,
  sizePx = SIZE_PX,
  ambient = false,
  still = false,
  facing = 1,
}: {
  avatarId: string | null;
  pose: PreviewPose;
  locked: boolean;
  /** Figure height in CSS px, feet to the top of the head. */
  figurePx?: number;
  /**
   * Canvas width and height in CSS px; the figure stands centred on its bottom
   * edge. Anything above the skull (horns, a crest) is cut off at the canvas
   * top unless sizePx leaves room for it: previewSize(figurePx) does.
   */
  sizePx?: number;
  /** Save frames on a screen that stays open: see above. */
  ambient?: boolean;
  /** Paint one idle frame and stop: see above. */
  still?: boolean;
  /** 1 faces right, -1 mirrors the figure to face left. */
  facing?: 1 | -1;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ avatarId, pose, facing });
  live.current = { avatarId, pose, facing };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = sizePx * dpr;
    canvas.height = sizePx * dpr;
    const reduce = still || prefersReducedMotion();
    const state: ClimberSpriteState = { pose: "idle", x: 0, y: 0, vx: 0, vy: 0, slot: 0, avatarId: null };
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let lastPaint = -Infinity;
    /** False while the page is hidden (ambient only). */
    let running = true;
    /** True once the loop has stopped for good: the frame on screen is final. */
    let done = false;

    /** Paints one frame. `drew` is false until a sprite's sheets decode; `static` when the frame would never change. */
    const paint = (now: number): { drew: boolean; static: boolean } => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const { avatarId: id, pose: p, facing: face } = live.current;
      const shown = reduce ? "idle" : p;
      if (shown === "walk") state.x += WALK_MPS * dt;
      if (shown === "climb") state.y += CLIMB_MPS * dt;
      state.pose = shown;
      state.vx = shown === "walk" ? WALK_MPS : 0;
      state.vy = shown === "climb" ? CLIMB_MPS : 0;
      state.avatarId = id;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, sizePx, sizePx);
      const fx = sizePx / 2;
      const fy = sizePx - PREVIEW_FOOT_PAD;
      const stick = climberStickColor(id);
      if (stick !== null) {
        const tick = reduce ? 0 : clock * TICKS_PER_SEC;
        drawClimber(ctx, fx, fy, figurePx / STICK_H_IN_S, face, shown, tick, stick, reduce);
        // drawClimber's idle pose ignores the tick: a standing stick figure never moves.
        return { drew: true, static: shown === "idle" };
      }
      // False until the character's sheets decode: draw nothing meanwhile.
      const drew = drawClimberSprite(ctx, fx, fy, figurePx / DISPLAY_H_IN_S, face, state, reduce, null, clock);
      return { drew, static: false };
    };

    const frame = (now: number) => {
      if (!running) return;
      if (ambient && now - lastPaint < AMBIENT_FRAME_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastPaint = now;
      const painted = paint(now);
      // Reduced motion, `still`, and an ambient figure that cannot move stop once a frame is on screen.
      if (painted.drew && (reduce || (ambient && painted.static))) {
        done = true;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    if (!ambient) return () => cancelAnimationFrame(raf);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running && !done) {
        running = true;
        // Resume without a jump: the hidden time is not animation time.
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [avatarId, pose, figurePx, sizePx, ambient, still]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-character-preview
      className={locked ? "opacity-60 grayscale" : undefined}
      style={{ width: sizePx, height: sizePx }}
    />
  );
}
