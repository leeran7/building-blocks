"use client";

/**
 * Tower v3 "The Climb" — climb renderer.
 *
 * Draws the Donkey-Kong-style tower: solid platforms with gaps, ladders joining
 * floors, jump-over crates on the traverse, the rising lava, and the climber —
 * with the camera following the climber UPWARD (the whole theme is height).
 * Rendering only; all positions come from the authoritative/predicted MatchState
 * produced by the simulation. Honors prefers-reduced-motion by dropping the lava
 * shimmer (AC-35) — the sim is byte-identical either way.
 *
 * ASCENT palette: signal-lime climber (#cbf24d) + ember lava (#ff5a2c).
 */

import { useEffect, useRef } from "react";
import { MatchState, Obstacle } from "../../game/types";
import {
  platformsNearY,
  laddersNearY,
  floorHeight,
  floorIndexAt,
} from "../../game/towers";
import { obstaclesNearY } from "../../game/obstacles";
import {
  POWER_UP_SPECS,
  GIANT_VISUAL_SCALE,
  cooldownRemaining,
  isExpired,
  isPowerUpActive,
} from "../../game/powerups";
import {
  backingStoreSize,
  canvasNeedsResize,
  clampDevicePixelRatio,
} from "./canvasBacking";
import { drawClimbBackground } from "./climbBackground";
import {
  PICKUP_BURST_TICKS,
  PICKUP_FLASH_TICKS,
  drawActivePowerUpEffect,
  drawJetpackFlame,
  drawPickupBanner,
  drawPickupBurst,
  drawPickupScreenFlash,
  drawPowerUpOrb,
  pickupShakeOffset,
} from "./powerUpVfx";

