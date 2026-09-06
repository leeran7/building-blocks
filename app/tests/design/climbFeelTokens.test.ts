/**
 * Climb Feel 1.2× — presentation token contracts (AC-1/2/17/18).
 * Assert by importing exports — never by grepping CSS/source text.
 */

import { describe, expect, it } from "vitest";
import {
  CLIMB_ENTER_DURATION_S,
  CLIMB_ENTER_TRANSLATE_Y_PX,
  CLIMB_GRAIN_OPACITY,
  CLIMB_GROUND_RISE_AMP_PERCENT,
  CLIMB_GROUND_RISE_DURATION_S,
  CLIMB_PANEL_INTRO_TITLE_CLASS,
  CLIMB_PUNCH_DURATION_S,
  CLIMB_PUNCH_TRANSLATE_Y_PX,
  CLIMB_TOPO_SIGNAL_ALPHA,
  EMBER_MAX,
  FREE_CLIMB_RANK_CLASS,
  FREE_LEADERBOARD_HEADING_CLASS,
  HUD_ALTITUDE_FONT_UI,
  PICKUP_SHAKE_AMP_UI,
  POWER_UP_ENTER_DURATION_S,
  POWER_UP_ENTER_SCALE_FROM,
  POWER_UP_ENTER_SCALE_PEAK,
  POWER_UP_URGENT_DURATION_S,
  POWER_UP_URGENT_SCALE_PEAK,
} from "../../src/design/climbFeelTokens";
import {
  HUD_ALTITUDE_FONT_UI as CANVAS_HUD_FONT,
  TEXT_MUTED,
  TEXT_SECONDARY,
} from "../../src/components/Game/ClimbCanvas";
import { EMBER_MAX as BG_EMBER_MAX } from "../../src/components/Game/climbBackground";
import { PICKUP_SHAKE_AMP_UI as VFX_SHAKE } from "../../src/components/Game/powerUpVfx";

describe("climbFeelTokens — HUD / VFX (AC-1, AC-2, NFR-6)", () => {
  it("HUD altitude font is in the 15–16 UI band", () => {
    expect(HUD_ALTITUDE_FONT_UI).toBeGreaterThanOrEqual(15);
    expect(HUD_ALTITUDE_FONT_UI).toBeLessThanOrEqual(16);
    expect(CANVAS_HUD_FONT).toBe(HUD_ALTITUDE_FONT_UI);
  });

  it("lava HUD uses TEXT_SECONDARY, not TEXT_MUTED", () => {
    expect(TEXT_SECONDARY).toBe("#a8a4b2");
    expect(TEXT_MUTED).toBe("#74707e");
    expect(TEXT_SECONDARY).not.toBe(TEXT_MUTED);
  });

  it("pickup shake amp is in the 2.53–2.75 band and wired into VFX", () => {
    expect(PICKUP_SHAKE_AMP_UI).toBeGreaterThanOrEqual(2.53);
    expect(PICKUP_SHAKE_AMP_UI).toBeLessThanOrEqual(2.75);
    expect(VFX_SHAKE).toBe(PICKUP_SHAKE_AMP_UI);
  });

  it("ember max is ≤ +20% of baseline 88", () => {
    expect(EMBER_MAX).toBeLessThanOrEqual(105);
    expect(EMBER_MAX).toBeGreaterThanOrEqual(88);
    expect(BG_EMBER_MAX).toBe(EMBER_MAX);
  });
});

