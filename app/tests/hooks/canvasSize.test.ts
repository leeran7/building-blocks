/**
 * Climb canvas sizing tests.
 *
 * The play surface fills whatever box it is given so the game can occupy the
 * whole viewport. Guards the two ways that has gone wrong:
 *   - a viewport-fraction height budget shrank it below the space it actually
 *     had (~226x402 on a 390x844 phone);
 *   - a fixed size wider than its container was silently clipped, so raising
 *     it changed nothing on screen.
 */

import { describe, it, expect } from "vitest";
import { fitCanvas } from "../../src/hooks/useCanvasSize";

/** iPhone-class viewport, minus the page's horizontal padding. */
const PHONE_WIDTH = 358;

describe("fitCanvas: fills the space it is given", () => {
  it("stays within the container width, so it is never clipped", () => {
    const { width } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 4000,
    });
    expect(width).toBeLessThanOrEqual(PHONE_WIDTH);
  });

  it("caps width even when both axes have room to spare", () => {
    const { width } = fitCanvas({
      availableWidth: 2000,
      availableHeight: 4000,
      maxWidth: 560,
    });
    expect(width).toBe(560);
  });

  it("fits the height budget when height is the binding constraint", () => {
    const { height } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 500,
    });
    expect(height).toBeLessThanOrEqual(500);
  });

  it("fills a desktop viewport instead of letterboxing a portrait frame", () => {
    const { width, height } = fitCanvas({
      availableWidth: 1920,
      availableHeight: 1080,
    });
    expect(width).toBe(1920);
    expect(height).toBe(1080);
  });

  it("fills a phone viewport", () => {
    const { width, height } = fitCanvas({
      availableWidth: 390,
      availableHeight: 844,
    });
    expect(width).toBe(390);
    expect(height).toBe(844);
  });
});

describe("fitCanvas: uses the room a phone actually has", () => {
  it("beats the old viewport-fraction budget on an iPhone 13", () => {
    // 390x664 viewport, less a compact header; the touch controls overlay the
    // canvas so they reserve nothing. Measured against the previous formula
    // (innerHeight * 0.58 - 88), which rendered 167x297 on this device.
    const { width, height } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 664 - 130 - 12,
    });
    expect(width).toBeGreaterThan(167);
    expect(height).toBeGreaterThan(297);
  });

  it("fills the width of its container", () => {
    const { width } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 640,
    });
    expect(width).toBe(PHONE_WIDTH);
  });

  it.each([320, 240, 214, 213, 200, 150, 128, 40])(
    "respects a %ipx height budget rather than overflowing the parent",
    (budget) => {
      // The touch controls are overlaid on the canvas, so a canvas past the
      // fold takes them off screen with it — the bug this guards against.
      const { width, height } = fitCanvas({
        availableWidth: PHONE_WIDTH,
        availableHeight: budget,
      });
      expect(height).toBeLessThanOrEqual(budget);
      expect(width).toBeGreaterThan(0);
    }
  );

  it("never returns a canvas wider than a narrow container", () => {
    const { width } = fitCanvas({ availableWidth: 90, availableHeight: 900 });
    expect(width).toBeLessThanOrEqual(90);
  });

  it("collapses to zero rather than propagating a bad measurement", () => {
    for (const box of [
      { availableWidth: Number.NaN, availableHeight: 600 },
      { availableWidth: 358, availableHeight: Number.NaN },
      { availableWidth: 358, availableHeight: -200 },
      { availableWidth: 0, availableHeight: 600 },
    ]) {
      const { width, height } = fitCanvas(box);
      expect(Number.isFinite(width)).toBe(true);
      expect(Number.isFinite(height)).toBe(true);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(height).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not invent height when there is no room at all", () => {
    // A non-positive budget must not skip the height clamp and return a tall
    // canvas at the moment there is least space.
    const { height } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 0,
    });
    expect(height).toBe(0);
  });
});