// ASCENT palette — signal-lime climber, ember lava, warm-obsidian world.
const VOID = "#0a0a0c";
const SURFACE = "#17161c";
const BORDER = "#37343f";
const ACCENT = "#cbf24d"; // signal — the climber
const PLATFORM = "#38353f";
const PLATFORM_TOP = "#4a4656";
const CRATE = "#2a2730";
const CRATE_TOP = "#4a4656";
const CRATE_FACE = "#3a3644";
const LADDER = "#8a86a0";
const LAVA = "#ff5a2c"; // ember — the rising hazard
const LAVA_SLOWED = "#ff8ad4"; // matches the slow-lava orb, for a held-back lava
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
/** How fast the camera closes on the climber each tick (1 = snap). */
const CAM_FOLLOW = 0.3;

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
  /**
   * Full-bleed stage (touch / iOS): drops the framing border + rounded corners
   * so the canvas reaches every edge of the viewport.
   */
  fullBleed?: boolean;
  /**
   * Safe-area top inset in px (notch / Dynamic Island). The on-canvas HUD panel
   * and pickup banner are pushed down by this much so they clear the cutout on a
   * full-bleed stage; 0 on framed layouts.
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
  const camYRef = useRef<number | null>(null);
  const camTickRef = useRef<number | null>(null);

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
    const camTarget = Math.max(
      -bottomInset / pxPerM,
      playerY - viewH * (1 - focusScreenFrac)
    );
    // Walk-up stairs and hurdle triangles snap the feet a crate-height per
    // tick. Following y 1:1 made the whole view hitch. Ease toward the target
    // and only snap on a new run or a huge gap (respawn / seek).
    const camWorldY = followCamY(
      camYRef.current,
      camTarget,
      viewH,
      state.tick,
      camTickRef.current
    );
    camYRef.current = camWorldY;
    camTickRef.current = state.tick;

    const sx = (worldX: number) => worldX * pxPerM;
    const sy = (worldY: number) => height - (worldY - camWorldY) * pxPerM;

    const pickupAge =
      player?.lastPickupTick !== null &&
      player?.lastPickupTick !== undefined &&
      player.lastPickupType
        ? state.tick - player.lastPickupTick
        : -1;
    const shake =
      pickupAge >= 0
        ? pickupShakeOffset(pickupAge, state.tick, ui, reducedMotion)
        : { dx: 0, dy: 0 };

    // Tiled volcanic vista. Drawn before the shake translate so the scenery
    // stays anchored while only the tower jolts on a pickup; it fully covers
    // the canvas, so no explicit clear is needed.
    drawClimbBackground(ctx, width, height, camWorldY, state.tick, reducedMotion);

    ctx.save();
    ctx.translate(shake.dx, shake.dy);

    // The window of floors currently in view (plus a margin).
    const yLow = camWorldY - tower.floorGap;
    const yHigh = camWorldY + viewH + tower.floorGap;

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

    // Crates — hurdles, 3-level triangles, or a stair to the next floor.
    for (const o of obstaclesNearY(tower, yLow, yHigh)) {
      drawObstacle(ctx, o, sx, sy, pxPerM, ui, height);
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
          drawPickupBurst(
            ctx,
            ox,
            oy,
            age / PICKUP_BURST_TICKS,
            pxPerM,
            pu.type,
            pu.floorIndex,
            state.tick,
            reducedMotion
          );
        }
        continue;
      }
      // An orb whose type is still cooling down for this player is inert on
      // contact — dim it so that doesn't read as a bug.
      const cooling = player ? cooldownRemaining(player, pu.type, state.tick) > 0 : false;
      drawPowerUpOrb(ctx, ox, oy, pxPerM, ui, pu, state.tick, reducedMotion, cooling);
    }

    // Rising hazard (lava) — a filled band from the hazard line downward. While
    // slow-lava runs, the band cools toward the power-up's own colour and its
    // edge breaks into dashes, so "the lava is being held back" reads on the
    // hazard itself rather than only in the effect list.
    const lavaSlowed = player
      ? isPowerUpActive(player, "slow-lava", state.tick)
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
    // Character size is world-proportional (1.7m of the 100m-wide tower). The
    // floor only guards against a sub-pixel figure on a tiny canvas; it was 9px,
    // which on a phone-width canvas sat ABOVE the proportional size and so drew
    // the climber — and doubly the Giant climber — oversized relative to the
    // world compared with desktop. Lowered so it no longer binds on a full-bleed
    // phone, keeping the climber (and Giant's 2×) the same relative size on every
    // device. Desktop is unaffected: pxPerM * 1.7 is far above the floor there.
    const s =
      Math.max(5, pxPerM * 1.7) *
      (player && isPowerUpActive(player, "giant", state.tick)
        ? GIANT_VISUAL_SCALE
        : 1);

    // Aura for each running effect — the in-scene tell that a power-up is live,
    // so the player never has to look away from the climber to check.
    const live = (player?.activePowerUps ?? []).filter(
      (a) => !isExpired(a, state.tick)
    );
    live.forEach((a) => {
      drawActivePowerUpEffect(
        ctx,
        a.type,
        px,
        pyScreen,
        s,
        facing,
        state.tick,
        a,
        player,
        reducedMotion
      );
    });

    drawClimber(ctx, px, pyScreen, s, facing, pose, state.tick, color, reducedMotion);
    if (player?.jetpackThrusting) {
      drawJetpackFlame(ctx, px, pyScreen, s, state.tick, reducedMotion);
    }

    // HUD panel: height + hazard line. On a full-bleed stage it is pushed down
    // by the safe-area top inset so the readout clears the notch / Dynamic
    // Island; the panel still fills up to y=0 so there is a solid bar behind the
    // cutout rather than see-through world.
    const hudTop = hudInsetTop;
    const hudH = 34 * ui;
    ctx.fillStyle = SURFACE;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, 0, width, hudTop + hudH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(0, hudTop + hudH);
    ctx.lineTo(width, hudTop + hudH);
    ctx.stroke();
    ctx.fillStyle = "#f4f2ec";
    ctx.font = `bold ${Math.round(13 * ui)}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`${playerY.toFixed(1)}m`, 10 * ui, hudTop + 22 * ui);
    ctx.fillStyle = lavaSlowed ? LAVA_SLOWED : TEXT_SECONDARY;
    ctx.textAlign = "right";
    ctx.fillText(
      lavaSlowed
        ? `lava ${state.hazardY.toFixed(1)}m slowed`
        : `lava ${state.hazardY.toFixed(1)}m`,
      width - 10 * ui,
      hudTop + 22 * ui
    );
    ctx.textAlign = "left";

    // Pickup flash — colour wash plus a centred banner naming what was grabbed.
    if (
      player?.lastPickupTick !== null &&
      player?.lastPickupTick !== undefined &&
      player.lastPickupType &&
      pickupAge >= 0 &&
      pickupAge < PICKUP_FLASH_TICKS
    ) {
      const spec = POWER_UP_SPECS[player.lastPickupType];
      drawPickupScreenFlash(
        ctx,
        width,
        height,
        pickupAge,
        spec.color,
        reducedMotion
      );
      drawPickupBanner(ctx, width, hudTop + hudH, ui, spec, pickupAge, reducedMotion);
    }

    ctx.restore();
  }, [state, width, height, reducedMotion, bottomInset, hudInsetTop]);

  return (
    <canvas
      ref={ref}
      data-climb-surface
      style={{
        width,
        height,
        // Full-bleed stage reaches every edge — no framing border or radius.
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

function followCamY(
  current: number | null,
  target: number,
  viewH: number,
  tick: number,
  prevTick: number | null
): number {
  if (current === null || prevTick === null || tick < prevTick || tick === 0) {
    return target;
  }
  const err = target - current;
  if (Math.abs(err) > viewH * 0.55) return target;
  return current + err * CAM_FOLLOW;
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  o: Obstacle,
  sx: (x: number) => number,
  sy: (y: number) => number,
  pxPerM: number,
  ui: number,
  canvasH: number
) {
  const x = sx(o.x0);
  const top = sy(o.y1);
  const bot = sy(o.y0);
  const w = sx(o.x1) - x;
  const h = bot - top;
  if (bot < -8 || top > canvasH + 8 || w <= 1 || h <= 1) return;

  ctx.fillStyle = CRATE;
  if (o.kind === "barrel") {
    roundRect(ctx, x, top, w, h, Math.min(h * 0.22, 6 * ui));
    ctx.fill();
    ctx.fillStyle = CRATE_FACE;
    ctx.fillRect(x + 2 * ui, top + h * 0.28, w - 4 * ui, Math.max(2 * ui, h * 0.12));
    ctx.fillRect(x + 2 * ui, top + h * 0.6, w - 4 * ui, Math.max(2 * ui, h * 0.12));
  } else if (o.kind === "rock") {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, top + h * 0.72);
    ctx.lineTo(x + w * 0.22, top + h * 0.12);
    ctx.lineTo(x + w * 0.62, top);
    ctx.lineTo(x + w * 0.96, top + h * 0.38);
    ctx.lineTo(x + w * 0.82, bot);
    ctx.lineTo(x + w * 0.12, bot);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x, top + h * 0.35, w, h * 0.65);
    ctx.fillStyle = CRATE_FACE;
    ctx.fillRect(x + w * 0.12, top, w * 0.76, h * 0.48);
  }
  ctx.fillStyle = CRATE_TOP;
  ctx.fillRect(x, top, w, Math.max(2 * ui, pxPerM * 0.18));
  ctx.strokeStyle = LADDER;
  ctx.lineWidth = Math.max(1.5, 1.5 * ui);
  ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
