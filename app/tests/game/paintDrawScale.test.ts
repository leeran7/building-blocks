/**
 * GAME_DRAW_SCALE — sprites draw bigger, nothing moves.
 *
 * Paints a real match through a recording context and reads the platform slab
 * rects back: their thickness carries the draw scale, while their position
 * and width still map 1:1 to world metres, so the view neither zooms nor pans.
 */

import { describe, expect, it } from "vitest";
import { climbView } from "../../src/components/Game/climbCamera";
import {
  CLIMBER_DRAW_SCALE,
  GAME_DRAW_SCALE,
  HANGING_LADDER,
  hudFitFontPx,
  paintClimbFrame,
  type PaintCtx,
} from "../../src/components/Game/paintClimbFrame";
import { createMatch } from "../../src/game/simulation";
import { grantPowerUp } from "../../src/game/powerups";
import { buildTower, ladderHangs, laddersNearY, platformsNearY } from "../../src/game/towers";

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

  it("thickens slabs without moving or widening them", () => {
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
      // Camera sits at the base on the opening frame.
      if (match.y > 0) raised++;
      expect(r.y).toBeCloseTo(HEIGHT - match.y * pxPerM);
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

    const { pxPerM } = climbView(WIDTH, HEIGHT, tower.widthM);
    const p = m.players[0]!;
    const feetX = p.x * pxPerM;
    const feetY = HEIGHT - p.y * pxPerM;
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

describe("canvas HUD: the lava readout never overlaps the altitude", () => {
  it("hudFitFontPx keeps the size when it fits and shrinks when it does not", () => {
    expect(hudFitFontPx(20, 100, 150)).toBe(20);
    expect(hudFitFontPx(20, 200, 150)).toBe(15);
    expect(hudFitFontPx(20, 1000, 150)).toBe(12);
    expect(hudFitFontPx(20, 0, 150)).toBe(20);
  });

  it("fits a hardened lava readout at five-digit altitude on a 360px canvas", () => {
    const tower = buildTower("indie-games");
    const m = createMatch({ seed: "hud-fit", mode: "solo", tower, playerIds: ["p1"] });
    const p = m.players[0]!;
    p.y = 99_999;
    m.hazardY = 99_979;
    grantPowerUp(p, "harden-lava", m.tick);

    // Monospace: every glyph is 0.6em of the current font size.
    const texts: { text: string; x: number; w: number; align: string }[] = [];
    const st: Record<string | symbol, unknown> = {};
    const pxOf = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(st.font))?.[1] ?? 10);
    const ctx = new Proxy(st, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (prop === "measureText") return (s: string) => ({ width: s.length * 0.6 * pxOf() });
        if (prop === "fillText") {
          return (s: string, x: number) =>
            texts.push({ text: s, x, w: s.length * 0.6 * pxOf(), align: String(t.textAlign) });
        }
        if (typeof prop === "string" && prop.startsWith("create")) return () => ({ addColorStop() {} });
        return () => {};
      },
      set(t, prop, v) {
        t[prop] = v;
        return true;
      },
    }) as unknown as PaintCtx;

    paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT });
    const alt = texts.find((t) => t.align === "left" && /ft|m/.test(t.text) && !t.text.startsWith("lava"));
    const lava = texts.find((t) => t.text.startsWith("lava") && t.text.endsWith("hardened"));
    expect(alt).toBeDefined();
    expect(lava).toBeDefined();
    const altRight = alt!.x + alt!.w;
    const lavaLeft = lava!.x - lava!.w;
    expect(lavaLeft).toBeGreaterThan(altRight);
    expect(lava!.x).toBeLessThanOrEqual(WIDTH);
  });
});

describe("paintClimbFrame: hanging ladders stand out", () => {
  /** x of every dashed amber jump line drawn, in canvas px. */
  function jumpLines(tower: ReturnType<typeof buildTower>): number[] {
    const xs: number[] = [];
    const state: Record<string | symbol, unknown> = { dash: [] as number[] };
    const ctx = new Proxy(state, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "setLineDash") return (d: number[]) => (target.dash = d);
        if (prop === "moveTo") {
          return (x: number) => {
            if (target.strokeStyle === HANGING_LADDER && (target.dash as number[]).length > 0) xs.push(x);
          };
        }
        if (prop === "measureText") return () => ({ width: 10 });
        if (typeof prop === "string" && prop.startsWith("create")) return () => ({ addColorStop() {} });
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }) as unknown as PaintCtx;
    const m = createMatch({ seed: "hang-paint", mode: "solo", tower, playerIds: ["p1"] });
    paintClimbFrame(ctx, m, { width: WIDTH, height: HEIGHT, includeHud: false });
    return xs;
  }

  it("marks the hanging ladders in view, and only them, with an amber jump line", () => {
    const base = { ...buildTower("indie-games"), difficulty: 0.4, ladderHangM: 1.5 };
    const mixed = { ...base, hangingLadderShare: 0.5 };
    const { pxPerM, viewH } = climbView(WIDTH, HEIGHT, base.widthM);
    const hungXs = laddersNearY(mixed, -mixed.floorGap, viewH)
      .filter(({ ix, slot }) => ladderHangs(mixed, ix, slot))
      .map(({ ladder }) => ladder.x * pxPerM);
    const plainXs = laddersNearY(mixed, -mixed.floorGap, viewH)
      .filter(({ ix, slot }) => !ladderHangs(mixed, ix, slot))
      .map(({ ladder }) => ladder.x * pxPerM);
    expect(plainXs.length).toBeGreaterThan(0);
    const drawn = jumpLines(mixed);
    expect(drawn.length).toBeGreaterThan(0);
    // Every jump line sits on a hanging ladder; none on a plain one.
    for (const x of drawn) {
      expect(hungXs.some((h) => Math.abs(h - x) < 1e-6)).toBe(true);
      expect(plainXs.some((h) => Math.abs(h - x) < 1e-6)).toBe(false);
    }
    expect(jumpLines({ ...base, hangingLadderShare: 0 })).toEqual([]);
    expect(jumpLines(buildTower("indie-games"))).toEqual([]);
  });
});
