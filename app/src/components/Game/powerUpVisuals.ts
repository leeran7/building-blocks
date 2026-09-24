/**
 * Type-specific power-up marks: one geometry catalog consumed by DOM SVG and
 * canvas. The marks are bold geometric glyphs — chunky fill-only shapes with
 * strong silhouettes, tuned to read at the HUD's 16–26px icon sizes. Every
 * coordinate (including curve control points) stays inside the 24×24 viewBox.
 *
 * Draws are synchronous and tick-keyed. Do not fetch, decode images, or use
 * wall-clock / Math.random here — two clients must record the same commands.
 */

import type { PowerUpType } from "../../game/types";

export const ICON_VIEWBOX = "0 0 24 24";
export const ICON_VIEWBOX_SIZE = 24;
export const MAX_PATH_COMMANDS = 32;
export const ORB_BODY_FILL = "#0a0a0c";
export const ORB_STROKE_WIDTH_FRAC = 0.16;

export type PathCommand =
  | { readonly t: "M"; readonly x: number; readonly y: number }
  | { readonly t: "L"; readonly x: number; readonly y: number }
  | {
      readonly t: "Q";
      readonly x1: number;
      readonly y1: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly t: "C";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly t: "Z" };

export type OrbPathCommand =
  | PathCommand
  | {
      readonly t: "circle";
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    }
  | {
      readonly t: "arc";
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly start: number;
      readonly end: number;
      readonly ccw: boolean;
    };

export type IconLayerPaint = "fill" | "stroke";

export interface IconLayer {
  readonly commands: readonly PathCommand[];
  readonly paint: IconLayerPaint;
  readonly strokeWidth: number;
}

export interface PowerUpIconGeometry {
  readonly viewBox: typeof ICON_VIEWBOX;
  readonly layers: readonly IconLayer[];
}

export interface OrbBodyGeometry {
  readonly commands: readonly OrbPathCommand[];
  readonly fill: typeof ORB_BODY_FILL;
  readonly strokeWidthFrac: typeof ORB_STROKE_WIDTH_FRAC;
}

export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
  bezierCurveTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number
  ): void;
  closePath(): void;
}

