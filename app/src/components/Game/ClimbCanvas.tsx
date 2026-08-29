"use client";

/**
 * Tower v3 "The Climb" — climb renderer.
 *
 * Draws the Donkey-Kong-style tower: solid platforms with gaps, ladders joining
 * floors, the summit flag, the rising lava, and the climber — with the camera
 * following the climber UPWARD (the whole theme is height/altitude). Rendering
 * only; all positions come from the authoritative/predicted MatchState produced
 * by the simulation. Honors prefers-reduced-motion by dropping the lava shimmer
 * (AC-35) — the sim is byte-identical either way.
 *
 * ASCENT palette: signal-lime climber (#cbf24d) + ember lava (#ff5a2c).
 */

import { useEffect, useRef } from "react";
import { MatchState, PowerUpPickup } from "../../game/types";
import {
  platformsNearY,
  laddersNearY,
  floorHeight,
  floorIndexAt,
} from "../../game/towers";
import {
  POWER_UP_SPECS,
  cooldownRemaining,
  isExpired,
  isPowerUpActive,
} from "../../game/powerups";
import {
  backingStoreSize,
  canvasNeedsResize,
  clampDevicePixelRatio,
} from "./canvasBacking";

// ASCENT palette — signal-lime climber, ember lava, warm-obsidian world.
const VOID = "#0a0a0c";
const SURFACE = "#17161c";
const BORDER = "#37343f";
const ACCENT = "#cbf24d"; // signal — the climber
const PLATFORM = "#38353f";
const PLATFORM_TOP = "#4a4656";
const LADDER = "#8a86a0";
const LAVA = "#ff5a2c"; // ember — the rising hazard
const LAVA_SLOWED = "#ff8ad4"; // matches the time-slow orb, for a held-back lava
const TEXT_MUTED = "#74707e";
/** Used for the small HUD/altitude text: TEXT_MUTED only reaches 3.8:1 on it. */
const TEXT_SECONDARY = "#a8a4b2";
const FLAG = "#cbf24d"; // summit flag reads as signal too

/**
 * Baseline the HUD and label sizes are authored against. Callers normally pass a
 * measured size (see useCanvasSize); these are the pre-measurement fallback.
 */
const BASE_WIDTH = 360;
const BASE_HEIGHT = 640;

/** Ticks the "picked up X" banner stays on screen. */
const PICKUP_FLASH_TICKS = 55;
/** Ticks the burst where an orb was collected plays for. */
const PICKUP_BURST_TICKS = 12;

/** Jetpack plume — short cone below the feet, color from the orb spec. */
const JETPACK_FLAME_CORE = "#ffd4a8";
const JETPACK_FLAME_WIDTH_FRAC = 0.42;
const JETPACK_FLAME_HEIGHT_FRAC = 0.9;
const JETPACK_FLAME_CORE_WIDTH_FRAC = 0.4;
const JETPACK_FLAME_CORE_HEIGHT_FRAC = 0.5;
const JETPACK_FLAME_STATIC_SCALE = 0.75;
const JETPACK_FLAME_FLICKER_AMP = 0.16;
const JETPACK_FLAME_FLICKER_RATE = 0.71;

export interface ClimbCanvasProps {
  state: MatchState;
  width?: number;
  height?: number;
  reducedMotion?: boolean;
  /**
   * Height in px of UI covering the bottom of the canvas (the touch controls).
   * The camera keeps the climber clear of it, so it is never hidden behind a
   * button. Only affects the low-altitude range where the camera is clamped to
   * the base; once it is following the climber, the view is identical.
   */
  bottomInset?: number;
}

