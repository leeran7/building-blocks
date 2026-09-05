/**
 * Rising hazard (lava): a molten body driven only by tick + a seeded hash.
 *
 * The renderer is pure rendering, but the two things it MUST get right are
 * determinism (same tick → same surface, so it can't desync the sim) and the
 * reduced-motion / slowed contracts. This suite exercises the exported pure
 * helper directly, then invokes drawLava against a recording context to assert
 * the cheap contract: save/restore balance, composite always reset, and vertex
 * work that does not scale with canvas width.
 */

import { describe, expect, it } from "vitest";
import { crestOffset, drawLava, hash } from "../../src/components/Game/lava";

describe("crest surface", () => {
  it("is deterministic for a given tick", () => {
    const a = crestOffset(120, 360, 1, 42, false, false);
    const b = crestOffset(120, 360, 1, 42, false, false);
    expect(a).toBe(b);
  });

  it("moves as the tick advances", () => {
    const t0 = crestOffset(120, 360, 1, 0, false, false);
    const t1 = crestOffset(120, 360, 1, 30, false, false);
    expect(t0).not.toBe(t1);
  });

  it("is flat under reduced motion", () => {
    for (let x = 0; x <= 360; x += 45) {
      expect(crestOffset(x, 360, 1, 99, true, false)).toBe(0);
    }
  });

  it("never dips below the true hazard line", () => {
    // Offset is downward-positive and must stay <= 0 so the body always covers
    // every lethal point; a positive value would leave a gap under the climber.
    for (let t = 0; t < 200; t += 7) {
      for (let x = 0; x <= 360; x += 20) {
        expect(crestOffset(x, 360, 1, t, false, false)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it("calms (smaller amplitude) when slowed", () => {
    // Offsets are <= 0, so a calmer surface reaches a less-negative minimum.
    let normalMin = 0;
    let slowedMin = 0;
    for (let t = 0; t < 200; t += 3) {
      for (let x = 0; x <= 360; x += 20) {
        normalMin = Math.min(normalMin, crestOffset(x, 360, 1, t, false, false));
        slowedMin = Math.min(slowedMin, crestOffset(x, 360, 1, t, false, true));
      }
    }
    expect(slowedMin).toBeGreaterThan(normalMin);
  });

  it("hash is stable and in [0,1)", () => {
    expect(hash(3, 7)).toBe(hash(3, 7));
    for (let i = 0; i < 50; i++) {
      const v = hash(i, 13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("draw budget", () => {
  const opts = (over: Partial<Parameters<typeof drawLava>[1]> = {}) => ({
    width: 360,
    height: 640,
    top: 400,
    ui: 1,
    tick: 30,
    reducedMotion: false,
    slowed: false,
    ...over,
  });

  it("balances save/restore and always resets composite + dash", () => {
    const { ctx, counts } = recordingContext();
    drawLava(ctx, opts());
    expect(counts.save).toBe(counts.restore);
    expect(counts.save).toBe(1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
    expect(counts.lastDashLen).toBe(0);
  });

  it("does not add vertex work on a wider canvas", () => {
    const phone = recordingContext();
    const wide = recordingContext();
    drawLava(phone.ctx, opts({ width: 360 }));
    drawLava(wide.ctx, opts({ width: 1280, height: 720 }));
    // Exact equality: a wider canvas must issue the SAME vertex work, not merely
    // "no more" — `toBe` would catch a regression that quietly drops detail.
    expect(wide.counts.lineTo).toBe(phone.counts.lineTo);
    expect(wide.counts.arc).toBe(phone.counts.arc);
  });

  it("drops haze / bubbles / embers under reduced motion", () => {
    const live = recordingContext();
    const still = recordingContext();
    drawLava(live.ctx, opts());
    drawLava(still.ctx, opts({ reducedMotion: true }));
    // Bubbles + embers are arc() calls; reduced motion returns before them.
    expect(still.counts.arc).toBe(0);
    expect(live.counts.arc).toBeGreaterThan(0);
    expect(still.counts.save).toBe(still.counts.restore);
  });

  it("uses a dashed crest only when slowed", () => {
    const normal = recordingContext();
    const slowed = recordingContext();
    drawLava(normal.ctx, opts());
    drawLava(slowed.ctx, opts({ slowed: true }));
    expect(normal.counts.maxDashLen).toBe(0);
    expect(slowed.counts.maxDashLen).toBeGreaterThan(0);
    // ...but the dash is always cleared before the call returns.
    expect(slowed.counts.lastDashLen).toBe(0);
  });
});

function recordingContext(): { ctx: CanvasRenderingContext2D; counts: DrawCounts } {
  const counts: DrawCounts = {
    save: 0,
    restore: 0,
    lineTo: 0,
    arc: 0,
    linear: 0,
    radial: 0,
    maxDashLen: 0,
    lastDashLen: 0,
  };
  const ctx = {
    save: () => {
      counts.save += 1;
    },
    restore: () => {
      counts.restore += 1;
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => {
      counts.lineTo += 1;
    },
    arc: () => {
      counts.arc += 1;
    },
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    setLineDash: (d: number[]) => {
      counts.lastDashLen = d.length;
      counts.maxDashLen = Math.max(counts.maxDashLen, d.length);
    },
    createLinearGradient: () => {
      counts.linear += 1;
      return { addColorStop: () => undefined };
    },
    createRadialGradient: () => {
      counts.radial += 1;
      return { addColorStop: () => undefined };
    },
    fillStyle: "" as string | CanvasGradient,
    strokeStyle: "" as string | CanvasGradient,
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, counts };
}

type DrawCounts = {
  save: number;
  restore: number;
  lineTo: number;
  arc: number;
  linear: number;
  radial: number;
  maxDashLen: number;
  lastDashLen: number;
};
