/**
 * The Ranks screen's "You're #N" banner copy and avatar badge helpers
 * (mobile/src/lib/leaderboard, rendered by LeaderboardScreen).
 */

import { describe, it, expect } from "vitest";
import { standingFor, initialsOf, tintFor, formatHeight } from "../../mobile/src/lib/leaderboard";
import type { ClimberRank } from "../../mobile/src/contexts/AppDataContext";

const board = (peaks: number[], ids = peaks.map((_, i) => `u${i}`)): ClimberRank[] =>
  peaks.map((peakY, i) => ({ rank: i + 1, userId: ids[i], handle: `P${i}`, username: null, peakY, wins: 0 }));

describe("standingFor", () => {
  it("leads by the gap to #2 when the player is first", () => {
    const s = standingFor(board([4897.463, 4125.51], ["me", "b"]), "me", null, true);
    expect(s).toEqual({ kind: "ranked", rank: 1, detail: `${formatHeight(771.953)} ahead of #2` });
  });

  it("says tied rather than '0 ft ahead' when #1 and #2 are level", () => {
    const s = standingFor(board([500, 500], ["me", "b"]), "me", null, true);
    expect(s).toMatchObject({ rank: 1, detail: "Tied with #2" });
  });

  it("handles a board with only the player on it", () => {
    const s = standingFor(board([10], ["me"]), "me", null, true);
    expect(s).toMatchObject({ rank: 1, detail: "No one else on the board yet" });
  });

  it("measures the gap to the climber directly above", () => {
    const s = standingFor(board([900, 800, 650], ["a", "b", "me"]), "me", { peakY: 650, rank: 7 }, true);
    expect(s).toEqual({ kind: "ranked", rank: 3, detail: `${formatHeight(150)} behind #2` });
  });

  it("prefers the public list position over the dashboard rank", () => {
    const s = standingFor(board([900, 650], ["a", "me"]), "me", { peakY: 650, rank: 40 }, true);
    expect(s).toMatchObject({ rank: 2 });
  });

  it("shows the gap into the list for a player below the cut", () => {
    const s = standingFor(board([900, 300]), "me", { peakY: 120, rank: 312 }, true);
    expect(s).toEqual({ kind: "ranked", rank: 312, detail: `${formatHeight(180)} to reach the top 2` });
  });

  it("does not claim a negative gap when the cached list is stale", () => {
    const s = standingFor(board([900, 300]), "me", { peakY: 450, rank: 2 }, true);
    expect(s).toMatchObject({ detail: "Just outside the top 2" });
  });

  it("reports hidden, not a gap, when the player opted out of the public board", () => {
    expect(standingFor(board([900]), "me", { peakY: 120, rank: 3 }, false)).toEqual({ kind: "hidden" });
  });

  it("is unranked with no record", () => {
    expect(standingFor(board([900]), "me", null, true)).toEqual({ kind: "unranked" });
    expect(standingFor(board([900]), null, null, true)).toEqual({ kind: "unranked" });
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Golden Heron 31")).toBe("GH");
    expect(initialsOf("prince william")).toBe("PW");
  });

  it("skips words with no letters and falls back to ?", () => {
    expect(initialsOf("42 Wolf")).toBe("W");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("tintFor", () => {
  it("is stable per user and varies across users", () => {
    expect(tintFor("abc")).toBe(tintFor("abc"));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => tintFor(`user-${i}`)));
    expect(seen.size).toBeGreaterThan(3);
  });
});