export function ClimbCanvas({
  state,
  width = BASE_WIDTH,
  height = BASE_HEIGHT,
  reducedMotion = false,
  bottomInset = 0,
}: ClimbCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // This effect depends on `state`, which changes every tick, so everything
    // here runs at frame rate. Assigning canvas.width or canvas.height
    // reallocates and zeroes the backing store even when the value is
    // unchanged, so the unconditional version below was throwing away and
    // rebuilding the whole bitmap 60 times a second:
    //
    //     canvas.width = width * dpr;
    //     canvas.height = height * dpr;
    //
    // Cheap at the 360x640 baseline, ruinous once useCanvasSize's MAX_WIDTH of
    // 2560 comes into play — at that width the buffer is tens of megabytes.
    // Assign only on an actual change.
    const dpr = clampDevicePixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    );
    const target = backingStoreSize(width, height, dpr);
    if (canvasNeedsResize(canvas.width, canvas.height, target.width, target.height)) {
      canvas.width = target.width;
      canvas.height = target.height;
    }
    // Still set every frame: a resize resets the transform, and this is cheap.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tower = state.tower;
    const player = state.players[0];
    const playerY = player?.y ?? 0;

    // HUD and label sizes are authored against the 360px baseline. Scaling them
    // with the canvas keeps the whole scene proportional, so a larger canvas
    // reads as a larger game instead of the same game with thinner chrome.
    // Floored at 1: a phone canvas is narrower than the baseline, and scaling
    // down took the HUD to 11px and the altitude labels to 8px.
    const ui = Math.max(1, width / BASE_WIDTH);

    // Scale so the full tower WIDTH fits the canvas; the camera scrolls in Y.
    const pxPerM = width / tower.widthM;
    const viewH = height / pxPerM; // metres visible vertically
    const focusScreenFrac = 0.62; // keep the climber ~62% down the view
    // Endless: the camera follows upward without any ceiling.
    let camWorldY = playerY - viewH * (1 - focusScreenFrac);
    // Near the base the camera stops following, so the climber drifts to the
    // bottom of the view — behind the touch controls. Letting the floor sink by
    // the inset keeps them above it; it only shows some empty air (and the
    // rising lava) below the ground line.
    camWorldY = Math.max(-bottomInset / pxPerM, camWorldY);

    const sx = (worldX: number) => worldX * pxPerM;
    const sy = (worldY: number) => height - (worldY - camWorldY) * pxPerM;

    // The window of floors currently in view (plus a margin).
    const yLow = camWorldY - tower.floorGap;
    const yHigh = camWorldY + viewH + tower.floorGap;

    // Background.
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, width, height);

    // Faint per-floor altitude gridlines + labels (the leaderboard scale).
    ctx.font = `${Math.round(10 * ui)}px monospace`;
    const loFloor = Math.max(0, floorIndexAt(tower, camWorldY));
    const hiFloor = floorIndexAt(tower, camWorldY + viewH) + 1;
    for (let i = loFloor; i <= hiFloor; i++) {
      const fy = floorHeight(tower, i);
      const y = sy(fy);
      if (y < -20 || y > height + 20) continue;
      ctx.strokeStyle = BORDER;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.fillText(`${Math.round(fy)}m`, 4 * ui, y - 3 * ui);
    }

    // Ladders (draw under platforms so platform lips overlap the rails).
    for (const { ladder: l } of laddersNearY(tower, yLow, yHigh)) {
      const yTop = sy(l.y1);
      const yBot = sy(l.y0);
      if (yBot < -20 || yTop > height + 20) continue;
      const cx = sx(l.x);
      const railHalf = Math.max(4, pxPerM * 1.4);
      ctx.strokeStyle = LADDER;
      ctx.lineWidth = 2 * ui;
      ctx.beginPath();
      ctx.moveTo(cx - railHalf, yTop);
      ctx.lineTo(cx - railHalf, yBot);
      ctx.moveTo(cx + railHalf, yTop);
      ctx.lineTo(cx + railHalf, yBot);
      ctx.stroke();
      // Rungs.
      ctx.lineWidth = 1.5 * ui;
      const rungGap = 10 * ui;
      for (let yy = yTop; yy <= yBot; yy += rungGap) {
        ctx.beginPath();
        ctx.moveTo(cx - railHalf, yy);
        ctx.lineTo(cx + railHalf, yy);
        ctx.stroke();
      }
    }

    // Platforms — a solid slab hanging below each walkable surface.
    const slab = Math.max(6, pxPerM * 2.5);
    for (const p of platformsNearY(tower, yLow, yHigh)) {
      const top = sy(p.y);
      if (top < -slab || top > height + 20) continue;
      const x0 = sx(p.x0);
      const w = sx(p.x1) - x0;
      ctx.fillStyle = PLATFORM;
      ctx.fillRect(x0, top, w, slab);
      ctx.fillStyle = PLATFORM_TOP;
      ctx.fillRect(x0, top, w, 2 * ui); // bright top surface
    }

    // Power-up orbs, drawn above the platforms they hover over but below the
    // lava, so an orb about to be swallowed visibly goes under.
    for (const pu of state.powerUps) {
      const oy = sy(pu.y);
      if (oy < -40 || oy > height + 40) continue;
      const ox = sx(pu.x);
      if (pu.collected) {
        // Brief burst where it was taken, then nothing.
        const age = pu.collectedTick === null ? 999 : state.tick - pu.collectedTick;
        if (age >= 0 && age < PICKUP_BURST_TICKS) {
          drawPickupBurst(ctx, ox, oy, age / PICKUP_BURST_TICKS, pxPerM, POWER_UP_SPECS[pu.type].color);
        }
        continue;
      }
      // An orb whose type is still cooling down for this player is inert on
      // contact — dim it so that doesn't read as a bug.
      const cooling = player ? cooldownRemaining(player, pu.type, state.tick) > 0 : false;
      drawPowerUpOrb(ctx, ox, oy, pxPerM, ui, pu, state.tick, reducedMotion, cooling);
    }

    // Rising hazard (lava) — a filled band from the hazard line downward. While
    // time-slow runs, the band cools toward the power-up's own colour and its
    // edge breaks into dashes, so "the lava is being held back" reads on the
    // hazard itself rather than only in the effect list.
    const lavaSlowed = player
      ? isPowerUpActive(player, "time-slow", state.tick)
      : false;
    const hazScreenY = sy(state.hazardY);
    if (hazScreenY < height) {
      const top = Math.max(0, hazScreenY);
      ctx.fillStyle = lavaSlowed ? LAVA_SLOWED : LAVA;
      ctx.globalAlpha = lavaSlowed ? 0.52 : reducedMotion ? 0.85 : 0.72;
      ctx.fillRect(0, top, width, height - top);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = lavaSlowed ? LAVA_SLOWED : LAVA;
      ctx.lineWidth = (lavaSlowed ? 4 : 3) * ui;
      if (lavaSlowed) ctx.setLineDash([9 * ui, 6 * ui]);
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(width, top);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Player — a little climber whose pose animates with what it's doing.
    const px = sx(player?.x ?? 0);
    const pyScreen = sy(playerY); // feet
    const facing: 1 | -1 = (player?.vx ?? 0) < 0 ? -1 : 1;
    const color =
      player?.status === "finished"
        ? FLAG
        : player?.status === "eliminated"
        ? TEXT_MUTED
        : ACCENT;
    let pose: Pose = "idle";
    if (player?.status === "finished") pose = "done";
    else if (player?.status === "eliminated") pose = "dead";
    else if (player?.onLadder) pose = "climb";
    else if (!player?.onGround) pose = "air";
    else if (Math.abs(player?.vx ?? 0) > 0.1) pose = "walk";
    const s = Math.max(9, pxPerM * 1.7);

    // Aura for each running effect — the in-scene tell that a power-up is live,
    // so the player never has to look away from the climber to check.
    const live = (player?.activePowerUps ?? []).filter(
      (a) => !isExpired(a, state.tick)
    );
    live.forEach((a, i) => {
      const spec = POWER_UP_SPECS[a.type];
      const remaining = a.durationTicks - (state.tick - a.startTick);
      // Pulse faster over the last second so the window closing is visible.
      const urgent = remaining <= 30;
      const phase = reducedMotion ? 0 : state.tick * (urgent ? 0.36 : 0.12);
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(phase);
      ctx.save();
      ctx.strokeStyle = spec.color;
      ctx.globalAlpha = 0.3 + 0.45 * pulse;
      ctx.lineWidth = Math.max(1.5, 0.16 * s);
      ctx.beginPath();
      ctx.ellipse(
        px,
        pyScreen - 1.25 * s,
        (1.05 + 0.22 * i) * s + pulse * 0.12 * s,
        (1.75 + 0.22 * i) * s + pulse * 0.12 * s,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    });

    drawClimber(ctx, px, pyScreen, s, facing, pose, state.tick, color, reducedMotion);
    if (player?.jetpackThrusting) {
      drawJetpackFlame(ctx, px, pyScreen, s, state.tick, reducedMotion);
    }

    // HUD panel: height + hazard line.
    const hudH = 34 * ui;
    ctx.fillStyle = SURFACE;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, 0, width, hudH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(0, hudH);
    ctx.lineTo(width, hudH);
    ctx.stroke();
    ctx.fillStyle = "#f4f2ec";
    ctx.font = `bold ${Math.round(13 * ui)}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`${playerY.toFixed(1)}m`, 10 * ui, 22 * ui);
    ctx.fillStyle = lavaSlowed ? LAVA_SLOWED : TEXT_SECONDARY;
    ctx.textAlign = "right";
    ctx.fillText(
      lavaSlowed
        ? `lava ${state.hazardY.toFixed(1)}m slowed`
        : `lava ${state.hazardY.toFixed(1)}m`,
      width - 10 * ui,
      22 * ui
    );
    ctx.textAlign = "left";

    // Pickup flash — a short centred banner naming what was just grabbed.
    if (
      player?.lastPickupTick !== null &&
      player?.lastPickupTick !== undefined &&
      player.lastPickupType
    ) {
      const age = state.tick - player.lastPickupTick;
      if (age >= 0 && age < PICKUP_FLASH_TICKS) {
        const spec = POWER_UP_SPECS[player.lastPickupType];
        const t = age / PICKUP_FLASH_TICKS;
        const text = `${spec.glyph} ${spec.label.toUpperCase()}`;
        ctx.save();
        ctx.globalAlpha = 1 - t * t; // hold, then fade
        ctx.textAlign = "center";
        ctx.font = `bold ${Math.round(15 * ui)}px monospace`;
        ctx.fillStyle = spec.color;
        // Rises slightly as it fades.
        const ty = hudH + 46 * ui - t * 10 * ui;
        ctx.fillText(text, width / 2, ty);
        ctx.font = `${Math.round(10 * ui)}px monospace`;
        ctx.fillStyle = "#f4f2ec";
        ctx.fillText(spec.description.toUpperCase(), width / 2, ty + 14 * ui);
        ctx.restore();
        ctx.textAlign = "left";
      }
    }
  }, [state, width, height, reducedMotion, bottomInset]);

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

/**
 * A hovering power-up orb: a glowing diamond carrying the type's glyph, bobbing
 * on the deterministic sim tick. Colour and glyph both encode the type, so it is
 * still identifiable without colour vision, and the label under it names it
 * outright. reducedMotion freezes the bob and the halo.
 */
function drawPowerUpOrb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  pxPerM: number,
  ui: number,
  pu: PowerUpPickup,
  tick: number,
  reducedMotion: boolean,
  cooling: boolean = false
) {
  const spec = POWER_UP_SPECS[pu.type];
  // Offset the phase per floor so a column of orbs does not bob in lockstep.
  const phase = tick * 0.08 + pu.floorIndex * 1.7;
  const bob = reducedMotion ? 0 : Math.sin(phase) * pxPerM * 0.45;
  const cy = baseY + bob;
  const r = Math.max(9, pxPerM * 1.35);
  const halo = reducedMotion ? 0.35 : 0.28 + 0.16 * (0.5 + 0.5 * Math.sin(phase * 1.6));

  // Cooling down for this player: still visible (it may not be for others),
  // but visibly inert on contact rather than a silent no-op.
  const dim = cooling ? 0.45 : 1;

  ctx.save();

  // Soft halo.
  ctx.globalAlpha = halo * dim;
  ctx.fillStyle = spec.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.85, 0, Math.PI * 2);
  ctx.fill();

  // Diamond body.
  ctx.globalAlpha = dim;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.8, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.8, cy);
  ctx.closePath();
  ctx.fillStyle = VOID;
  ctx.fill();
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.stroke();

  // Glyph.
  ctx.fillStyle = spec.color;
  ctx.font = `bold ${Math.round(r * 1.15)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.glyph, cx, cy + r * 0.04);

  // Name plate, so a new player learns the glyphs by reading them in place.
  ctx.font = `${Math.round(8 * ui)}px monospace`;
  ctx.fillStyle = spec.color;
  ctx.globalAlpha = 0.85 * dim;
  ctx.fillText(spec.label.toUpperCase(), cx, cy + r * 1.95);

  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Expanding ring where an orb was just collected. `t` runs 0 → 1. */
function drawPickupBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  pxPerM: number,
  color: string
) {
  const r = Math.max(9, pxPerM * 1.35) * (1 + t * 2.2);
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, pxPerM * 0.3 * (1 - t));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

type Pose = "idle" | "walk" | "climb" | "air" | "done" | "dead";
type Pt = [number, number];

/**
 * Draw a small climber character anchored at its feet (fx, fy). The limb targets
 * are chosen per-pose and animated from the deterministic sim tick, so the
 * character walks, climbs, jumps, cheers, or slumps to match its state. Purely
 * cosmetic — no effect on the simulation. reducedMotion freezes the cycle.
 */
function drawClimber(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  s: number,
  facing: 1 | -1,
  pose: Pose,
  tick: number,
  color: string,
  reducedMotion: boolean
) {
  const hipY = fy - 1.0 * s;
  const shoulderY = fy - 1.85 * s;
  const headY = fy - 2.4 * s;
  const headR = 0.52 * s;
  const limbW = Math.max(2, 0.26 * s);
  const p = reducedMotion ? 0 : tick * 0.5; // animation phase
  const swing = Math.sin(p);

  let leftFoot: Pt, rightFoot: Pt, leftHand: Pt, rightHand: Pt;
  switch (pose) {
    case "walk":
      leftFoot = [fx + swing * 0.55 * s, fy];
      rightFoot = [fx - swing * 0.55 * s, fy];
      leftHand = [fx - swing * 0.45 * s, shoulderY + 0.55 * s];
      rightHand = [fx + swing * 0.45 * s, shoulderY + 0.55 * s];
      break;
    case "climb": {
      const c = Math.sin(p * 1.3);
      leftFoot = [fx - 0.32 * s, fy - (0.18 + 0.16 * c) * s];
      rightFoot = [fx + 0.32 * s, fy - (0.18 - 0.16 * c) * s];
      leftHand = [fx - 0.3 * s, shoulderY - (0.4 - 0.25 * c) * s];
      rightHand = [fx + 0.3 * s, shoulderY - (0.4 + 0.25 * c) * s];
      break;
    }
    case "air":
      leftFoot = [fx - 0.34 * s, fy - 0.35 * s];
      rightFoot = [fx + 0.34 * s, fy - 0.18 * s];
      leftHand = [fx - 0.52 * s, shoulderY - 0.5 * s];
      rightHand = [fx + 0.52 * s, shoulderY - 0.5 * s];
      break;
    case "done": {
      const wave = Math.sin(p * 1.5) * 0.15 * s;
      leftFoot = [fx - 0.3 * s, fy];
      rightFoot = [fx + 0.3 * s, fy];
      leftHand = [fx - 0.5 * s, shoulderY - 0.65 * s + wave];
      rightHand = [fx + 0.5 * s, shoulderY - 0.65 * s - wave];
      break;
    }
    case "dead":
      leftFoot = [fx - 0.55 * s, fy];
      rightFoot = [fx + 0.55 * s, fy];
      leftHand = [fx - 0.62 * s, shoulderY + 0.55 * s];
      rightHand = [fx + 0.62 * s, shoulderY + 0.55 * s];
      break;
    default: // idle
      leftFoot = [fx - 0.3 * s, fy];
      rightFoot = [fx + 0.3 * s, fy];
      leftHand = [fx - 0.42 * s, shoulderY + 0.6 * s];
      rightHand = [fx + 0.42 * s, shoulderY + 0.6 * s];
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = limbW;

  // Legs then arms (behind the torso).
  limb(ctx, fx - 0.12 * s, hipY, leftFoot);
  limb(ctx, fx + 0.12 * s, hipY, rightFoot);
  limb(ctx, fx - 0.1 * s, shoulderY + 0.2 * s, leftHand);
  limb(ctx, fx + 0.1 * s, shoulderY + 0.2 * s, rightHand);

  // Hand + foot nubs.
  ctx.fillStyle = color;
  for (const pt of [leftHand, rightHand, leftFoot, rightFoot]) dot(ctx, pt, limbW * 0.6);

  // Torso.
  ctx.beginPath();
  ctx.ellipse(fx, (hipY + shoulderY) / 2, 0.34 * s, 0.55 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head.
  ctx.beginPath();
  ctx.arc(fx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eye (or an X when caught), looking in the facing direction.
  ctx.fillStyle = VOID;
  if (pose === "dead") {
    ctx.strokeStyle = VOID;
    ctx.lineWidth = Math.max(1.5, 0.1 * s);
    const ex = fx;
    const ey = headY - 0.02 * s;
    const r = 0.18 * s;
    ctx.beginPath();
    ctx.moveTo(ex - r, ey - r);
    ctx.lineTo(ex + r, ey + r);
    ctx.moveTo(ex + r, ey - r);
    ctx.lineTo(ex - r, ey + r);
    ctx.stroke();
  } else {
    dot(ctx, [fx + facing * 0.2 * s, headY - 0.02 * s], Math.max(1.3, 0.13 * s));
  }
}

/**
 * Plume under the climber's feet while a thrust tick is applying. Screen Y
 * grows downward, so "below the feet" is +fy. Flicker is tick-driven so two
 * clients stay in sync; reducedMotion freezes a smaller static cone.
 */
function drawJetpackFlame(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  s: number,
  tick: number,
  reducedMotion: boolean
): void {
  const flicker = reducedMotion
    ? 0
    : JETPACK_FLAME_FLICKER_AMP * Math.sin(tick * JETPACK_FLAME_FLICKER_RATE);
  const widthScale = 1 + flicker;
  const heightScale = reducedMotion
    ? JETPACK_FLAME_STATIC_SCALE
    : 1 + Math.abs(flicker);
  const halfW = JETPACK_FLAME_WIDTH_FRAC * s * widthScale;
  const height = JETPACK_FLAME_HEIGHT_FRAC * s * heightScale;

  ctx.save();
  ctx.fillStyle = POWER_UP_SPECS.jetpack.color;
  ctx.beginPath();
  ctx.moveTo(fx - halfW, fy);
  ctx.lineTo(fx + halfW, fy);
  ctx.lineTo(fx, fy + height);
  ctx.closePath();
  ctx.fill();

  const coreHalf = halfW * JETPACK_FLAME_CORE_WIDTH_FRAC;
  const coreH = height * JETPACK_FLAME_CORE_HEIGHT_FRAC;
  ctx.fillStyle = JETPACK_FLAME_CORE;
  ctx.beginPath();
  ctx.moveTo(fx - coreHalf, fy);
  ctx.lineTo(fx + coreHalf, fy);
  ctx.lineTo(fx, fy + coreH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, [x1, y1]: Pt) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, [x, y]: Pt, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