export const POWER_UP_ICON_GEOMETRY: Record<PowerUpType, PowerUpIconGeometry> = {
  // Fast ascent — two full-width chunky chevrons pointing up.
  "rapid-climb": {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 12, y: 1 },
          { t: "L", x: 22, y: 9 },
          { t: "L", x: 22, y: 14 },
          { t: "L", x: 12, y: 6.5 },
          { t: "L", x: 2, y: 14 },
          { t: "L", x: 2, y: 9 },
          { t: "Z" },
          { t: "M", x: 12, y: 10.5 },
          { t: "L", x: 22, y: 18.5 },
          { t: "L", x: 22, y: 23.5 },
          { t: "L", x: 12, y: 16 },
          { t: "L", x: 2, y: 23.5 },
          { t: "L", x: 2, y: 18.5 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Speed — solid right-pointing arrowhead with two trailing speed bars.
  "sprint-burst": {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 10, y: 3 },
          { t: "L", x: 23, y: 12 },
          { t: "L", x: 10, y: 21 },
          { t: "Z" },
        ],
      },
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 1, y: 5.5 },
          { t: "L", x: 8, y: 5.5 },
          { t: "L", x: 8, y: 9.5 },
          { t: "L", x: 1, y: 9.5 },
          { t: "Z" },
          { t: "M", x: 1, y: 14.5 },
          { t: "L", x: 8, y: 14.5 },
          { t: "L", x: 8, y: 18.5 },
          { t: "L", x: 1, y: 18.5 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Big jump — fat up-arrow launching off a ground bar.
  "super-jump": {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 12, y: 1 },
          { t: "L", x: 21, y: 11 },
          { t: "L", x: 15, y: 11 },
          { t: "L", x: 15, y: 17 },
          { t: "L", x: 9, y: 17 },
          { t: "L", x: 9, y: 11 },
          { t: "L", x: 3, y: 11 },
          { t: "Z" },
        ],
      },
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 3, y: 20 },
          { t: "L", x: 21, y: 20 },
          { t: "L", x: 21, y: 23 },
          { t: "L", x: 3, y: 23 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Growth — solid center square with four outward corner arrowheads.
  giant: {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 8.5, y: 8.5 },
          { t: "L", x: 15.5, y: 8.5 },
          { t: "L", x: 15.5, y: 15.5 },
          { t: "L", x: 8.5, y: 15.5 },
          { t: "Z" },
        ],
      },
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 1, y: 1 },
          { t: "L", x: 9, y: 1 },
          { t: "L", x: 1, y: 9 },
          { t: "Z" },
          { t: "M", x: 15, y: 1 },
          { t: "L", x: 23, y: 1 },
          { t: "L", x: 23, y: 9 },
          { t: "Z" },
          { t: "M", x: 23, y: 15 },
          { t: "L", x: 23, y: 23 },
          { t: "L", x: 15, y: 23 },
          { t: "Z" },
          { t: "M", x: 9, y: 23 },
          { t: "L", x: 1, y: 23 },
          { t: "L", x: 1, y: 15 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Thrust — solid rocket silhouette (nose, body, fins) over a flame triangle.
  jetpack: {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 12, y: 0.5 },
          { t: "L", x: 16, y: 5 },
          { t: "L", x: 16, y: 13 },
          { t: "L", x: 20, y: 17 },
          { t: "L", x: 15, y: 17 },
          { t: "L", x: 15, y: 19 },
          { t: "L", x: 9, y: 19 },
          { t: "L", x: 9, y: 17 },
          { t: "L", x: 4, y: 17 },
          { t: "L", x: 8, y: 13 },
          { t: "L", x: 8, y: 5 },
          { t: "Z" },
        ],
      },
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 9.5, y: 19.5 },
          { t: "L", x: 14.5, y: 19.5 },
          { t: "L", x: 12, y: 23.5 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Time slowed — heavy capped hourglass: two caps and two solid funnels.
  "slow-lava": {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 3, y: 1 },
          { t: "L", x: 21, y: 1 },
          { t: "L", x: 21, y: 4 },
          { t: "L", x: 3, y: 4 },
          { t: "Z" },
          { t: "M", x: 3, y: 20 },
          { t: "L", x: 21, y: 20 },
          { t: "L", x: 21, y: 23 },
          { t: "L", x: 3, y: 23 },
          { t: "Z" },
          { t: "M", x: 5, y: 4 },
          { t: "L", x: 19, y: 4 },
          { t: "L", x: 12, y: 12 },
          { t: "Z" },
          { t: "M", x: 12, y: 12 },
          { t: "L", x: 19, y: 20 },
          { t: "L", x: 5, y: 20 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Snowflake — six-pointed star for freeze.
  "freeze-lava": {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 12, y: 1 },
          { t: "L", x: 14, y: 7 },
          { t: "L", x: 20, y: 5 },
          { t: "L", x: 17, y: 12 },
          { t: "L", x: 23, y: 12 },
          { t: "L", x: 17, y: 15 },
          { t: "L", x: 20, y: 21 },
          { t: "L", x: 14, y: 17 },
          { t: "L", x: 12, y: 23 },
          { t: "L", x: 10, y: 17 },
          { t: "L", x: 4, y: 21 },
          { t: "L", x: 7, y: 15 },
          { t: "L", x: 1, y: 12 },
          { t: "L", x: 7, y: 12 },
          { t: "L", x: 4, y: 5 },
          { t: "L", x: 10, y: 7 },
          { t: "Z" },
        ],
      },
    ],
  },
  // Mystery — bold question mark.
  random: {
    viewBox: ICON_VIEWBOX,
    layers: [
      {
        paint: "fill",
        strokeWidth: 0,
        commands: [
          { t: "M", x: 8, y: 2 },
          { t: "L", x: 16, y: 2 },
          { t: "Q", x1: 21, y1: 2, x: 21, y: 7 },
          { t: "Q", x1: 21, y1: 12, x: 14, y: 13 },
          { t: "L", x: 14, y: 16 },
          { t: "L", x: 10, y: 16 },
          { t: "L", x: 10, y: 12 },
          { t: "Q", x1: 17, y1: 11, x: 17, y: 7 },
          { t: "Q", x1: 17, y1: 5, x: 14, y: 5 },
          { t: "L", x: 8, y: 5 },
          { t: "Z" },
          { t: "M", x: 10, y: 19 },
          { t: "L", x: 14, y: 19 },
          { t: "L", x: 14, y: 23 },
          { t: "L", x: 10, y: 23 },
          { t: "Z" },
        ],
      },
    ],
  },
};

