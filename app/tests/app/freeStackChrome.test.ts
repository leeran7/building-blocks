/**
 * Free-stack chrome contracts.
 *
 * Fill vs scroll is derived from the section, not a compactHeader boolean.
 * Readable copy on the board and overlay guide uses secondary, not muted.
 */

import { describe, it, expect } from "vitest";
import {
  isFillSection,
  LEADERBOARD_UNIT_CLASS,
  OVERLAY_GUIDE_COPY_CLASS,
} from "../../src/components/freeStackChrome";

describe("isFillSection", () => {
  it("fills only the play section so leftover viewport goes to the canvas", () => {
    expect(isFillSection("play")).toBe(true);
    expect(isFillSection("leaderboard")).toBe(false);
  });
});

describe("readable free-stack copy tokens", () => {
  it("uses secondary, not muted, for leaderboard units and overlay guide", () => {
    expect(LEADERBOARD_UNIT_CLASS).toBe("text-text-secondary");
    expect(OVERLAY_GUIDE_COPY_CLASS).toBe("text-text-secondary");
    expect(LEADERBOARD_UNIT_CLASS).not.toMatch(/muted/);
    expect(OVERLAY_GUIDE_COPY_CLASS).not.toMatch(/muted/);
  });
});
