import { useEffect, useRef } from "react";
import { climberStickColor, DISPLAY_H_IN_S, drawClimberSprite, type ClimberSpriteState } from "@app/components/Game/climberSprite";
import { drawClimber } from "@app/components/Game/paintClimbFrame";
import { prefersReducedMotion } from "../lib/motion";

export type PreviewPose = "idle" | "walk" | "climb";

/** Figure height in CSS px. */
const FIGURE_PX = 132;
const SIZE_PX = 168;
/** In-game speeds (m/s) so the cycles step at the pace they do in a run. */
const WALK_MPS = 13;
const CLIMB_MPS = 3.2;
/** The stick figure's height in its `s` units: feet to the top of the head (2.4 + 0.52). */
const STICK_H_IN_S = 2.92;
/** drawClimber swings its limbs at tick * 0.5; the sim runs 30 ticks a second. */
const TICKS_PER_SEC = 30;

/**
 * The character a player would climb as, animated in place: its sprite, or
 * the vector stick figure for a stick character (and for no character: the
 * Green Stick). Reduced motion holds the idle frame. Decorative: the picker
 * names the character beside it.
 */
export function CharacterPreview({
  avatarId,
  pose,
  locked,
}: {
  avatarId: string | null;
  pose: PreviewPose;
  locked: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ avatarId, pose });
  live.current = { avatarId, pose };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = SIZE_PX * dpr;
    canvas.height = SIZE_PX * dpr;
    const reduce = prefersReducedMotion();
    const state: ClimberSpriteState = { pose: "idle", x: 0, y: 0, vx: 0, vy: 0, slot: 0, avatarId: null };
    let raf = 0;
    let last = performance.now();
    let clock = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const { avatarId: id, pose: p } = live.current;
      const shown = reduce ? "idle" : p;
      if (shown === "walk") state.x += WALK_MPS * dt;
      if (shown === "climb") state.y += CLIMB_MPS * dt;
      state.pose = shown;
      state.vx = shown === "walk" ? WALK_MPS : 0;
      state.vy = shown === "climb" ? CLIMB_MPS : 0;
      state.avatarId = id;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE_PX, SIZE_PX);
      const fx = SIZE_PX / 2;
      const fy = SIZE_PX - 8;
      const stick = climberStickColor(id);
      let drew = true;
      if (stick !== null) {
        const tick = reduce ? 0 : clock * TICKS_PER_SEC;
        drawClimber(ctx, fx, fy, FIGURE_PX / STICK_H_IN_S, 1, shown, tick, stick, reduce);
      } else {
        // False until the character's sheets decode: draw nothing meanwhile.
        drew = drawClimberSprite(ctx, fx, fy, FIGURE_PX / DISPLAY_H_IN_S, 1, state, reduce, null, clock);
      }
      // Reduced motion stops once a frame is on screen.
      if (!reduce || !drew) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [avatarId, pose]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-character-preview
      className={locked ? "opacity-60 grayscale" : undefined}
      style={{ width: SIZE_PX, height: SIZE_PX }}
    />
  );
}
