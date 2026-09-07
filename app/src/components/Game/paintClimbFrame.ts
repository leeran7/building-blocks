/**
 * Shared climb frame painter — used by ClimbCanvas and offscreen export.
 * Draws world + optional HUD; never draws transport chrome (ADR-3).
 */

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
import { HUD_ALTITUDE_FONT_UI } from "../../design/climbFeelTokens";
import { formatAltitude } from "../../lib/units";
import {
  cameraTargetY,
  climbView,
  followCamY,
} from "./climbCamera";
import { drawClimbBackground } from "./climbBackground";
import { drawLava, LAVA_SLOWED } from "./lava";
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

const VOID = "#0a0a0c";
const SURFACE = "#17161c";
const BORDER = "#37343f";
const ACCENT = "#cbf24d";
const PLATFORM = "#38353f";
const PLATFORM_TOP = "#4a4656";
const CRATE = "#2a2730";
const CRATE_TOP = "#4a4656";
const CRATE_FACE = "#3a3644";
const LADDER = "#8a86a0";
const OPPONENT_COLOR = "#6bb8ff"; // wayfinding blue — opponent in a duel
/** Decorative / eliminated only — never body or lava HUD (AC-1 / AC-13). */
const TEXT_MUTED = "#74707e";
/** Lava/hazard HUD + altitude grid labels (≥ AA on void/surface). */
const TEXT_SECONDARY = "#a8a4b2";
const FLAG = "#cbf24d";

const BASE_WIDTH = 360;

/** Canvas 2D context used by the live viewer and detached export canvas. */
export type PaintCtx = CanvasRenderingContext2D;

export type PaintClimbFrameOptions = {
  width: number;
  height: number;
  reducedMotion?: boolean;
  bottomInset?: number;
  hudInsetTop?: number;
  /** Export/viewer: still draw world HUD; never receives transport chrome. */
  includeHud?: boolean;
  /**
   * Persistent camera across frames. Mutated for easing. When omitted, camera
   * snaps to target each call (fine for one-shot export frames with a bag).
   */
  camera?: { y: number | null; tick: number | null };
  /**
   * Local player's id (Firebase UID). Determines which climber gets the lime
   * sprite + camera; everyone else is drawn as an opponent (blue). Falls back
   * to slot 0 when absent (solo play / export).
   */
  myId?: string;
  /**
   * Display names keyed by player id — drawn as nameplates above each climber.
   * Falls back to "Guest" for ids not present.
   */
  playerNames?: Record<string, string>;
};

