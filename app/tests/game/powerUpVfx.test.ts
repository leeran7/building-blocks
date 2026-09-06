import { describe, expect, it } from "vitest";
import { PICKUP_SHAKE_AMP_UI } from "../../src/design/climbFeelTokens";
import {
  PICKUP_BURST_TICKS,
  PICKUP_SCREEN_FLASH_TICKS,
  PICKUP_SHAKE_TICKS,
  drawPickupScreenFlash,
  hash01,
  pickupBannerScale,
  pickupShakeOffset,
} from "../../src/components/Game/powerUpVfx";

describe("powerUpVfx helpers", () => {
  it("hash01 is deterministic and stays in [0, 1)", () => {
    const a = hash01(3, 7, 11);
    const b = hash01(3, 7, 11);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it("pickupShakeOffset is zero when reduced motion is on", () => {
    expect(pickupShakeOffset(0, 10, 1, true)).toEqual({ dx: 0, dy: 0 });
  });

  it("pickupShakeOffset at age 0 uses PICKUP_SHAKE_AMP_UI band (AC-2)", () => {
    const ui = 1;
    const tick = 10;
    const { dx, dy } = pickupShakeOffset(0, tick, ui, false);
    const amp = PICKUP_SHAKE_AMP_UI * ui;
    expect(dx).toBeCloseTo(Math.sin(tick * 2.37) * amp, 5);
    expect(dy).toBeCloseTo(Math.cos(tick * 1.83) * amp * 0.65, 5);
    expect(PICKUP_SHAKE_AMP_UI).toBeGreaterThanOrEqual(2.7);
    expect(PICKUP_SHAKE_AMP_UI).toBeLessThanOrEqual(2.8);
  });

  it("pickupShakeOffset fades out after PICKUP_SHAKE_TICKS", () => {
    expect(pickupShakeOffset(PICKUP_SHAKE_TICKS, 10, 1, false)).toEqual({
      dx: 0,
      dy: 0,
    });
    const mid = pickupShakeOffset(2, 10, 1, false);
    expect(Math.abs(mid.dx) + Math.abs(mid.dy)).toBeGreaterThan(0);
  });

  it("pickupBannerScale pops then settles when motion is allowed", () => {
    expect(pickupBannerScale(0, false)).toBeGreaterThan(1);
    expect(pickupBannerScale(0.5, false)).toBe(1);
    expect(pickupBannerScale(0, true)).toBe(1);
  });

  it("exports burst and flash tick budgets used by the canvas", () => {
    expect(PICKUP_BURST_TICKS).toBeGreaterThan(12);
    expect(PICKUP_SCREEN_FLASH_TICKS).toBeGreaterThan(0);
  });

  it("paints the pickup flash as a flat fill, not a full-canvas radial gradient", () => {
    let radial = 0;
    let fills = 0;
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      fillRect: () => {
        fills += 1;
      },
      createRadialGradient: () => {
        radial += 1;
        return { addColorStop: () => undefined };
      },
      fillStyle: "",
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    drawPickupScreenFlash(ctx, 360, 640, 0, "#ff5a2c", false);
    expect(radial).toBe(0);
    expect(fills).toBe(1);
    fills = 0;
    drawPickupScreenFlash(ctx, 360, 640, 0, "#ff5a2c", true);
    expect(fills).toBe(0);
  });
});
