/**
 * LAVA_CLEARANCE claims to be the CSS length from the screen's bottom edge to
 * just above the highest lava crest. The Choose avatar grid ends that far up
 * (GRID_END_PADDING), so the last row can scroll clear of the lava.
 *
 * The avatar picker's own test checks the padding against LAVA_CREST_PX, the
 * same constant that builds LAVA_CLEARANCE, so it cannot tell whether that
 * constant matches what is drawn. This test measures the drawn crest instead:
 * it renders the real AnimatedBackdrop, captures the options its LavaCanvas
 * passes to drawLava (canvas size, surface line, ui scale), and samples the
 * game's real crestOffset over the wave's full motion. No lava geometry is
 * copied here.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const captured = vi.hoisted(() => ({ opts: [] as Array<Record<string, unknown>> }));

vi.mock("@app/components/Game/lava", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/lava")>();
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
import {
  AnimatedBackdrop,
  LAVA_CANVAS_HEIGHT,
  LAVA_CLEARANCE,
} from "../../mobile/src/components/AnimatedBackdrop";

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

/** Evaluates a calc() of px, rem and env(safe-area-inset-bottom) for one screen. */
function cssPx(length: string, insetBottom: number): number {
  const js = length
    .replace(/env\(safe-area-inset-bottom\)/g, `${insetBottom}`)
    .replace(/([\d.]+)rem/g, (_, n) => `(${n}*16)`)
    .replace(/([\d.]+)px/g, "$1")
    .replace(/calc/g, "");
  expect(js).toMatch(/^[\d\s.+\-*/()]+$/);
  return Function(`return ${js};`)() as number;
}

/** The options the real LavaCanvas hands drawLava on a `width` wide screen. */
function drawnLava(width: number, insetBottom: number) {
  // The canvas is sized by CSS: LAVA_CANVAS_HEIGHT (checked below).
  stubProp(HTMLElement.prototype, "clientWidth", () => width);
  stubProp(HTMLElement.prototype, "clientHeight", () => cssPx(LAVA_CANVAS_HEIGHT, insetBottom));
  root = createRoot(container);
  act(() => root.render(createElement(AnimatedBackdrop)));
  expect(captured.opts.length).toBeGreaterThan(0);
  const o = captured.opts[captured.opts.length - 1];
  return { width: o.width as number, height: o.height as number, top: o.top as number, ui: o.ui as number };
}

/** The crest's highest point over the wave's motion, in px above the canvas bottom (= screen bottom). */
function crestAboveBottom(lava: { width: number; height: number; top: number; ui: number }): number {
  let minOffset = 0;
  let samples = 0;
  for (let tick = 0; tick < 4000; tick++) {
    for (let i = 0; i <= 96; i++) {
      const off = crestOffset((i / 96) * lava.width, lava.width, lava.ui, tick, false, false, -1);
      if (off < minOffset) minOffset = off;
      samples++;
    }
  }
  expect(samples).toBeGreaterThan(0);
  return lava.height - (lava.top + minOffset);
}

describe("LAVA_CLEARANCE clears the lava that is actually drawn", () => {
  it("precondition: the lava canvas really is LAVA_CANVAS_HEIGHT tall in the rendered CSS", () => {
    drawnLava(393, 34);
    const css = [...container.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
    const block = css.match(/\.bd-lava-canvas\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toContain(`height: ${LAVA_CANVAS_HEIGHT};`);
  });

  it("precondition: the sampled crest is the moving wave, not the flat surface", () => {
    const lava = drawnLava(393, 34);
    expect(crestAboveBottom(lava)).toBeGreaterThan(lava.height - lava.top + 10);
  });

  it.each([
    ["iPhone SE", 375, 0],
    ["iPhone 15", 393, 34],
    ["iPhone 15 Pro Max", 430, 34],
    ["iPhone 16 Pro Max", 440, 34],
  ])("on %s (%dpx wide, %dpx home inset) the clearance ends above the highest crest", (_device, width, inset) => {
    const lava = drawnLava(width, inset);
    const crest = crestAboveBottom(lava);
    const clearance = cssPx(LAVA_CLEARANCE, inset);
    expect(clearance).toBeGreaterThan(crest);
    // The documented 0.5rem gap is slack, not a second band.
    expect(clearance - crest).toBeLessThan(16);
  });
});