export function paintClimbFrame(
  ctx: PaintCtx,
  state: MatchState,
  opts: PaintClimbFrameOptions
): void {
  const width = opts.width;
  const height = opts.height;
  const reducedMotion = opts.reducedMotion ?? false;
  const bottomInset = opts.bottomInset ?? 0;
  const hudInsetTop = opts.hudInsetTop ?? 0;
  const includeHud = opts.includeHud !== false;
  const camBag = opts.camera ?? { y: null as number | null, tick: null as number | null };

  const tower = state.tower;
  // The local player drives camera, HUD, and pickup feedback; everyone else is
  // an opponent. Falls back to slot 0 for solo play / export.
  const localPlayerId = opts.myId ?? state.players[0]?.id;
  const player =
    (opts.myId ? state.players.find((p) => p.id === opts.myId) : null) ??
    state.players[0];
  const playerY = player?.y ?? 0;
  const ui = Math.max(1, width / BASE_WIDTH);

  const { pxPerM, viewH } = climbView(width, height, tower.widthM);
  const camTarget = cameraTargetY(playerY, viewH, bottomInset, pxPerM);
  const camWorldY = followCamY(
    camBag.y,
    camTarget,
    viewH,
    state.tick,
    camBag.tick
  );
  camBag.y = camWorldY;
  camBag.tick = state.tick;

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

  drawClimbBackground(ctx, width, height, camWorldY, state.tick, reducedMotion);

  ctx.save();
  ctx.translate(shake.dx, shake.dy);

  const yLow = camWorldY - tower.floorGap;
  const yHigh = camWorldY + viewH + tower.floorGap;

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
    ctx.fillText(formatAltitude(Math.round(fy), 0), 4 * ui, y - 3 * ui);
  }

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
    ctx.lineWidth = 1.5 * ui;
    const rungGap = 10 * ui;
    for (let yy = yTop; yy <= yBot; yy += rungGap) {
      ctx.beginPath();
      ctx.moveTo(cx - railHalf, yy);
      ctx.lineTo(cx + railHalf, yy);
      ctx.stroke();
    }
  }

  const slab = Math.max(6, pxPerM * 2.5);
  for (const p of platformsNearY(tower, yLow, yHigh)) {
    const top = sy(p.y);
    if (top < -slab || top > height + 20) continue;
    const x0 = sx(p.x0);
    const w = sx(p.x1) - x0;
    ctx.fillStyle = PLATFORM;
    ctx.fillRect(x0, top, w, slab);
    ctx.fillStyle = PLATFORM_TOP;
    ctx.fillRect(x0, top, w, 2 * ui);
  }

  for (const o of obstaclesNearY(tower, yLow, yHigh)) {
    drawObstacle(ctx, o, sx, sy, pxPerM, ui, height);
  }

  for (const pu of state.powerUps) {
    const oy = sy(pu.y);
    if (oy < -40 || oy > height + 40) continue;
    const ox = sx(pu.x);
    if (pu.collected) {
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
    const cooling = player ? cooldownRemaining(player, pu.type, state.tick) > 0 : false;
    drawPowerUpOrb(ctx, ox, oy, pxPerM, ui, pu, state.tick, reducedMotion, cooling);
  }

  const lavaSlowed = player
    ? isPowerUpActive(player, "slow-lava", state.tick)
    : false;
  const hazScreenY = sy(state.hazardY);
  if (hazScreenY < height) {
    drawLava(ctx, {
      width,
      height,
      top: Math.max(0, hazScreenY),
      ui,
      tick: state.tick,
      reducedMotion,
      slowed: lavaSlowed,
    });
  }

  // Draw every climber — local gets signal-lime + auras; opponents get
  // wayfinding blue and a nameplate. Camera/HUD stay keyed to the local player.
  for (const p of state.players) {
    const isLocal = p.id === localPlayerId;
    const pxScreen = sx(p.x);
    const pFeetY = sy(p.y);
    const pFacing: 1 | -1 = p.vx < 0 ? -1 : 1;

    const baseColor = isLocal ? ACCENT : OPPONENT_COLOR;
    const pColor =
      p.status === "finished"
        ? isLocal
          ? FLAG
          : OPPONENT_COLOR
        : p.status === "eliminated"
          ? TEXT_MUTED
          : baseColor;

    let pPose: Pose = "idle";
    if (p.status === "finished") pPose = "done";
    else if (p.status === "eliminated") pPose = "dead";
    else if (p.onLadder) pPose = "climb";
    else if (!p.onGround) pPose = "air";
    else if (Math.abs(p.vx) > 0.1) pPose = "walk";

    const pS =
      Math.max(5, pxPerM * 1.7) *
      (isPowerUpActive(p, "giant", state.tick) ? GIANT_VISUAL_SCALE : 1);

    // Auras are local-only — keeps the opponent read clean.
    if (isLocal) {
      const live = p.activePowerUps.filter((a) => !isExpired(a, state.tick));
      live.forEach((a) => {
        drawActivePowerUpEffect(
          ctx,
          a.type,
          pxScreen,
          pFeetY,
          pS,
          pFacing,
          state.tick,
          a,
          p,
          reducedMotion
        );
      });
    }

    drawClimber(ctx, pxScreen, pFeetY, pS, pFacing, pPose, state.tick, pColor, reducedMotion);

    if (isLocal && p.jetpackThrusting) {
      drawJetpackFlame(ctx, pxScreen, pFeetY, pS, state.tick, reducedMotion);
    }

    // Nameplate for opponents (the local player is obvious as the camera focus).
    if (!isLocal) {
      const nameLabel = (opts.playerNames ? opts.playerNames[p.id] : null) ?? "Guest";
      ctx.font = `${Math.round(10 * ui)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = OPPONENT_COLOR;
      ctx.fillText(nameLabel, pxScreen, pFeetY - (2.4 * pS + 6 * ui));
      ctx.textAlign = "left";
    }
  }

  // Off-screen indicator for opponents outside the camera view — a small arrow
  // at the top/bottom edge with the opponent's altitude, so you always know
  // where they are relative to you.
  for (const p of state.players) {
    if (p.id === localPlayerId) continue;
    const oppScreenY = sy(p.y);
    if (oppScreenY >= 0 && oppScreenY <= height) continue;

    const arrowSize = 12 * ui;
    const edgeMargin = 16 * ui;
    const isAbove = oppScreenY < 0;
    const arrowCenterX = width / 2;
    const arrowCenterY = isAbove
      ? edgeMargin + arrowSize
      : height - edgeMargin - arrowSize;

    ctx.fillStyle = OPPONENT_COLOR;
    ctx.beginPath();
    if (isAbove) {
      ctx.moveTo(arrowCenterX, arrowCenterY - arrowSize);
      ctx.lineTo(arrowCenterX - arrowSize, arrowCenterY + arrowSize * 0.5);
      ctx.lineTo(arrowCenterX + arrowSize, arrowCenterY + arrowSize * 0.5);
    } else {
      ctx.moveTo(arrowCenterX, arrowCenterY + arrowSize);
      ctx.lineTo(arrowCenterX - arrowSize, arrowCenterY - arrowSize * 0.5);
      ctx.lineTo(arrowCenterX + arrowSize, arrowCenterY - arrowSize * 0.5);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = `${Math.round(9 * ui)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = OPPONENT_COLOR;
    ctx.fillText(
      formatAltitude(p.y, 1),
      arrowCenterX,
      isAbove
        ? arrowCenterY + arrowSize + 12 * ui
        : arrowCenterY - arrowSize - 4 * ui
    );
    ctx.textAlign = "left";
  }

  if (includeHud) {
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
    ctx.font = `bold ${Math.round(HUD_ALTITUDE_FONT_UI * ui)}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(formatAltitude(playerY, 1), 10 * ui, hudTop + 22 * ui);
    ctx.fillStyle = lavaSlowed ? LAVA_SLOWED : TEXT_SECONDARY;
    ctx.textAlign = "right";
    ctx.fillText(
      lavaSlowed
        ? `lava ${formatAltitude(state.hazardY, 1)} slowed`
        : `lava ${formatAltitude(state.hazardY, 1)}`,
      width - 10 * ui,
      hudTop + 22 * ui
    );
    ctx.textAlign = "left";

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
  }

  ctx.restore();
}

type Pose = "idle" | "walk" | "climb" | "air" | "done" | "dead";
type Pt = [number, number];

function drawClimber(
  ctx: PaintCtx,
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
  const p = reducedMotion ? 0 : tick * 0.5;
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
    default:
      leftFoot = [fx - 0.3 * s, fy];
      rightFoot = [fx + 0.3 * s, fy];
      leftHand = [fx - 0.42 * s, shoulderY + 0.6 * s];
      rightHand = [fx + 0.42 * s, shoulderY + 0.6 * s];
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = limbW;

  limb(ctx, fx - 0.12 * s, hipY, leftFoot);
  limb(ctx, fx + 0.12 * s, hipY, rightFoot);
  limb(ctx, fx - 0.1 * s, shoulderY + 0.2 * s, leftHand);
  limb(ctx, fx + 0.1 * s, shoulderY + 0.2 * s, rightHand);

  ctx.fillStyle = color;
  for (const pt of [leftHand, rightHand, leftFoot, rightFoot]) {
    dot(ctx, pt, limbW * 0.6);
  }

  ctx.beginPath();
  ctx.ellipse(fx, (hipY + shoulderY) / 2, 0.34 * s, 0.55 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(fx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

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

function limb(ctx: PaintCtx, x0: number, y0: number, [x1, y1]: Pt) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function dot(ctx: PaintCtx, [x, y]: Pt, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawObstacle(
  ctx: PaintCtx,
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
  ctx: PaintCtx,
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
