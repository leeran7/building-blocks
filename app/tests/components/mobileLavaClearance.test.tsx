/**
 * LAVA_CLEARANCE claims to be the CSS length from the screen's bottom edge to
 * just above the highest drawn lava. The Choose avatar grid ends that far up
 * (GRID_END_PADDING), so the last row can scroll clear of the lava.
 *
 * A check that rebuilt the crest from the constants that build LAVA_CLEARANCE
 * could not tell whether they match what is drawn (V-DC-1: a fixed 18 px
 * crest ended 6-23 px inside the lava on iPad and landscape). Measuring only
 * the crest centreline missed the rim glow stroked along it (RV-DCF-2: on a
 * 13in iPad the glow reached 9.75 px above the crest and ate the 8 px gap).
 * This test measures painted geometry instead: it renders the real
 * AnimatedBackdrop, captures the options its LavaCanvas passes to drawLava
 * (canvas size, surface line, ui scale), then runs the game's real drawLava
 * over the wave's motion on a recording context and takes the topmost pixel
 * any polyline fill or stroke paints, stroke width and joins included. No
 * lava geometry is copied here.
 *
 * Out of scope, by design: arc fills (bubbles, embers) and fillRect (haze,
 * ember tails) are transient particles that leave the surface. No fixed
 * clearance can hold them, and they are not the lava's edge.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const captured = vi.hoisted(() => ({
  opts: [] as Array<Record<string, unknown>>,
  // The real renderer, kept aside by the mock so it can run on a recording context.
  realDrawLava: null as null | typeof import("../../src/components/Game/lava").drawLava,
}));

vi.mock("@app/components/Game/lava", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/lava")>();
  captured.realDrawLava = real.drawLava;
  return {
    ...real,
    drawLava: (_ctx: unknown, opts: Record<string, unknown>) => {
      captured.opts.push(opts);
    },
  };
});
// Reduced motion makes LavaCanvas paint once, synchronously, on mount. The
// crest is then sampled with motion on, from the captured geometry.
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => true }));

import { crestOffset } from "../../src/components/Game/lava";
import { AnimatedBackdrop, LAVA_CANVAS_VH, LAVA_CLEARANCE } from "../../mobile/src/components/AnimatedBackdrop";

let container: HTMLDivElement;
let root: Root;
const restores: Array<() => void> = [];

function stubProp(proto: object, key: string, get: () => unknown) {
  const prev = Object.getOwnPropertyDescriptor(proto, key);
  Object.defineProperty(proto, key, { configurable: true, get });
  restores.push(() => {
    if (prev) Object.defineProperty(proto, key, prev);
    else delete (proto as Record<string, unknown>)[key];
  });
}

beforeEach(() => {
  captured.opts = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  const ctx = { setTransform: () => {}, clearRect: () => {} };
  const prevGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  restores.push(() => {
    HTMLCanvasElement.prototype.getContext = prevGetContext;
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  while (restores.length) restores.pop()!();
});

/** The options the real LavaCanvas hands drawLava on a `width` x `viewportH` screen. */
function drawnLava(width: number, viewportH: number) {
  // The canvas is sized by CSS: LAVA_CANVAS_VH of the viewport (checked below).
  stubProp(HTMLElement.prototype, "clientWidth", () => width);
  stubProp(HTMLElement.prototype, "clientHeight", () => (viewportH * LAVA_CANVAS_VH) / 100);
  root = createRoot(container);
  act(() => root.render(createElement(AnimatedBackdrop)));
  expect(captured.opts.length).toBeGreaterThan(0);
  const o = captured.opts[captured.opts.length - 1];
  return { width: o.width as number, height: o.height as number, top: o.top as number, ui: o.ui as number };
}

type Lava = { width: number; height: number; top: number; ui: number };
type Pt = { x: number; y: number };

