/**
 * Power-up visual effects for the climb canvas.
 *
 * All motion is driven by the deterministic sim tick so two clients stay in
 * sync. Every public draw helper accepts `reducedMotion` and falls back to
 * static or simplified visuals when set.
 */

import {
  POWER_UP_SPECS,
  type PowerUpSpec,
} from "../../game/powerups";
import {
  type ActivePowerUp,
  type PlayerState,
  type PowerUpPickup,
  type PowerUpType,
} from "../../game/types";
import { drawPowerUpIcon, drawPowerUpOrbBody } from "./powerUpVisuals";

/** Ticks the pickup burst plays for (matches ClimbCanvas). */
export const PICKUP_BURST_TICKS = 18;
/** Ticks the centred pickup banner stays visible. */
export const PICKUP_FLASH_TICKS = 55;
/** Ticks the full-screen pickup flash lasts. */
export const PICKUP_SCREEN_FLASH_TICKS = 10;
/** Ticks of subtle camera shake after a pickup. */
export const PICKUP_SHAKE_TICKS = 8;

const TAU = Math.PI * 2;
const ORB_ICON_SIZE_FRAC = 1.15;
const BANNER_ICON_SIZE_UI = 16;
const BANNER_ICON_GAP_UI = 8;
const BANNER_PILL_PAD_UI = 28;
const BANNER_PILL_HEIGHT_UI = 36;

/** Deterministic pseudo-random in [0, 1) from integers. */
export function hash01(a: number, b: number, c: number = 0): number {
  let x = (a * 374761393 + b * 668265263 + c * 982451653) | 0;
  x = (x ^ (x >>> 13)) | 0;
  x = (x * 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Sub-pixel camera shake after grabbing an orb. Returns screen-space offsets. */
export function pickupShakeOffset(
  pickupAge: number,
  tick: number,
  ui: number,
  reducedMotion: boolean
): { dx: number; dy: number } {
  if (reducedMotion || pickupAge < 0 || pickupAge >= PICKUP_SHAKE_TICKS) {
    return { dx: 0, dy: 0 };
  }
  const falloff = 1 - pickupAge / PICKUP_SHAKE_TICKS;
  const amp = 2.2 * ui * falloff * falloff;
  return {
    dx: Math.sin(tick * 2.37 + pickupAge * 1.1) * amp,
    dy: Math.cos(tick * 1.83 + pickupAge * 0.9) * amp * 0.65,
  };
}

/** Banner scale pop on pickup — 1 at rest, peaks early then settles. */
export function pickupBannerScale(t: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (t < 0.12) return 1 + (1 - t / 0.12) * 0.14;
  if (t < 0.35) {
    const u = (t - 0.12) / 0.23;
    return 1 + 0.04 * (1 - u);
  }
  return 1;
}

export function drawPowerUpOrb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  pxPerM: number,
  ui: number,
  pu: PowerUpPickup,
  tick: number,
  reducedMotion: boolean,
  cooling: boolean = false
): void {
  const spec = POWER_UP_SPECS[pu.type];
  const phase = tick * 0.08 + pu.floorIndex * 1.7;
  const bob = reducedMotion ? 0 : Math.sin(phase) * pxPerM * 0.45;
  const cy = baseY + bob;
  const r = Math.max(9, pxPerM * 1.35);
  const spin = reducedMotion ? 0 : tick * 0.045 + pu.floorIndex * 0.31;
  const pulse = reducedMotion ? 0.35 : 0.28 + 0.16 * (0.5 + 0.5 * Math.sin(phase * 1.6));
  const dim = cooling ? 0.45 : 1;

  ctx.save();

  // Layered halos — outer breathes faster than inner.
  for (const [scale, alpha] of [
    [2.35, 0.12],
    [1.85, pulse * 0.55],
  ] as const) {
    ctx.globalAlpha = alpha * dim;
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, TAU);
    ctx.fill();
  }

  // Rotating dashed orbit ring.
  ctx.globalAlpha = (reducedMotion ? 0.25 : 0.35 + 0.25 * Math.sin(phase * 2.1)) * dim;
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.setLineDash([r * 0.35, r * 0.22]);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.28, spin, spin + TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // Type-specific body with a slow wobble.
  const wobble = reducedMotion ? 0 : Math.sin(phase * 0.7) * 0.06;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wobble);
  ctx.globalAlpha = dim;
  drawPowerUpOrbBody(ctx, pu.type, r, spec.color);

  // Corner sparkles on the body.
  if (!reducedMotion) {
    const sparkle = 0.45 + 0.55 * Math.sin(tick * 0.31 + pu.floorIndex);
    ctx.globalAlpha = sparkle * 0.85 * dim;
    ctx.fillStyle = "#f4f2ec";
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      const sx = Math.cos(a) * r * 0.72;
      const sy = Math.sin(a) * r * 0.72;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.2, r * 0.07), 0, TAU);
      ctx.fill();
    }
  }

  ctx.globalAlpha = dim;
  drawPowerUpIcon(ctx, pu.type, 0, 0, r * ORB_ICON_SIZE_FRAC, spec.color);
  ctx.restore();

  // Name plate.
  ctx.font = `${Math.round(8 * ui)}px monospace`;
  ctx.fillStyle = spec.color;
  ctx.globalAlpha = 0.85 * dim;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(spec.label.toUpperCase(), cx, cy + r * 1.95);

  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Multi-ring burst with radial sparks where an orb was collected. */
