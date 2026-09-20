import { describe, expect, it } from "vitest";
import { climbEyebrowLabel } from "../../src/lib/climbEyebrow";

/**
 * The lobby eyebrow renders `[ <climbEyebrowLabel(categoryLabel)> ]`. The bug it
 * fixes: "Free climb" (a real caller value from ClimbPlayClient) used to render
 * "[ FREE CLIMB CLIMB ]". These fixtures pin the exact caller labels used in
 * production (ClimbPlayClient: "Free climb"; DailyClimbClient: "Daily";
 * GameOverlay: category labels like "Tech"/"Design").
 */
describe("climbEyebrowLabel", () => {
  it("does NOT append climb when the label already contains it (the bug)", () => {
    // Positive fixture of the string the guard must reject-appending to.
    expect(climbEyebrowLabel("Free climb")).toBe("Free climb");
  });

  it("appends climb for labels that don't already carry the word", () => {
    // Positive fixtures that DO require the append — proves the guard isn't a
    // no-op that always returns the input unchanged.
    expect(climbEyebrowLabel("Daily")).toBe("Daily climb");
    expect(climbEyebrowLabel("Tech")).toBe("Tech climb");
    expect(climbEyebrowLabel("Design")).toBe("Design climb");
    expect(climbEyebrowLabel("Shared replay")).toBe("Shared replay climb");
  });

  it("matches climb case-insensitively and as a whole word", () => {
    expect(climbEyebrowLabel("free CLIMB")).toBe("free CLIMB");
    // "Climbing" is not the word "climb" — still gets the eyebrow suffix.
    expect(climbEyebrowLabel("Climbing")).toBe("Climbing climb");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(climbEyebrowLabel("  Daily  ")).toBe("Daily climb");
    expect(climbEyebrowLabel("  Free climb  ")).toBe("Free climb");
  });
});