/** The upward unit normal of segment a->b (y grows downward), or null if degenerate. */
function upNormal(a: Pt, b: Pt): Pt | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const n = { x: dy / len, y: -dx / len };
  return n.y <= 0 ? n : { x: -n.x, y: -n.y };
}

/**
 * Topmost y a stroke of this open polyline paints. Each segment's upper edge
 * sits half the line width along its normal. Joins are taken as the higher of
 * the round-join bound (half the width straight up) and the miter tip, so the
 * answer holds for either join style.
 */
function strokeTop(pts: Pt[], lineWidth: number): number {
  const h = lineWidth / 2;
  let top = Infinity;
  const normals = pts.slice(1).map((p, i) => upNormal(pts[i], p));
  normals.forEach((n, i) => {
    if (!n) return;
    top = Math.min(top, pts[i].y + n.y * h, pts[i + 1].y + n.y * h);
  });
  for (let i = 1; i < pts.length - 1; i++) {
    const n1 = normals[i - 1];
    const n2 = normals[i];
    if (!n1 || !n2) continue;
    top = Math.min(top, pts[i].y - h);
    const dot = n1.x * n2.x + n1.y * n2.y;
    if (dot > -0.99) top = Math.min(top, pts[i].y + ((n1.y + n2.y) / (1 + dot)) * h);
  }
  return top;
}

/**
 * A 2D context that records the topmost y painted by polyline fills and
 * strokes. Arcs and fillRect (particles and haze) are ignored; every other
 * method is a no-op, and gradients accept colour stops.
 */
