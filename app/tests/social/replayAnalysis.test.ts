import { describe, it, expect } from "vitest";
import { extractReplayToken, analyzeClimbReplay } from "../../src/social/services/replayAnalysis";
import { encodeRunReplay } from "../../src/game/runReplay";
import { NO_INPUT } from "../../src/game/types";

describe("extractReplayToken", () => {
  it("pulls token from full play URL", () => {
    const token = "abc123xyz";
    expect(extractReplayToken(`https://www.doomstack.lol/play?r=${token}`)).toBe(token);
  });

  it("pulls token from path-only URL", () => {
    const token = "abc123xyz";
    expect(extractReplayToken(`/play?r=${token}`)).toBe(token);
  });

  it("accepts a raw token string", () => {
    const token = "e".repeat(40);
    expect(extractReplayToken(token)).toBe(token);
  });

  it("returns null for empty input", () => {
    expect(extractReplayToken("")).toBeNull();
    expect(extractReplayToken("   ")).toBeNull();
  });
});

describe("analyzeClimbReplay", () => {
  it("decodes a replay and returns highlights", async () => {
    const inputs = Array.from({ length: 600 }, (_, i) =>
      i % 4 === 0
        ? { moveX: 1 as const, jump: i % 20 === 0, climbY: 1 as const, usePowerUp: false }
        : NO_INPUT
    );
    const token = await encodeRunReplay({ seed: "marketing-test-seed", peakY: 95.2, inputs });
    expect(token).toBeTruthy();

    const analysis = await analyzeClimbReplay(`https://doomstack.lol/play?r=${token}`);
    expect(analysis.seed).toBe("marketing-test-seed");
    expect(analysis.tickCount).toBe(600);
    expect(analysis.highlights.length).toBeGreaterThan(0);
    expect(analysis.summary).toContain("m peak");
  });
});
