/**
 * Animated landing ("the page is the climb"): the motion model and the
 * server-rendered markup of its client islands. Invokes the real units and
 * renders the real components; no source-text greps.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { motionValue } from "motion/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import {
  CLIMB_FRAMES,
  CLIMB_M,
  FLOOR_M,
  LAVA_CREEP_PER_S,
  LAVA_GAP_MAX,
  LAVA_GAP_MIN,
  climbFrame,
  climbMetres,
  countUpValue,
  floorAt,
  marqueeFactor,
  marqueeSkew,
  stepLavaGap,
  towerFloors,
} from "../../src/components/LandingPage/motion/landingMotion";
import { TowerScene } from "../../src/components/LandingPage/motion/TowerScene";
import { LavaLink, isModifiedClick } from "../../src/components/LandingPage/motion/LavaLink";
import { ScrollWords, wordWindow } from "../../src/components/LandingPage/motion/ScrollWords";
import { CountUp } from "../../src/components/LandingPage/motion/CountUp";
import { chaseGlowVh } from "../../src/components/LandingPage/motion/LavaChase";
import { STATEMENT } from "../../src/components/LandingPage/Statement";
import { Hero, HEADLINE_TEXT } from "../../src/components/LandingPage/Hero";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

describe("lava chase (stepLavaGap)", () => {
  it("creeps up while you stand still and is pulled back while you scroll", () => {
    const still = stepLavaGap(0.2, 0.05, 0, false);
    expect(still).toBeCloseTo(0.2 - LAVA_CREEP_PER_S * 0.05, 6);
    const scrolling = stepLavaGap(0.2, 0.05, 1200, false);
    expect(scrolling).toBeGreaterThan(0.2);
    // Scrolling up counts as climbing too: speed is unsigned.
    expect(stepLavaGap(0.2, 0.05, -1200, false)).toBeCloseTo(scrolling, 9);
  });

  it("stays inside its bounds for any input", () => {
    expect(stepLavaGap(LAVA_GAP_MIN, 0.1, 0, false)).toBe(LAVA_GAP_MIN);
    expect(stepLavaGap(LAVA_GAP_MAX, 0.1, 1e9, false)).toBe(LAVA_GAP_MAX);
    expect(stepLavaGap(0.2, -5, 0, false)).toBe(0.2);
  });

  it("caps one frame's step, so a backgrounded tab does not drown you at once", () => {
    const afterLongPause = stepLavaGap(0.2, 30, 0, false);
    expect(afterLongPause).toBeGreaterThan(0.19);
  });

  it("falls back to the maximum at the summit", () => {
    expect(stepLavaGap(LAVA_GAP_MIN, 0.016, 0, true)).toBe(LAVA_GAP_MAX);
  });

  it("closes from the start gap in a few seconds of standing still", () => {
    let gap = 0.24;
    let frames = 0;
    while (gap > LAVA_GAP_MIN && frames < 10_000) {
      gap = stepLavaGap(gap, 1 / 60, 0, false);
      frames++;
    }
    expect(frames / 60).toBeGreaterThan(4);
    expect(frames / 60).toBeLessThan(12);
  });
});

describe("climb scrub", () => {
  it("maps scroll progress onto the whole climb, clamped", () => {
    expect(climbMetres(-1)).toBe(0);
    expect(climbMetres(0.5)).toBe(CLIMB_M / 2);
    expect(climbMetres(2)).toBe(CLIMB_M);
  });

  it("plays every climb-strip frame, distance-driven like the game", () => {
    const seen = new Map<number, number>();
    for (let m = 0; m <= CLIMB_M; m += 0.1) {
      const f = climbFrame(m);
      seen.set(f, (seen.get(f) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...Array(CLIMB_FRAMES).keys()]);
    for (const count of seen.values()) expect(count).toBeGreaterThan(0);
    expect(climbFrame(-3)).toBe(0);
  });

  it("tops out on the summit floor", () => {
    expect(floorAt(0)).toBe(1);
    expect(floorAt(CLIMB_M)).toBe(towerFloors());
    expect(towerFloors()).toBe(CLIMB_M / FLOOR_M + 1);
  });
});

describe("velocity marquee", () => {
  it("drifts at base speed when still, races and reverses with the scroll", () => {
    expect(marqueeFactor(0)).toBe(1);
    expect(marqueeFactor(2000)).toBeGreaterThan(3);
    expect(marqueeFactor(-2000)).toBeLessThan(-3);
    expect(Math.abs(marqueeFactor(1e7))).toBeLessThanOrEqual(7);
  });

  it("skews with speed but never past legibility", () => {
    expect(marqueeSkew(0)).toBe(0);
    expect(marqueeSkew(1e6)).toBe(9);
    expect(marqueeSkew(-1e6)).toBe(-9);
  });
});

describe("count-up and lit words", () => {
  it("counts from 0 to the target, never past it", () => {
    expect(countUpValue(8412, 0)).toBe(0);
    expect(countUpValue(8412, 1)).toBe(8412);
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = countUpValue(8412, t);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(8412);
      prev = v;
    }
  });

  it("server-renders the final number, so no-JS readers see the real value", () => {
    expect(text(renderToStaticMarkup(createElement(CountUp, { value: 8411.6 })))).toBe("8412");
  });

  it("lights every word inside the scroll window, the last one by the end", () => {
    const n = STATEMENT.length;
    for (let i = 0; i < n; i++) {
      const [a, b] = wordWindow(i, n);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThan(a);
    }
    expect(wordWindow(n - 1, n)[1]).toBe(1);
  });

  it("renders the statement as real text", () => {
    const html = renderToStaticMarkup(createElement(ScrollWords, { words: STATEMENT }));
    expect(text(html)).toBe(STATEMENT.map((w) => w.text).join(" "));
  });

  it("grows the chasing glow as the gap closes", () => {
    expect(chaseGlowVh(LAVA_GAP_MIN)).toBeGreaterThan(chaseGlowVh(LAVA_GAP_MAX));
  });
});

describe("lava flood links", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

  it("floods only on a plain primary click; new-tab clicks stay with the browser", () => {
    expect(isModifiedClick(click)).toBe(false);
    expect(isModifiedClick({ ...click, metaKey: true })).toBe(true);
    expect(isModifiedClick({ ...click, ctrlKey: true })).toBe(true);
    expect(isModifiedClick({ ...click, shiftKey: true })).toBe(true);
    expect(isModifiedClick({ ...click, altKey: true })).toBe(true);
    expect(isModifiedClick({ ...click, button: 1 })).toBe(true);
  });

  it("is still a real link", () => {
    const html = renderToStaticMarkup(createElement(LavaLink, { href: "/play", className: "x" }, "Play"));
    expect(html).toMatch(/^<a [^>]*href="\/play"/);
    expect(text(html)).toBe("Play");
  });
});

describe("hero tower scene", () => {
  it("is decorative and only loads climber sheets that ship", () => {
    const html = renderToStaticMarkup(createElement(TowerScene, { progress: motionValue(0) }));
    expect(html).toMatch(/^<div aria-hidden="true"/);
    const sheets = [...html.matchAll(/url\(\/climb\/([^)]+)\)/g)].map((m) => m[1]);
    expect(sheets.length).toBeGreaterThan(0);
    for (const file of sheets) {
      expect(existsSync(resolve(__dirname, "../../public/climb", file)), file).toBe(true);
    }
  });

  it("keeps the headline's words for assistive tech while its letters are split", () => {
    const html = renderToStaticMarkup(createElement(Hero, { stats: { climberCount: 3, topPeak: 420 } }));
    expect(HEADLINE_TEXT).toBe("CLIMB. OR GET BURIED.");
    expect(html).toContain(`aria-label="${HEADLINE_TEXT}"`);
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>") + 5);
    expect(text(h1)).toBe("CLIMB.OR GETBURIED.");
  });
});
