"use client";

/**
 * Tower v3 "The Climb" — climb renderer wrapper.
 *
 * Resizes the canvas backing store, then delegates drawing to paintClimbFrame
 * so export can share the same painter without DOM chrome (ADR-3).
 */

import { useCallback, useEffect, useRef } from "react";
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
  /**
   * Local player's Firebase UID — determines which sprite gets lime vs blue.
   * When absent, slot 0 is treated as the local player.
   */
  myId?: string;
  /**
   * Display names keyed by player id — used for nameplates drawn above each
   * climber. Falls back to "Guest" when a player id is not present.
   */
  playerNames?: Record<string, string>;
}

export function ClimbCanvas({
  state,
  width = BASE_WIDTH,
  height = BASE_HEIGHT,
  reducedMotion = false,
  bottomInset = 0,
  fullBleed = false,
  hudInsetTop = 0,
  myId,
  playerNames,
}: ClimbCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<{ y: number | null; tick: number | null }>({
    y: null,
    tick: null,
  });

  // Store state in a ref so the rAF loop always reads the latest without
  // running React's effect cleanup+setup every tick (~30 Hz).
  const stateRef = useRef(state);
  stateRef.current = state;

  const optsRef = useRef({ width, height, reducedMotion, bottomInset, hudInsetTop, myId, playerNames });
  optsRef.current = { width, height, reducedMotion, bottomInset, hudInsetTop, myId, playerNames };

  const paint = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const opts = optsRef.current;
    const dpr = clampDevicePixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    );
    const target = backingStoreSize(opts.width, opts.height, dpr);
    if (canvasNeedsResize(canvas.width, canvas.height, target.width, target.height)) {
      canvas.width = target.width;
      canvas.height = target.height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    paintClimbFrame(ctx, stateRef.current, {
      width: opts.width,
      height: opts.height,
      reducedMotion: opts.reducedMotion,
      bottomInset: opts.bottomInset,
      hudInsetTop: opts.hudInsetTop,
      includeHud: true,
      camera: camRef.current,
      myId: opts.myId,
      playerNames: opts.playerNames,
    });
  }, []);

  // Single rAF loop: paint at the browser's refresh rate, reading the latest
  // state from refs. Starts once on mount, cleaned up on unmount.
  useEffect(() => {
    let rafId: number;
    function loop() {
      paint();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [paint]);


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
