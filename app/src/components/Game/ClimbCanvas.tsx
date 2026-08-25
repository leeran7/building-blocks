"use client";

/**
 * Tower v3 "The Climb" — climb renderer.
 *
 * Draws the vertical tower on a canvas with the camera following the climber and
 * the level scrolling UPWARD (the whole theme is height/altitude — spec-next.md).
 * Rendering only; all positions come from the authoritative/predicted MatchState
 * produced by the simulation. Honors prefers-reduced-motion by disabling the
 * pulsing hazard shimmer (AC-35) — the sim is byte-identical either way.
 *
 * Dark editorial palette + single cyan accent (#00d4ff), per app/DESIGN.md.
 */

import { useEffect, useRef } from "react";
import { MatchState } from "../../game/types";

const VOID = "#0a0a0f";
const SURFACE = "#15151f";
const BORDER = "#2a2a3d";
const ACCENT = "#00d4ff";
const LAVA = "#ff5470";
const TEXT_MUTED = "#6b6b8a";
const FLAG = "#28d17c";

export interface ClimbCanvasProps {
  state: MatchState;
  width?: number;
  height?: number;
  reducedMotion?: boolean;
}

export function ClimbCanvas({
  state,
  width = 360,
  height = 640,
  reducedMotion = false,
}: ClimbCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tower = state.tower;
    const player = state.players[0];
    const playerY = player?.y ?? 0;

    // Camera: keep the climber ~40% up the screen, clamp to tower bounds.
    // Screen y grows downward, tower y grows upward → invert.
    const pxPerM = 4; // world metres → screen px
    const focusScreenFrac = 0.55;
    let camWorldY = playerY - (height * (1 - focusScreenFrac)) / pxPerM;
    camWorldY = Math.max(0, Math.min(camWorldY, tower.heightM - height / pxPerM));

    const worldToScreenY = (worldY: number) =>
      height - (worldY - camWorldY) * pxPerM;

    // Background.
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, width, height);

    // Checkpoint gridlines.
    ctx.strokeStyle = BORDER;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = "10px monospace";
    ctx.lineWidth = 1;
    for (let i = 0; i < tower.checkpoints.length; i++) {
      const y = worldToScreenY(tower.checkpoints[i]);
      if (y < -20 || y > height + 20) continue;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(`${tower.checkpoints[i]}m`, 6, y - 4);
    }

    // Summit flag.
    const flagScreenY = worldToScreenY(tower.flagY);
    if (flagScreenY > -40 && flagScreenY < height + 40) {
      ctx.strokeStyle = FLAG;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width / 2, flagScreenY);
      ctx.lineTo(width / 2, flagScreenY - 28);
      ctx.stroke();
      ctx.fillStyle = FLAG;
      ctx.beginPath();
      ctx.moveTo(width / 2, flagScreenY - 28);
      ctx.lineTo(width / 2 + 20, flagScreenY - 22);
      ctx.lineTo(width / 2, flagScreenY - 16);
      ctx.closePath();
      ctx.fill();
    }

    // Rising hazard (lava) — a filled band from the hazard line downward.
    const hazScreenY = worldToScreenY(state.hazardY);
    if (hazScreenY < height) {
      const top = Math.max(0, hazScreenY);
      ctx.fillStyle = LAVA;
      ctx.globalAlpha = reducedMotion ? 0.85 : 0.75;
      ctx.fillRect(0, top, width, height - top);
      ctx.globalAlpha = 1;
      // Bright edge line.
      ctx.strokeStyle = LAVA;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(width, top);
      ctx.stroke();
    }

    // Player. MVP keeps the climber horizontally centered (single-lane climb);
    // horizontal geometry is layered on with real segment platforms later.
    const px = width / 2;
    const pyScreen = worldToScreenY(playerY);
    ctx.fillStyle =
      player?.status === "finished"
        ? FLAG
        : player?.status === "eliminated"
        ? TEXT_MUTED
        : ACCENT;
    ctx.beginPath();
    ctx.arc(px, pyScreen - 8, 8, 0, Math.PI * 2);
    ctx.fill();

    // HUD panel: height + hazard clearance.
    ctx.fillStyle = SURFACE;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, width, 34);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(0, 34);
    ctx.lineTo(width, 34);
    ctx.stroke();
    ctx.fillStyle = "#f4f4ff";
    ctx.font = "bold 13px monospace";
    ctx.fillText(`${playerY.toFixed(1)}m`, 10, 22);
    ctx.fillStyle = TEXT_MUTED;
    ctx.textAlign = "right";
    ctx.fillText(`hazard ${state.hazardY.toFixed(1)}m`, width - 10, 22);
    ctx.textAlign = "left";
  }, [state, width, height, reducedMotion]);

  return (
    <canvas
      ref={ref}
      style={{
        width,
        height,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        display: "block",
        touchAction: "none",
      }}
      aria-label="Climb view"
      role="img"
    />
  );
}