export function drawPickupBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  pxPerM: number,
  type: PowerUpType,
  floorIndex: number,
  tick: number,
  reducedMotion: boolean
): void {
  const spec = POWER_UP_SPECS[type];
  const baseR = Math.max(9, pxPerM * 1.35);

  ctx.save();

  // Inner flash.
  ctx.globalAlpha = (1 - t) * (reducedMotion ? 0.35 : 0.55);
  ctx.fillStyle = spec.color;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * (0.6 + t * 0.8), 0, TAU);
  ctx.fill();

  // Staggered rings.
  for (let ring = 0; ring < 3; ring++) {
    const delay = ring * 0.12;
    const rt = Math.max(0, (t - delay) / (1 - delay));
    if (rt <= 0) continue;
    const r = baseR * (1 + rt * (2.4 + ring * 0.5));
    ctx.globalAlpha = (1 - rt) * (0.85 - ring * 0.18);
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = Math.max(1.2, pxPerM * 0.32 * (1 - rt) * (1.1 - ring * 0.2));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }

  // Radial sparks.
  const sparkCount = reducedMotion ? 4 : 10;
  for (let i = 0; i < sparkCount; i++) {
    const seed = hash01(floorIndex, i, tick);
    const angle = seed * TAU + t * (reducedMotion ? 0 : 0.6);
    const dist = baseR * (1.2 + t * (1.8 + seed * 1.4));
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const sr = Math.max(1, baseR * 0.08 * (1 - t));
    ctx.globalAlpha = (1 - t) * (0.5 + seed * 0.5);
    ctx.fillStyle = i % 2 === 0 ? spec.color : "#f4f2ec";
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
  }

  // Diamond shard fragments.
  if (!reducedMotion) {
    for (let i = 0; i < 6; i++) {
      const seed = hash01(floorIndex + 7, i, type.length);
      const angle = seed * TAU;
      const dist = baseR * (0.5 + t * (2 + seed));
      const size = baseR * 0.14 * (1 - t);
      ctx.save();
      ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
      ctx.rotate(angle + t * 2);
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.fillStyle = spec.color;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.65, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.65, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

/** Brief full-screen colour wash when a power-up is grabbed. */
export function drawPickupScreenFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  age: number,
  color: string,
  reducedMotion: boolean
): void {
  if (reducedMotion || age < 0 || age >= PICKUP_SCREEN_FLASH_TICKS) return;
  const t = age / PICKUP_SCREEN_FLASH_TICKS;
  const alpha = (1 - t) * (1 - t) * 0.18;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Type-specific aura and trail while an effect is live. */
export function drawActivePowerUpEffect(
  ctx: CanvasRenderingContext2D,
  type: PowerUpType,
  px: number,
  pyScreen: number,
  s: number,
  facing: 1 | -1,
  tick: number,
  active: ActivePowerUp,
  player: PlayerState | undefined,
  reducedMotion: boolean
): void {
  const spec = POWER_UP_SPECS[type];
  const remaining = active.durationTicks - (tick - active.startTick);
  const urgent = remaining <= 30;
  const phase = reducedMotion ? 0 : tick * (urgent ? 0.36 : 0.12);
  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(phase);

  switch (type) {
    case "rapid-climb":
      drawRapidClimbEffect(ctx, px, pyScreen, s, pulse, tick, player, spec, reducedMotion);
      break;
    case "sprint-burst":
      drawSprintBurstEffect(ctx, px, pyScreen, s, facing, pulse, tick, spec, reducedMotion);
      break;
    case "double-jump":
      drawDoubleJumpEffect(ctx, px, pyScreen - 1.25 * s, s, pulse, spec, reducedMotion);
      break;
    case "giant":
      drawGiantEffect(ctx, px, pyScreen - 1.25 * s, s, pulse, tick, spec, reducedMotion);
      break;
    case "jetpack":
      drawJetpackAura(ctx, px, pyScreen - 1.25 * s, s, pulse, spec);
      break;
    case "slow-lava":
      drawSlowLavaEffect(ctx, px, pyScreen - 1.25 * s, s, pulse, tick, spec, reducedMotion);
      break;
  }
}

function drawRapidClimbEffect(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  pulse: number,
  tick: number,
  player: PlayerState | undefined,
  spec: PowerUpSpec,
  reducedMotion: boolean
): void {
  const onLadder = player?.onLadder ?? false;
  ctx.save();
  ctx.strokeStyle = spec.color;
  ctx.lineCap = "round";

  // Upward streaks — brighter on ladders.
  const streakCount = reducedMotion ? 2 : onLadder ? 5 : 3;
  for (let i = 0; i < streakCount; i++) {
    const offset = (i - (streakCount - 1) / 2) * 0.22 * s;
    const drift = reducedMotion ? 0 : ((tick * 0.9 + i * 7) % 14) / 14;
    const y0 = py - drift * s * 1.8;
    const y1 = y0 - s * (0.55 + pulse * 0.25);
    ctx.globalAlpha = (onLadder ? 0.55 : 0.35) * (1 - drift * 0.6);
    ctx.lineWidth = Math.max(1.2, 0.1 * s);
    ctx.beginPath();
    ctx.moveTo(px + offset, y0);
    ctx.lineTo(px + offset * 0.6, y1);
    ctx.stroke();
  }

  // Pulsing chevrons above the head.
  ctx.globalAlpha = 0.35 + 0.4 * pulse;
  ctx.lineWidth = Math.max(1.5, 0.14 * s);
  const chevY = py - 2.55 * s - pulse * 0.08 * s;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(px + sign * 0.35 * s, chevY + 0.2 * s);
    ctx.lineTo(px, chevY - 0.15 * s);
    ctx.lineTo(px - sign * 0.35 * s, chevY + 0.2 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSprintBurstEffect(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  facing: 1 | -1,
  pulse: number,
  tick: number,
  spec: PowerUpSpec,
  reducedMotion: boolean
): void {
  ctx.save();
  ctx.strokeStyle = spec.color;
  ctx.lineCap = "round";

  // Horizontal speed lines trailing behind.
  const trailDir = -facing;
  const lineCount = reducedMotion ? 2 : 4;
  for (let i = 0; i < lineCount; i++) {
    const drift = reducedMotion ? i * 0.2 : ((tick * 1.1 + i * 5) % 12) / 12;
    const x0 = px + trailDir * (0.3 + drift) * s * 1.4;
    const x1 = x0 + trailDir * s * (0.35 + pulse * 0.2);
    const yOff = (i - (lineCount - 1) / 2) * 0.28 * s;
    ctx.globalAlpha = 0.45 * (1 - drift * 0.5);
    ctx.lineWidth = Math.max(1, 0.09 * s);
    ctx.beginPath();
    ctx.moveTo(x0, py - 1.1 * s + yOff);
    ctx.lineTo(x1, py - 1.1 * s + yOff);
    ctx.stroke();
  }

  // Stretched ellipse aura.
  ctx.globalAlpha = 0.22 + 0.35 * pulse;
  ctx.lineWidth = Math.max(1.5, 0.14 * s);
  ctx.beginPath();
  ctx.ellipse(
    px,
    py - 1.25 * s,
    (1.15 + pulse * 0.18) * s,
    (1.55 + pulse * 0.1) * s,
    0,
    0,
    TAU
  );
  ctx.stroke();
  ctx.restore();
}

function drawDoubleJumpEffect(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  pulse: number,
  spec: PowerUpSpec,
  reducedMotion: boolean
): void {
  ctx.save();
  ctx.strokeStyle = spec.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const hops = reducedMotion ? 1 : 2;
  for (let i = 0; i < hops; i++) {
    const y = py - (0.35 + i * 0.55 + pulse * 0.12) * s;
    ctx.globalAlpha = 0.35 + 0.4 * pulse - i * 0.12;
    ctx.lineWidth = Math.max(1.6, 0.14 * s);
    ctx.beginPath();
    ctx.moveTo(px - 0.45 * s, y + 0.22 * s);
    ctx.lineTo(px, y);
    ctx.lineTo(px + 0.45 * s, y + 0.22 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGiantEffect(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  pulse: number,
  tick: number,
  spec: PowerUpSpec,
  reducedMotion: boolean
): void {
  ctx.save();
  ctx.strokeStyle = spec.color;

  const swell = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(tick * 0.1);
  ctx.globalAlpha = 0.2 + 0.25 * pulse;
  ctx.lineWidth = Math.max(1.5, 0.14 * s);
  ctx.beginPath();
  ctx.ellipse(
    px,
    py,
    (1.35 + swell * 0.2) * s,
    (2.05 + swell * 0.15) * s,
    0,
    0,
    TAU
  );
  ctx.stroke();

  ctx.globalAlpha = 0.35 + 0.45 * pulse;
  ctx.lineWidth = Math.max(1.8, 0.16 * s);
  ctx.beginPath();
  ctx.ellipse(px, py, (1.08 + pulse * 0.12) * s, (1.72 + pulse * 0.1) * s, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawJetpackAura(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  pulse: number,
  spec: PowerUpSpec
): void {
  ctx.save();
  ctx.strokeStyle = spec.color;
  ctx.globalAlpha = 0.3 + 0.45 * pulse;
  ctx.lineWidth = Math.max(1.5, 0.15 * s);
  ctx.beginPath();
  ctx.ellipse(px, py, (1.08 + pulse * 0.14) * s, (1.72 + pulse * 0.1) * s, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawSlowLavaEffect(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  pulse: number,
  tick: number,
  spec: PowerUpSpec,
  reducedMotion: boolean
): void {
  ctx.save();
  ctx.strokeStyle = spec.color;

  // Expanding ripple rings.
  for (let ring = 0; ring < 2; ring++) {
    const phase = reducedMotion ? 0.5 : ((tick * 0.08 + ring * 0.5) % 1);
    const r = (1.2 + phase * 0.9 + ring * 0.15) * s;
    ctx.globalAlpha = (1 - phase) * (0.35 - ring * 0.08);
    ctx.lineWidth = Math.max(1.2, 0.11 * s);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 1.55, 0, 0, TAU);
    ctx.stroke();
  }

  // Clock ticks orbiting.
  const tickCount = reducedMotion ? 4 : 8;
  const orbitR = (1.35 + pulse * 0.1) * s;
  for (let i = 0; i < tickCount; i++) {
    const angle = (i / tickCount) * TAU + (reducedMotion ? 0 : tick * 0.06);
    const tx = px + Math.cos(angle) * orbitR;
    const ty = py + Math.sin(angle) * orbitR * 0.7;
    ctx.globalAlpha = 0.4 + 0.35 * pulse;
    ctx.lineWidth = Math.max(1, 0.08 * s);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(angle) * 0.18 * s, ty + Math.sin(angle) * 0.18 * s);
    ctx.stroke();
  }

  // Core ring.
  ctx.globalAlpha = 0.32 + 0.48 * pulse;
  ctx.lineWidth = Math.max(1.5, 0.16 * s);
  ctx.beginPath();
  ctx.ellipse(px, py, (1.02 + pulse * 0.12) * s, (1.68 + pulse * 0.1) * s, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Centred pickup banner with glow pill backdrop. */
export function drawPickupBanner(
  ctx: CanvasRenderingContext2D,
  width: number,
  hudH: number,
  ui: number,
  spec: PowerUpSpec,
  age: number,
  reducedMotion: boolean
): void {
  const t = age / PICKUP_FLASH_TICKS;
  const scale = pickupBannerScale(t, reducedMotion);
  const alpha = 1 - t * t;
  const title = spec.label.toUpperCase();
  const subtitle = spec.description.toUpperCase();
  const ty = hudH + 46 * ui - t * 14 * ui;
  const cx = width / 2;
  const iconSize = BANNER_ICON_SIZE_UI * ui;
  const gap = BANNER_ICON_GAP_UI * ui;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";

  ctx.font = `bold ${Math.round(15 * ui)}px monospace`;
  const titleW = ctx.measureText(title).width;
  ctx.font = `${Math.round(10 * ui)}px monospace`;
  const subW = ctx.measureText(subtitle).width;
  const innerW = iconSize + gap + Math.max(titleW, subW);
  const pillW = innerW + BANNER_PILL_PAD_UI * ui;
  const pillH = BANNER_PILL_HEIGHT_UI * ui;
  const pillY = ty - 18 * ui;
  const groupLeft = cx - innerW / 2;

  ctx.save();
  ctx.translate(cx, ty);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -ty);

  ctx.fillStyle = spec.color;
  ctx.globalAlpha = alpha * 0.14;
  ctx.beginPath();
  roundRect(ctx, cx - pillW / 2, pillY, pillW, pillH, 10 * ui);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.55;
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = 1.5 * ui;
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = alpha;
  drawPowerUpIcon(
    ctx,
    spec.type,
    groupLeft + iconSize / 2,
    ty,
    iconSize,
    spec.color
  );
  ctx.restore();

  ctx.font = `bold ${Math.round(15 * ui)}px monospace`;
  ctx.fillStyle = spec.color;
  ctx.globalAlpha = alpha;
  ctx.textAlign = "left";
  ctx.fillText(title, groupLeft + iconSize + gap, ty);

  ctx.font = `${Math.round(10 * ui)}px monospace`;
  ctx.fillStyle = "#f4f2ec";
  ctx.fillText(subtitle, groupLeft + iconSize + gap, ty + 14 * ui);
  ctx.restore();

  ctx.restore();
  ctx.textAlign = "left";
}

const JETPACK_FLAME_CORE = "#ffd4a8";
const JETPACK_FLAME_WIDTH_FRAC = 0.42;
const JETPACK_FLAME_HEIGHT_FRAC = 0.9;
const JETPACK_FLAME_CORE_WIDTH_FRAC = 0.4;
const JETPACK_FLAME_CORE_HEIGHT_FRAC = 0.5;
const JETPACK_FLAME_STATIC_SCALE = 0.75;
const JETPACK_FLAME_FLICKER_AMP = 0.16;
const JETPACK_FLAME_FLICKER_RATE = 0.71;

/** Jetpack plume with ember particles. */
export function drawJetpackFlame(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  s: number,
  tick: number,
  reducedMotion: boolean
): void {
  const spec = POWER_UP_SPECS.jetpack;
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

  // Outer flame.
  ctx.fillStyle = spec.color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(fx - halfW, fy);
  ctx.lineTo(fx + halfW, fy);
  ctx.lineTo(fx, fy + height);
  ctx.closePath();
  ctx.fill();

  // Inner core.
  const coreHalf = halfW * JETPACK_FLAME_CORE_WIDTH_FRAC;
  const coreH = height * JETPACK_FLAME_CORE_HEIGHT_FRAC;
  ctx.fillStyle = JETPACK_FLAME_CORE;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(fx - coreHalf, fy);
  ctx.lineTo(fx + coreHalf, fy);
  ctx.lineTo(fx, fy + coreH);
  ctx.closePath();
  ctx.fill();

  // Ember particles below the plume.
  if (!reducedMotion) {
    for (let i = 0; i < 6; i++) {
      const seed = hash01(tick, i, 3);
      const drift = ((tick * 0.35 + i * 4) % 10) / 10;
      const ex = fx + (seed - 0.5) * halfW * 1.6;
      const ey = fy + height * (0.35 + drift * 0.75);
      ctx.globalAlpha = (1 - drift) * 0.65;
      ctx.fillStyle = i % 2 === 0 ? JETPACK_FLAME_CORE : spec.color;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1, s * 0.05 * (1 - drift)), 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
