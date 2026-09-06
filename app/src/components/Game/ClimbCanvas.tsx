"use client";

/**
 * Tower v3 "The Climb" — climb renderer wrapper.
 *
 * Resizes the canvas backing store, then delegates drawing to paintClimbFrame
 * so export can share the same painter without DOM chrome (ADR-3).
 */

import { useEffect, useRef } from "react";
import { HUD_ALTITUDE_FONT_UI } from "../../design/climbFeelTokens";
import { MatchState } from "../../game/types";
import {
  backingStoreSize,
  canvasNeedsResize,
  clampDevicePixelRatio,
} from "./canvasBacking";
import { paintClimbFrame } from "./paintClimbFrame";

export { HUD_ALTITUDE_FONT_UI };

/** Decorative / eliminated only — never body or lava HUD (AC-1 / AC-13). */
export const TEXT_MUTED = "#74707e";
/** Lava/hazard HUD + altitude grid labels (≥ AA on void/surface). */
export const TEXT_SECONDARY = "#a8a4b2";

const BORDER = "#37343f";
const BASE_WIDTH = 360;
const BASE_HEIGHT = 640;

export interface ClimbCanvasProps {
  state: MatchState;
  width?: number;
  height?: number;
  reducedMotion?: boolean;
  /**
   * Height in px of UI covering the bottom of the canvas (the touch controls).
   * The camera keeps the climber clear of it.
   */
  bottomInset?: number;
  /**
   * Full-bleed stage (touch / iOS): drops the framing border + rounded corners.
   */
  fullBleed?: boolean;
  /**
   * Safe-area top inset in px (notch / Dynamic Island).
   */
  hudInsetTop?: number;
}

export function ClimbCanvas({
  state,
  width = BASE_WIDTH,
  height = BASE_HEIGHT,
  reducedMotion = false,
  bottomInset = 0,
  fullBleed = false,
  hudInsetTop = 0,
}: ClimbCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<{ y: number | null; tick: number | null }>({
    y: null,
    tick: null,
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = clampDevicePixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    );
    const target = backingStoreSize(width, height, dpr);
    if (canvasNeedsResize(canvas.width, canvas.height, target.width, target.height)) {
      canvas.width = target.width;
      canvas.height = target.height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    paintClimbFrame(ctx, state, {
      width,
      height,
      reducedMotion,
      bottomInset,
      hudInsetTop,
      includeHud: true,
      camera: camRef.current,
    });
  }, [state, width, height, reducedMotion, bottomInset, hudInsetTop]);

  return (
    <canvas
      ref={ref}
      data-climb-surface
      style={{
        width,
        height,
        borderRadius: fullBleed ? 0 : 12,
        border: fullBleed ? "none" : `1px solid ${BORDER}`,
        display: "block",
        touchAction: "none",
      }}
      aria-label="Climb view"
      role="img"
    />
  );
}
