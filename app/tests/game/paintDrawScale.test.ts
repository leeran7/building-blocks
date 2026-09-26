/**
 * GAME_DRAW_SCALE — sprites draw bigger; height follows WORLD_HEIGHT_STRETCH.
 *
 * Paints a real match through a recording context and reads the platform slab
 * rects back: their thickness carries the draw scale, their top sits at the
 * WORLD_HEIGHT_STRETCH height, and their left edge and width still map 1:1 to
 * world metres, so the view never pans sideways.
 */

import { describe, expect, it } from "vitest";
import {
  climbView,
  WORLD_HEIGHT_STRETCH,
} from "../../src/components/Game/climbCamera";
import {
  CLIMBER_DRAW_SCALE,
  GAME_DRAW_SCALE,
  paintClimbFrame,
  type PaintCtx,
} from "../../src/components/Game/paintClimbFrame";
import { createMatch } from "../../src/game/simulation";
import { buildTower, platformsNearY } from "../../src/game/towers";

const WIDTH = 360;
const HEIGHT = 640;
const PLATFORM = "#373638";

type Rect = { x: number; y: number; w: number; h: number };
type Arc = { x: number; y: number; r: number };

function recordingContext(): {
  ctx: PaintCtx;
  platformRects: Rect[];
  arcs: Arc[];
} {
  const platformRects: Rect[] = [];
  const arcs: Arc[] = [];
  const gradient = { addColorStop() {} };
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "fillRect") {
        return (x: number, y: number, w: number, h: number) => {
          if (target.fillStyle === PLATFORM) platformRects.push({ x, y, w, h });
        };
      }
      if (prop === "arc") {
        return (x: number, y: number, r: number) => arcs.push({ x, y, r });
      }
      if (prop === "measureText") return () => ({ width: 10 });
      if (typeof prop === "string" && prop.startsWith("create")) {
        return () => gradient;
      }
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as PaintCtx;
  return { ctx, platformRects, arcs };
}

describe("paintClimbFrame: GAME_DRAW_SCALE", () => {
  it("is a 20% bump", () => {
    expect(GAME_DRAW_SCALE).toBe(1.2);
  });

  it("thickens slabs; places them at the stretched height, same x and width", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "draw-scale",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    const { ctx, platformRects } = recordingContext();
    paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT, includeHud: false });

    const { pxPerM, viewH } = climbView(WIDTH, HEIGHT, tower.widthM);
    const worldPlatforms = platformsNearY(tower, -tower.floorGap, viewH);
    expect(platformRects.length).toBeGreaterThan(0);

    let checked = 0;
    let raised = 0;
    for (const r of platformRects) {
      // Left edge and width map 1:1 to world metres: no zoom, no pan.
      const match = worldPlatforms.find(
        (p) =>
          Math.abs(p.x0 * pxPerM - r.x) < 1e-6 &&
          Math.abs((p.x1 - p.x0) * pxPerM - r.w) < 1e-6
      );
      if (!match) continue;
      // Camera sits at the base on the opening frame, so height is the stretch.
      if (match.y > 0) raised++;
      expect(r.y).toBeCloseTo(HEIGHT - match.y * pxPerM * WORLD_HEIGHT_STRETCH);
      expect(r.h).toBeCloseTo(Math.max(6, pxPerM * 2.5 * GAME_DRAW_SCALE));
      expect(r.h).toBeGreaterThan(Math.max(6, pxPerM * 2.5));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(raised).toBeGreaterThan(0);
  });

  it("draws the climber at CLIMBER_DRAW_SCALE, larger than the world", () => {
    expect(CLIMBER_DRAW_SCALE).toBe(1.35);
    expect(CLIMBER_DRAW_SCALE).toBeGreaterThan(GAME_DRAW_SCALE);

    const tower = buildTower("indie-games");
    const m = createMatch({
      seed: "climber-scale",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    const { ctx, arcs } = recordingContext();
    paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT, includeHud: false });

    const { pxPerM, pxPerMY } = climbView(WIDTH, HEIGHT, tower.widthM);
    const p = m.players[0]!;
    const feetX = p.x * pxPerM;
    const feetY = HEIGHT - p.y * pxPerMY;
    // The head is the highest circle drawn on the climber's column.
    const onClimber = arcs.filter(
      (a) => Math.abs(a.x - feetX) < 1e-6 && a.y < feetY
    );
    expect(onClimber.length).toBeGreaterThan(0);
    const head = onClimber.reduce((hi, a) => (a.y < hi.y ? a : hi));
    const drawnHeight = feetY - (head.y - head.r);
    // Unscaled, the climber stood 4.964 tower-metres tall on screen.
    expect(drawnHeight / pxPerM).toBeCloseTo(4.964 * CLIMBER_DRAW_SCALE);
  });
});