export const POWER_UP_ORB_BODIES: Record<PowerUpType, OrbBodyGeometry> = {
  "rapid-climb": {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: -0.45, y: -0.55 },
      { t: "C", x1: -0.45, y1: -1, x2: 0.45, y2: -1, x: 0.45, y: -0.55 },
      { t: "L", x: 0.45, y: 0.55 },
      { t: "C", x1: 0.45, y1: 1, x2: -0.45, y2: 1, x: -0.45, y: 0.55 },
      { t: "Z" },
    ],
  },
  "sprint-burst": {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: -0.95, y: -0.72 },
      { t: "L", x: 0.2, y: -0.72 },
      { t: "L", x: 1, y: 0 },
      { t: "L", x: 0.2, y: 0.72 },
      { t: "L", x: -0.95, y: 0.72 },
      { t: "L", x: -0.55, y: 0 },
      { t: "Z" },
    ],
  },
  "super-jump": {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: -1, y: 0.15 },
      { t: "L", x: 0, y: 0.15 },
      { t: "L", x: 0, y: -1 },
      { t: "L", x: 1, y: -1 },
      { t: "L", x: 1, y: 1 },
      { t: "L", x: -1, y: 1 },
      { t: "Z" },
    ],
  },
  giant: {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [{ t: "circle", cx: 0, cy: 0, r: 1 }],
  },
  jetpack: {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: 0, y: -1 },
      { t: "C", x1: 0.7, y1: -1, x2: 1, y2: -0.2, x: 0.45, y: 0.4 },
      { t: "L", x: 0, y: 1 },
      { t: "L", x: -0.45, y: 0.4 },
      { t: "C", x1: -1, y1: -0.2, x2: -0.7, y2: -1, x: 0, y: -1 },
      { t: "Z" },
    ],
  },
  "slow-lava": {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: -0.72, y: -1 },
      { t: "L", x: 0.72, y: -1 },
      { t: "L", x: 0.22, y: -0.12 },
      { t: "L", x: 0.22, y: 0.12 },
      { t: "L", x: 0.72, y: 1 },
      { t: "L", x: -0.72, y: 1 },
      { t: "L", x: -0.22, y: 0.12 },
      { t: "L", x: -0.22, y: -0.12 },
      { t: "Z" },
    ],
  },
  "freeze-lava": {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: 0, y: -1 },
      { t: "L", x: 0.87, y: -0.5 },
      { t: "L", x: 0.87, y: 0.5 },
      { t: "L", x: 0, y: 1 },
      { t: "L", x: -0.87, y: 0.5 },
      { t: "L", x: -0.87, y: -0.5 },
      { t: "Z" },
    ],
  },
  random: {
    fill: ORB_BODY_FILL,
    strokeWidthFrac: ORB_STROKE_WIDTH_FRAC,
    commands: [
      { t: "M", x: 0, y: -1 },
      { t: "L", x: 1, y: 0 },
      { t: "L", x: 0, y: 1 },
      { t: "L", x: -1, y: 0 },
      { t: "Z" },
    ],
  },
};

export function emitPathCommand(cmd: PathCommand, sink: PathSink): void {
  switch (cmd.t) {
    case "M":
      sink.moveTo(cmd.x, cmd.y);
      return;
    case "L":
      sink.lineTo(cmd.x, cmd.y);
      return;
    case "Q":
      sink.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      return;
    case "C":
      sink.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      return;
    case "Z":
      sink.closePath();
      return;
  }
}

export function drawPowerUpIcon(
  ctx: CanvasRenderingContext2D,
  type: PowerUpType,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const geometry = POWER_UP_ICON_GEOMETRY[type];
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / ICON_VIEWBOX_SIZE, size / ICON_VIEWBOX_SIZE);
  for (const layer of geometry.layers) {
    ctx.save();
    ctx.beginPath();
    for (const cmd of layer.commands) {
      emitPathCommand(cmd, ctx);
    }
    if (layer.paint === "fill") {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = layer.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawPowerUpOrbBody(
  ctx: CanvasRenderingContext2D,
  type: PowerUpType,
  r: number,
  strokeColor: string
): void {
  const body = POWER_UP_ORB_BODIES[type];
  ctx.save();
  ctx.scale(r, r);
  ctx.beginPath();
  for (const cmd of body.commands) {
    emitOrbPathCommand(cmd, ctx);
  }
  ctx.fillStyle = body.fill;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = body.strokeWidthFrac;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function emitOrbPathCommand(
  cmd: OrbPathCommand,
  ctx: CanvasRenderingContext2D
): void {
  if (cmd.t === "circle") {
    ctx.arc(cmd.cx, cmd.cy, cmd.r, 0, Math.PI * 2, false);
    ctx.closePath();
    return;
  }
  if (cmd.t === "arc") {
    ctx.arc(cmd.cx, cmd.cy, cmd.r, cmd.start, cmd.end, cmd.ccw);
    return;
  }
  emitPathCommand(cmd, ctx);
}
