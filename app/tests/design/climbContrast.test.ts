/**
 * AC-13 — climb HUD/leaderboard body tokens stay AA on void/surface.
 * Uses exported color constants (ClimbCanvas) + known ASCENT pair ratios.
 */

import { describe, expect, it } from "vitest";
import {
  TEXT_MUTED,
  TEXT_SECONDARY,
} from "../../src/components/Game/ClimbCanvas";

const VOID = "#0a0a0c";
const SURFACE = "#121116";
const TEXT_PRIMARY = "#f4f2f7";

function hexToLin(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (
    0.2126 * hexToLin(r) + 0.7152 * hexToLin(g) + 0.0722 * hexToLin(b)
  );
}

function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("climb text contrast tokens (AC-13)", () => {
  it("TEXT_SECONDARY meets ≥4.5:1 on void and surface", () => {
    expect(contrastRatio(TEXT_SECONDARY, VOID)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TEXT_SECONDARY, SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it("TEXT_PRIMARY meets ≥4.5:1 on void", () => {
    expect(contrastRatio(TEXT_PRIMARY, VOID)).toBeGreaterThanOrEqual(4.5);
  });

  it("does not treat TEXT_MUTED as an acceptable body color on void", () => {
    // Ledger: muted is for labels/glyphs only — body must not use it.
    expect(TEXT_MUTED).toBe("#74707e");
    expect(contrastRatio(TEXT_MUTED, VOID)).toBeLessThan(4.5);
  });
});