describe("climbFeelTokens — motion forks (AC-17, NFR-3)", () => {
  it("climbEnter travel/duration land in the intensity band with ≥200ms floor", () => {
    expect(CLIMB_ENTER_TRANSLATE_Y_PX).toBeGreaterThanOrEqual(18);
    expect(CLIMB_ENTER_TRANSLATE_Y_PX).toBeLessThanOrEqual(20);
    expect(CLIMB_ENTER_DURATION_S).toBeGreaterThanOrEqual(0.56);
    expect(CLIMB_ENTER_DURATION_S).toBeLessThanOrEqual(0.61);
    expect(CLIMB_ENTER_DURATION_S).toBeGreaterThanOrEqual(0.2);
  });

  it("climbPunch travel/duration land in the intensity band", () => {
    expect(CLIMB_PUNCH_TRANSLATE_Y_PX).toBeGreaterThanOrEqual(7);
    expect(CLIMB_PUNCH_TRANSLATE_Y_PX).toBeLessThanOrEqual(7.5);
    expect(CLIMB_PUNCH_DURATION_S).toBeGreaterThanOrEqual(0.64);
    expect(CLIMB_PUNCH_DURATION_S).toBeLessThanOrEqual(0.7);
    expect(CLIMB_PUNCH_DURATION_S).toBeGreaterThanOrEqual(0.2);
  });

  it("climbGroundRise period shortens ≤20% and stays ≥4s", () => {
    expect(CLIMB_GROUND_RISE_DURATION_S).toBeLessThanOrEqual(6 * 0.87);
    expect(CLIMB_GROUND_RISE_DURATION_S).toBeGreaterThanOrEqual(4);
    expect(CLIMB_GROUND_RISE_AMP_PERCENT).toBeCloseTo(4.8, 5);
  });

  it("power-up HUD motion stays in the one-shot duration band", () => {
    expect(POWER_UP_ENTER_DURATION_S).toBeGreaterThanOrEqual(0.2);
    expect(POWER_UP_ENTER_DURATION_S).toBeLessThanOrEqual(0.9);
    expect(POWER_UP_URGENT_DURATION_S).toBeGreaterThanOrEqual(0.2);
    expect(POWER_UP_URGENT_DURATION_S).toBeLessThanOrEqual(0.9);
    expect(POWER_UP_ENTER_SCALE_FROM).toBeCloseTo(0.784, 5);
    expect(POWER_UP_ENTER_SCALE_PEAK).toBeCloseTo(1.072, 5);
    expect(POWER_UP_URGENT_SCALE_PEAK).toBeCloseTo(1.048, 5);
  });
});

describe("climbFeelTokens — atmosphere (AC-18, NFR-4)", () => {
  it("grain opacity is in 0.040–0.044 and ≤0.05", () => {
    expect(CLIMB_GRAIN_OPACITY).toBeGreaterThanOrEqual(0.04);
    expect(CLIMB_GRAIN_OPACITY).toBeLessThanOrEqual(0.044);
    expect(CLIMB_GRAIN_OPACITY).toBeLessThanOrEqual(0.05);
  });

  it("topo signal alpha is in 0.055–0.065 and ≤0.08", () => {
    expect(CLIMB_TOPO_SIGNAL_ALPHA).toBeGreaterThanOrEqual(0.055);
    expect(CLIMB_TOPO_SIGNAL_ALPHA).toBeLessThanOrEqual(0.065);
    expect(CLIMB_TOPO_SIGNAL_ALPHA).toBeLessThanOrEqual(0.08);
  });
});

describe("climbFeelTokens — type class contracts (AC-8, AC-9)", () => {
  it("ClimbPanelIntro title is one DESIGN step up with display", () => {
    expect(CLIMB_PANEL_INTRO_TITLE_CLASS).toContain("font-display");
    expect(CLIMB_PANEL_INTRO_TITLE_CLASS).toContain("text-3xl");
    expect(CLIMB_PANEL_INTRO_TITLE_CLASS).toContain("md:text-4xl");
  });

  it("FreeLeaderboard heading keeps climb-ready display step", () => {
    expect(FREE_LEADERBOARD_HEADING_CLASS).toContain("font-display");
    expect(FREE_LEADERBOARD_HEADING_CLASS).toContain("text-3xl");
    expect(FREE_LEADERBOARD_HEADING_CLASS).toContain("md:text-4xl");
  });

  it("FreeClimbCard rank is 2.7rem mono tabular (not text-5xl)", () => {
    expect(FREE_CLIMB_RANK_CLASS).toContain("font-mono");
    expect(FREE_CLIMB_RANK_CLASS).toContain("tabular-nums");
    expect(FREE_CLIMB_RANK_CLASS).toContain("text-[2.7rem]");
    expect(FREE_CLIMB_RANK_CLASS).not.toContain("text-5xl");
  });
});
