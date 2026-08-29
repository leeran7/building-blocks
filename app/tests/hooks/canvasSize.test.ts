/**
 * Climb canvas sizing tests.
 *
 * Guards the two ways the mobile canvas has gone wrong:
 *   - a viewport-fraction height budget shrank it below the 360x640 baseline
 *     (~226x402 on a 390x844 phone);
 *   - a fixed size wider than its container was silently clipped, so raising it
 *     changed nothing on screen.
 */

import { describe, it, expect } from "vitest";
import { fitCanvas } from "../../src/hooks/useCanvasSize";

const ASPECT = 360 / 640;
/** iPhone-class viewport, minus the page's horizontal padding. */
const PHONE_WIDTH = 358;

describe("fitCanvas: never exceeds the space it is given", () => {
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
});

describe("fitCanvas: keeps the play area consistent between devices", () => {
  it("holds the 9:16 ratio, so no device sees further up the tower", () => {
    const boxes = [
      { availableWidth: 358, availableHeight: 600 },
      { availableWidth: 560, availableHeight: 900 },
      { availableWidth: 320, availableHeight: 480 },
    ];
    for (const box of boxes) {
      const { width, height } = fitCanvas(box);
      expect(width / height).toBeCloseTo(ASPECT, 2);
    }
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

  it("fills the width when the height budget allows it", () => {
    const { width } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: PHONE_WIDTH / ASPECT + 50,
    });
    expect(width).toBe(PHONE_WIDTH);
  });

  // MIN_WIDTH is 120, so the floor starts competing with the height budget
  // below 120 / ASPECT = 213.3px. Cases sit either side of that crossover.
  it.each([320, 240, 214, 213, 200, 150, 128, 40])(
    "respects a %ipx height budget rather than letting the floor win",
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
    }
  });

  it("does not hand out the largest canvas when there is no room at all", () => {
    // A non-positive budget used to skip the height clamp entirely, returning
    // the widest possible canvas at the moment there was least space.
    const { width } = fitCanvas({ availableWidth: PHONE_WIDTH, availableHeight: 0 });
    expect(width).toBeLessThan(PHONE_WIDTH);
  });
});
