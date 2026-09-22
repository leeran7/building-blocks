/**
 * ACCEPTANCE (qa-acceptance): list_climb_replays -> analyze_climb_replay token
 * compatibility. This is the end-to-end product seam behind "an admin can
 * DISCOVER a replay and then analyze it": a token as list_climb_replays returns
 * it (raw `replay_token`, no /play?r= wrapper) MUST be directly consumable by
 * analyze_climb_replay, which routes the value through extractReplayToken.
 *
 * listAllClimbReplays returns `replay_token` verbatim as `replayToken`, and the
 * stored `replay_token` is produced by encodeRunReplay — so this test drives the
 * REAL producer (encodeRunReplay) into the REAL consumer path
 * (extractReplayToken + analyzeClimbReplay) with NO URL wrapping, proving the
 * two agent tools share a token format. No source grepping; real units only.
 */

import { describe, it, expect } from "vitest";
import {
  extractReplayToken,
  analyzeClimbReplay,
} from "../../src/social/services/replayAnalysis";
import { encodeRunReplay } from "../../src/game/runReplay";
import { NO_INPUT } from "../../src/game/types";

describe("acceptance: list_climb_replays token feeds analyze_climb_replay", () => {
  it("a raw stored replay_token (as list returns it) is accepted verbatim as a raw token", async () => {
    const inputs = Array.from({ length: 600 }, (_, i) =>
      i % 4 === 0
        ? { moveX: 1 as const, jump: i % 20 === 0, climbY: 1 as const, usePowerUp: false }
        : NO_INPUT
    );
    // This is exactly the value that lands in climb_runs.replay_token and is
    // handed back by list_climb_replays as `replayToken`.
    const storedToken = await encodeRunReplay({ seed: "list-to-analyze", peakY: 88.8, inputs });
    expect(storedToken).toBeTruthy();
    const replayToken = storedToken as string;

    // The raw-token branch of extractReplayToken requires no-spaces and
    // length >= 24; a real replay token must clear it, or the admin could list a
    // token they can never analyze.
    expect(replayToken.length).toBeGreaterThanOrEqual(24);
    expect(replayToken).not.toContain(" ");
    expect(extractReplayToken(replayToken)).toBe(replayToken);

    // Full path: raw token straight into analyze (no /play?r= wrapper).
    const analysis = await analyzeClimbReplay(replayToken);
    expect(analysis.seed).toBe("list-to-analyze");
    expect(analysis.tickCount).toBe(600);
    expect(analysis.highlights.length).toBeGreaterThan(0);
  });

  it("rejects a sub-24-char string as a raw token (guard is real, not a rename)", () => {
    // Positive fixture proving the negative guard: a 23-char no-space string is
    // NOT a valid raw token, so list output that failed to be a real token could
    // not masquerade as analyzable.
    expect(extractReplayToken("x".repeat(23))).toBeNull();
  });
});