function recordingContext() {
  const rec = { top: Infinity, fills: 0, strokes: 0 };
  let path: Pt[] = [];
  let hasArc = false;
  const state: Record<string | symbol, unknown> = { lineWidth: 1 };
  const methods: Record<string, (...a: number[]) => unknown> = {
    beginPath: () => {
      path = [];
      hasArc = false;
    },
    moveTo: (x, y) => {
      path.push({ x, y });
    },
    lineTo: (x, y) => {
      path.push({ x, y });
    },
    arc: () => {
      hasArc = true;
    },
    fill: () => {
      if (hasArc || path.length === 0) return;
      rec.fills++;
      rec.top = Math.min(rec.top, ...path.map((p) => p.y));
    },
    stroke: () => {
      if (hasArc || path.length < 2) return;
      rec.strokes++;
      rec.top = Math.min(rec.top, strokeTop(path, state.lineWidth as number));
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (typeof k === "string" && k in methods ? methods[k] : k in t ? t[k] : () => {}),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rec };
}

/** The topmost lava pixel drawn over the wave's motion, in px above the canvas bottom (= screen bottom). */
function drawnTopAboveBottom(lava: Lava): number {
  const { ctx, rec } = recordingContext();
  const realDrawLava = captured.realDrawLava;
  if (!realDrawLava) throw new Error("the lava mock did not keep the real drawLava");
  for (let tick = 0; tick < 2000; tick++) {
    realDrawLava(ctx, { ...lava, tick, reducedMotion: false, slowed: false, hardenProgress: -1 });
  }
  expect(rec.fills).toBeGreaterThan(0);
  expect(rec.strokes).toBeGreaterThan(0);
  return lava.height - rec.top;
}

/** The crest centreline's highest point over the wave's motion, in px above the canvas bottom. */
function crestAboveBottom(lava: Lava): number {
  let minOffset = 0;
  let samples = 0;
  for (let tick = 0; tick < 2000; tick++) {
    for (let i = 0; i <= 96; i++) {
      const off = crestOffset((i / 96) * lava.width, lava.width, lava.ui, tick, false, false, -1);
      if (off < minOffset) minOffset = off;
      samples++;
    }
  }
  expect(samples).toBeGreaterThan(0);
  return lava.height - (lava.top + minOffset);
}

/** Evaluates LAVA_CLEARANCE (a calc()/max() of vh, vw, px and rem) for one screen. */
function clearancePx(width: number, viewportH: number): number {
  const js = LAVA_CLEARANCE.replace(/([\d.]+)vh/g, (_, n) => `(${n}*${viewportH / 100})`)
    .replace(/([\d.]+)vw/g, (_, n) => `(${n}*${width / 100})`)
    .replace(/([\d.]+)rem/g, (_, n) => `(${n}*16)`)
    .replace(/([\d.]+)px/g, "$1")
    .replace(/calc/g, "")
    .replace(/max/g, "Math.max");
  expect(js).toMatch(/^[\d\s.+\-*/(),]*(Math\.max[\d\s.+\-*/(),]*)*$/);
  return Function(`return ${js};`)() as number;
}

describe("LAVA_CLEARANCE clears the lava that is actually drawn", () => {
  it("precondition: the lava canvas really is LAVA_CANVAS_VH tall in the rendered CSS", () => {
    drawnLava(393, 852);
    const css = [...container.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
    const block = css.match(/\.bd-lava-canvas\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toMatch(new RegExp(`height:\\s*${LAVA_CANVAS_VH}vh`));
  });

  it("precondition: the measured top is the moving wave, not the flat surface", () => {
    const lava = drawnLava(393, 852);
    expect(drawnTopAboveBottom(lava)).toBeGreaterThan(lava.height - lava.top + 10);
  });

  it("precondition: the measured top includes the rim glow above the crest line", () => {
    // On the widest screen the rim reaches ~3 * ui px (ui ~3.3) above the
    // crest centreline. A recorder that missed strokes, or dropped their width,
    // would land on the centreline.
    const lava = drawnLava(1376, 1032);
    const rimAboveCrest = drawnTopAboveBottom(lava) - crestAboveBottom(lava);
    expect(rimAboveCrest).toBeGreaterThan(2.5 * lava.ui);
    expect(rimAboveCrest).toBeLessThan(3.5 * lava.ui);
  });

  it("precondition: the recorder measures a stroke's width, not only its path", () => {
    const { ctx, rec } = recordingContext();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, 100);
    ctx.lineTo(50, 100);
    ctx.stroke();
    expect(rec.top).toBe(95);
    // A particle (arc) is not the lava's edge.
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, 1);
    ctx.fill();
    expect(rec.top).toBe(95);
  });

  // Every device class the app ships to (TARGETED_DEVICE_FAMILY "1,2") in
  // both orientations it allows. Wider screens draw a taller crest.
  it.each([
    ["iPad Slide Over (narrowest window)", 320, 1133],
    ["iPhone SE", 375, 667],
    ["iPhone 15", 393, 852],
    ["iPhone 15 Pro Max", 430, 932],
    ["iPhone 16 Pro Max", 440, 956],
    ["iPhone SE landscape", 667, 375],
    ["iPhone 15 landscape", 852, 393],
    ["iPhone 15 Pro Max landscape", 932, 430],
    ["iPad mini portrait", 744, 1133],
    ["iPad 11in portrait", 834, 1194],
    ["iPad mini landscape", 1133, 744],
    ["iPad 11in landscape", 1194, 834],
    ["iPad Pro 13in landscape", 1376, 1032],
  ])("on %s (%dx%d) the clearance ends 8 px above the topmost drawn lava", (_device, width, viewportH) => {
    const lava = drawnLava(width, viewportH);
    const drawnTop = drawnTopAboveBottom(lava);
    const clearance = clearancePx(width, viewportH);
    expect(clearance).toBeGreaterThan(drawnTop);
    // It ends the documented 0.5rem (8 px) above the topmost drawn pixel, rim
    // glow included, give or take half a pixel: the gap must not quietly absorb
    // a crest or rim that grew, and it is slack, not a second band.
    expect(clearance - drawnTop).toBeGreaterThan(7.5);
    expect(clearance - drawnTop).toBeLessThan(8.5);
  });
});
