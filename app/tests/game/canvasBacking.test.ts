/**
 * Canvas backing-store decisions.
 *
 * Assigning canvas.width reallocates the bitmap even when the number is
 * unchanged. Combined with an effect that depends on per-tick `state`, that
 * used to throw away a multi-megabyte buffer 60 times a second. devicePixelRatio
 * was also used raw, so a 3× phone paid 2.25× the memory of a 2× one for
 * vector art that does not get sharper past 2×.
 */

import { describe, it, expect } from "vitest";
import {
  backingStoreSize,
  canvasNeedsResize,
  clampDevicePixelRatio,
} from "../../src/components/Game/canvasBacking";

describe("clampDevicePixelRatio", () => {
  it("caps at 2 so a 3× phone does not get a 2.25× buffer", () => {
    expect(clampDevicePixelRatio(3)).toBe(2);
    expect(clampDevicePixelRatio(2)).toBe(2);
    expect(clampDevicePixelRatio(1)).toBe(1);
  });

  it("treats missing or nonsense ratios as 1", () => {
    expect(clampDevicePixelRatio(0)).toBe(1);
    expect(clampDevicePixelRatio(-1)).toBe(1);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
  });
});

describe("backingStoreSize", () => {
  it("does not grow past 2× even when the device reports 3", () => {
    const at2 = backingStoreSize(360, 640, 2);
    const at3 = backingStoreSize(360, 640, 3);
    expect(at3).toEqual(at2);
    expect(at3).toEqual({ width: 720, height: 1280 });
  });

  it("would have been 1080×1920 at unclamped 3× — that path is gone", () => {
    const unclamped = { width: Math.round(360 * 3), height: Math.round(640 * 3) };
    expect(backingStoreSize(360, 640, 3)).not.toEqual(unclamped);
  });
});

describe("canvasNeedsResize", () => {
  it("is false when the backing size has not changed, so a tick must not reallocate", () => {
    expect(canvasNeedsResize(720, 1280, 720, 1280)).toBe(false);
  });

  it("is true when either axis actually changes", () => {
    expect(canvasNeedsResize(720, 1280, 721, 1280)).toBe(true);
    expect(canvasNeedsResize(720, 1280, 720, 1281)).toBe(true);
  });
});
