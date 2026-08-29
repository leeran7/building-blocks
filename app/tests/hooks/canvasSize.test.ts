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
  it("beats the old viewport-fraction budget on a 390x844 phone", () => {
    // Room left once a compact header and the touch control bar are accounted
    // for. The previous formula (innerHeight * 0.58 - 88) produced 226x402.
    const { width, height } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 844 - 150 - 104 - 12,
    });
    expect(width).toBeGreaterThan(226);
    expect(height).toBeGreaterThan(402);
  });

  it("fills the width when the height budget allows it", () => {
    const { width } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: PHONE_WIDTH / ASPECT + 50,
    });
    expect(width).toBe(PHONE_WIDTH);
  });

  it("degrades to a usable minimum rather than vanishing in a short viewport", () => {
    const { width } = fitCanvas({
      availableWidth: PHONE_WIDTH,
      availableHeight: 40,
    });
    expect(width).toBeGreaterThanOrEqual(240);
    expect(width).toBeLessThanOrEqual(PHONE_WIDTH);
  });
});
