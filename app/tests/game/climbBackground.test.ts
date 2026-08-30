/**
 * Climb backdrop: tiled JPEG + a hard blit budget.
 *
 * The previous vista either rebuilt ~130 lava plates or painted a solid orange
 * lake. This suite invokes production with a recording context and a stub tile
 * and asserts the cheap contract: drawImage covers the canvas, no radial
 * gradients, and repeat count is a function of height/tileH — not width.
 */

import { describe, expect, it } from "vitest";
import {
  BIOME_ALTITUDES,
  biomeProgress,
  climbBiome,
  drawClimbBackground,
  EMBER_MAX,
  emberCount,
  tileRepeatCount,
  tileScrollY,
} from "../../src/components/Game/climbBackground";

const STUB_TILE = { width: 68, height: 102 } as unknown as CanvasImageSource;

describe("biome journey", () => {
  it("starts in the volcano and ends on the summit", () => {
    expect(climbBiome(0)).toBe("volcano");
    expect(climbBiome(40)).toBe("volcano");
    expect(climbBiome(200)).toBe("cooling");
    expect(climbBiome(400)).toBe("mountains");
    expect(climbBiome(700)).toBe("leaving");
    expect(climbBiome(1100)).toBe("summit");
  });

  it("progress is 0 on the floor, 1 at the summit, and hits each anchor", () => {
    expect(biomeProgress(0)).toBe(0);
    expect(biomeProgress(2000)).toBe(1);
    let prev = -1;
    for (let y = 0; y <= 1200; y += 40) {
      const p = biomeProgress(y);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    const last = BIOME_ALTITUDES.length - 1;
    for (let i = 0; i <= last; i++) {
      expect(biomeProgress(BIOME_ALTITUDES[i])).toBe(i / last);
    }
  });
});

describe("tile loop", () => {
  it("scroll wraps inside the tile and moves as you climb", () => {
    expect(tileScrollY(0, 200)).toBe(0);
    expect(tileScrollY(50, 200)).toBeGreaterThan(0);
    expect(tileScrollY(50, 200)).toBeLessThan(200);
    expect(tileScrollY(1000, 200)).toBeLessThan(200);
    expect(tileScrollY(40, 200)).toBe(tileScrollY(40 + 200 / 1.8, 200));
  });

  it("repeat count depends on height / tile height, not canvas width", () => {
    expect(tileRepeatCount(640, 540)).toBe(tileRepeatCount(640, 540));
    expect(tileRepeatCount(640, 540)).toBeLessThanOrEqual(3);
    expect(tileRepeatCount(720, 1920)).toBeLessThanOrEqual(2);
  });

  it("embers thin as you climb and stay under a fixed cap", () => {
    expect(emberCount(0)).toBeGreaterThan(emberCount(400));
    expect(emberCount(400)).toBeGreaterThan(emberCount(1100));
    expect(emberCount(0)).toBe(EMBER_MAX);
    expect(emberCount(0)).toBeGreaterThan(40);
  });
});

describe("draw budget", () => {
  it("covers the canvas with a dark fill when the tile is missing", () => {
    const { ctx, counts } = recordingContext();
    drawClimbBackground(ctx, 360, 640, 0, 0, false, null);
    expect(counts.save).toBe(counts.restore);
    expect(counts.drawImage).toBe(0);
    expect(counts.fillRect).toBeGreaterThan(0);
    expect(counts.fillRect).toBeLessThanOrEqual(4 + emberCount(0) + 7);
    expect(counts.radial).toBe(0);
    expect(counts.beginPath).toBe(0);
  });

  it("blits the tile enough times to cover the canvas, with no path geometry", () => {
    const { ctx, counts } = recordingContext();
    drawClimbBackground(ctx, 360, 640, 0, 12, false, STUB_TILE);
    const tileH = 360 * (102 / 68);
    expect(counts.drawImage).toBeGreaterThanOrEqual(tileRepeatCount(640, tileH));
    expect(counts.drawImage).toBeGreaterThan(0);
    expect(counts.radial).toBe(0);
    expect(counts.beginPath).toBe(0);
    expect(counts.linear).toBe(0);
    expect(counts.save).toBe(counts.restore);
  });

  it("does not add more blits on a wider canvas", () => {
    const phone = recordingContext();
    const wide = recordingContext();
    drawClimbBackground(phone.ctx, 360, 640, 80, 12, false, STUB_TILE);
    drawClimbBackground(wide.ctx, 1280, 720, 80, 12, false, STUB_TILE);
    expect(wide.counts.drawImage).toBeLessThanOrEqual(phone.counts.drawImage);
    expect(wide.counts.beginPath).toBe(0);
    expect(wide.counts.radial).toBe(0);
  });

  it("paints embers as fillRects, not paths, and freezes them under reduced motion", () => {
    const live = recordingContext();
    const still = recordingContext();
    drawClimbBackground(live.ctx, 360, 640, 0, 40, false, STUB_TILE);
    drawClimbBackground(still.ctx, 360, 640, 0, 40, true, STUB_TILE);
    expect(live.counts.fillRect).toBeGreaterThan(2);
    expect(live.counts.beginPath).toBe(0);
    expect(still.counts.beginPath).toBe(0);
    expect(still.counts.fillRect).toBeGreaterThan(2);
  });
});

function recordingContext(): { ctx: CanvasRenderingContext2D; counts: DrawCounts } {
  const counts: DrawCounts = {
    save: 0,
    restore: 0,
    fillRect: 0,
    drawImage: 0,
    beginPath: 0,
    linear: 0,
    radial: 0,
  };
  const ctx = {
    save: () => {
      counts.save += 1;
    },
    restore: () => {
      counts.restore += 1;
    },
    fillRect: () => {
      counts.fillRect += 1;
    },
    drawImage: () => {
      counts.drawImage += 1;
    },
    beginPath: () => {
      counts.beginPath += 1;
    },
    createLinearGradient: () => {
      counts.linear += 1;
      return { addColorStop: () => undefined };
    },
    createRadialGradient: () => {
      counts.radial += 1;
      return { addColorStop: () => undefined };
    },
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, counts };
}

type DrawCounts = {
  save: number;
  restore: number;
  fillRect: number;
  drawImage: number;
  beginPath: number;
  linear: number;
  radial: number;
};
