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
import {
  crestOffset,
  drawLava,
  drawLavaProximityGlow,
  hash,
  isLavaInProximity,
  LAVA_PROXIMITY_M,
  phaseLook,
  proximityAlpha,
  SURGE_TELEGRAPH_FRAC,
} from "../../src/components/Game/lava";
import type { HazardPhaseName } from "../../src/game/hazard";

const PHASES: HazardPhaseName[] = ["grace", "surge", "stumble"];
/** Mid-stumble: past the settle-in, before the telegraph. */
const PLAIN_STUMBLE = 0.5;

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
    hardenProgress: -1,
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

describe("proximityAlpha: off-screen lava glows at the bottom edge", () => {
  it("is 0 when the lava is on screen (gap <= 0)", () => {
    for (const gap of [0, -0.01, -30, Number.NEGATIVE_INFINITY]) {
      expect(proximityAlpha(gap, false, 17)).toBe(0);
      expect(proximityAlpha(gap, true, 17)).toBe(0);
    }
  });

  it("is 0 at and beyond LAVA_PROXIMITY_M, and for a non-number", () => {
    expect(LAVA_PROXIMITY_M).toBe(60);
    for (const gap of [LAVA_PROXIMITY_M, LAVA_PROXIMITY_M + 0.01, 500, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(proximityAlpha(gap, false, 5)).toBe(0);
    }
  });

  it("is positive everywhere inside the band, for every tick", () => {
    let checked = 0;
    for (let tick = 0; tick < 120; tick += 7) {
      for (let gap = 0.5; gap < LAVA_PROXIMITY_M; gap += 2.5) {
        expect(proximityAlpha(gap, false, tick)).toBeGreaterThan(0);
        expect(proximityAlpha(gap, false, tick)).toBeLessThanOrEqual(0.35);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("is monotone: closer lava glows brighter (at a fixed tick)", () => {
    for (const tick of [0, 13, 40]) {
      let prev = Infinity;
      for (let gap = 1; gap < LAVA_PROXIMITY_M; gap += 1) {
        const a = proximityAlpha(gap, false, tick);
        expect(a).toBeLessThan(prev);
        prev = a;
      }
    }
  });

  it("matches 0.35·(1 − d/60) under reduced motion, with no tick pulse", () => {
    expect(proximityAlpha(30, true, 0)).toBeCloseTo(0.175, 9);
    expect(proximityAlpha(30, true, 0)).toBe(proximityAlpha(30, true, 999));
    // ...while the animated glow does pulse with the tick.
    expect(proximityAlpha(30, false, 0)).not.toBe(proximityAlpha(30, false, 13));
  });

  it("band membership agrees with the alpha", () => {
    expect(isLavaInProximity(10)).toBe(true);
    expect(isLavaInProximity(0)).toBe(false);
    expect(isLavaInProximity(LAVA_PROXIMITY_M)).toBe(false);
  });
});

describe("drawLavaProximityGlow: draw budget", () => {
  const glow = (over: Partial<Parameters<typeof drawLavaProximityGlow>[1]> = {}) => ({
    width: 360,
    height: 640,
    ui: 1,
    tick: 12,
    reducedMotion: false,
    gapBelowViewM: 20,
    bottomInset: 0,
    ...over,
  });

  it("balances save/restore and resets composite", () => {
    const { ctx, counts } = recordingContext();
    ctx.globalCompositeOperation = "lighter";
    drawLavaProximityGlow(ctx, glow());
    expect(counts.save).toBe(1);
    expect(counts.restore).toBe(1);
    expect(counts.fillRect).toBe(1);
    expect(counts.fillRects[0]!.alpha).toBeGreaterThan(0);
    expect(counts.fillRects[0]!.composite).toBe("source-over");
  });

  it("sits above the touch overlay (bottomInset), never under it", () => {
    const { ctx, counts } = recordingContext();
    drawLavaProximityGlow(ctx, glow({ bottomInset: 80 }));
    const r = counts.fillRects[0]!;
    expect(r.y + r.h).toBeCloseTo(640 - 80, 9);
    expect(r.w).toBe(360);
  });

  it("draws nothing when the lava is on screen or far below", () => {
    for (const gapBelowViewM of [-5, 0, LAVA_PROXIMITY_M, 200]) {
      const { ctx, counts } = recordingContext();
      drawLavaProximityGlow(ctx, glow({ gapBelowViewM }));
      expect(counts.save).toBe(0);
      expect(counts.fillRect).toBe(0);
    }
  });

  it("caches its gradient across frames on the same context", () => {
    const { ctx, counts } = recordingContext();
    drawLavaProximityGlow(ctx, glow({ tick: 1 }));
    drawLavaProximityGlow(ctx, glow({ tick: 2, gapBelowViewM: 30 }));
    expect(counts.linear).toBe(1);
  });
});

describe("phaseLook: surge and stumble look different", () => {
  it("surge rolls higher than stumble", () => {
    const surge = phaseLook("surge", 0.5, false);
    const stumble = phaseLook("stumble", PLAIN_STUMBLE, false);
    expect(surge.crestAmp).toBe(12);
    expect(stumble.crestAmp).toBe(5);
    expect(surge.crestAmp).toBeGreaterThan(stumble.crestAmp);
    expect(surge.rimAlpha).toBeGreaterThan(stumble.rimAlpha);
    expect(surge.emberCount).toBeGreaterThan(stumble.emberCount);
    expect(surge.bubbleCount).toBeGreaterThan(stumble.bubbleCount);
    expect(surge.hazeGain).toBeGreaterThan(stumble.hazeGain);
    expect(stumble.rimColor).not.toBe(surge.rimColor);
  });

  it("telegraphs the surge: the last 20% of a stumble rises above plain stumble, never above surge", () => {
    const plain = phaseLook("stumble", PLAIN_STUMBLE, false);
    const surge = phaseLook("surge", 0, false);
    let checked = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      for (const p of [0.85, 0.9, 0.95, 0.999]) {
        const t = phaseLook("stumble", p, false, tick);
        expect(t.telegraph).toBeGreaterThan(0);
        expect(t.crestAmp).toBeGreaterThan(plain.crestAmp);
        expect(t.crestAmp).toBeLessThanOrEqual(surge.crestAmp);
        expect(t.rimAlpha).toBeGreaterThan(plain.rimAlpha);
        expect(t.rimAlpha).toBeLessThanOrEqual(surge.rimAlpha);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // Outside the window there is no telegraph.
    expect(phaseLook("stumble", 1 - SURGE_TELEGRAPH_FRAC - 0.01, false).telegraph).toBe(0);
  });

  it("the telegraph pulses with the tick", () => {
    const amps = new Set<number>();
    for (let tick = 0; tick < 30; tick += 1) amps.add(phaseLook("stumble", 0.95, false, tick).crestAmp);
    expect(amps.size).toBeGreaterThan(1);
  });

  it("settles into a stumble instead of snapping from the surge amplitude", () => {
    const surge = phaseLook("surge", 0.999, false).crestAmp;
    const entering = phaseLook("stumble", 0, false).crestAmp;
    const plain = phaseLook("stumble", PLAIN_STUMBLE, false).crestAmp;
    expect(entering).toBeCloseTo(surge, 6);
    expect(phaseLook("stumble", 0.05, false).crestAmp).toBeGreaterThan(plain);
    expect(phaseLook("stumble", 0.05, false).crestAmp).toBeLessThan(surge);
  });

  it("reduced motion: 0 amplitude for every phase, no pulse, but alpha still differs", () => {
    for (const phase of PHASES) {
      for (const p of [0, 0.5, 0.9]) {
        expect(phaseLook(phase, p, true, 7).crestAmp).toBe(0);
        expect(phaseLook(phase, p, true, 7)).toEqual(phaseLook(phase, p, true, 8));
      }
    }
    const surge = phaseLook("surge", 0.5, true);
    const stumble = phaseLook("stumble", PLAIN_STUMBLE, true);
    expect(surge.rimAlpha).not.toBe(stumble.rimAlpha);
    expect(surge.rimColor).not.toBe(stumble.rimColor);
  });

  it("grace and no phase keep the neutral look", () => {
    expect(phaseLook(undefined, 0, false)).toEqual(phaseLook("grace", 0.5, false));
    expect(phaseLook(undefined, 0, false).crestAmp).toBe(9);
  });

  it("crestOffset stays <= 0 for every phase, progress, x and tick", () => {
    let checked = 0;
    for (const phase of PHASES) {
      for (let p = 0; p <= 1; p += 0.05) {
        for (let tick = 0; tick < 120; tick += 11) {
          const amp = phaseLook(phase, p, false, tick).crestAmp;
          for (let x = 0; x <= 360; x += 24) {
            expect(crestOffset(x, 360, 1.4, tick, false, false, undefined, amp)).toBeLessThanOrEqual(1e-9);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("crestOffset clamps a hostile amplitude instead of dipping below the line", () => {
    for (const amp of [-12, Number.NaN, Number.NEGATIVE_INFINITY]) {
      for (let x = 0; x <= 360; x += 30) {
        expect(crestOffset(x, 360, 1, 21, false, false, undefined, amp)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it("a surge crest reaches higher than a stumble crest", () => {
    const surge = phaseLook("surge", 0.5, false).crestAmp;
    const stumble = phaseLook("stumble", PLAIN_STUMBLE, false).crestAmp;
    let surgeMin = 0;
    let stumbleMin = 0;
    for (let t = 0; t < 200; t += 3) {
      for (let x = 0; x <= 360; x += 20) {
        surgeMin = Math.min(surgeMin, crestOffset(x, 360, 1, t, false, false, undefined, surge));
        stumbleMin = Math.min(stumbleMin, crestOffset(x, 360, 1, t, false, false, undefined, stumble));
      }
    }
    expect(surgeMin).toBeLessThan(stumbleMin);
  });
});

describe("drawLava: phase drives the drawn body", () => {
  const base = {
    width: 360,
    height: 640,
    top: 400,
    ui: 1,
    tick: 30,
    reducedMotion: false,
    slowed: false,
    hardenProgress: -1,
  };

  it("draws more embers and bubbles in a surge than in a stumble, balanced save/restore", () => {
    const surge = recordingContext();
    const stumble = recordingContext();
    drawLava(surge.ctx, { ...base, phase: "surge", phaseProgress: 0.5 });
    drawLava(stumble.ctx, { ...base, phase: "stumble", phaseProgress: PLAIN_STUMBLE });
    expect(surge.counts.arc).toBeGreaterThan(stumble.counts.arc);
    for (const r of [surge, stumble]) {
      expect(r.counts.save).toBe(r.counts.restore);
      expect(r.ctx.globalCompositeOperation).toBe("source-over");
      expect(r.counts.lastDashLen).toBe(0);
    }
  });

  it("slow-lava keeps its calm look whatever the phase", () => {
    const a = recordingContext();
    const b = recordingContext();
    drawLava(a.ctx, { ...base, slowed: true, phase: "surge", phaseProgress: 0.5 });
    drawLava(b.ctx, { ...base, slowed: true, phase: "stumble", phaseProgress: PLAIN_STUMBLE });
    expect(a.counts.arc).toBe(b.counts.arc);
    expect(a.counts.strokeAlphas).toEqual(b.counts.strokeAlphas);
  });

  it("harden-lava takes precedence over the phase look", () => {
    const a = recordingContext();
    const b = recordingContext();
    drawLava(a.ctx, { ...base, slowed: true, hardenProgress: 0.5, phase: "surge", phaseProgress: 0.5 });
    drawLava(b.ctx, { ...base, slowed: true, hardenProgress: 0.5, phase: "stumble", phaseProgress: PLAIN_STUMBLE });
    expect(a.counts.arc).toBe(b.counts.arc);
    expect(a.counts.strokeAlphas).toEqual(b.counts.strokeAlphas);
  });

  it("the rim is brighter in a surge than a stumble", () => {
    const surge = recordingContext();
    const stumble = recordingContext();
    drawLava(surge.ctx, { ...base, phase: "surge", phaseProgress: 0.5 });
    drawLava(stumble.ctx, { ...base, phase: "stumble", phaseProgress: PLAIN_STUMBLE });
    // First stroke is the wide rim glow.
    expect(surge.counts.strokeAlphas[0]).toBeGreaterThan(stumble.counts.strokeAlphas[0]!);
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
    fillRect: 0,
    fillRects: [],
    strokeAlphas: [],
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
    ellipse: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    fill: () => undefined,
    stroke: () => {
      counts.strokeAlphas.push(ctx.globalAlpha);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      counts.fillRect += 1;
      counts.fillRects.push({ x, y, w, h, alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation });
    },
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
  fillRect: number;
  fillRects: Array<{ x: number; y: number; w: number; h: number; alpha: number; composite: string }>;
  /** globalAlpha at each stroke() call, in order. */
  strokeAlphas: number[];
};
