/**
 * The Ranks screen's "You're #N" banner copy and avatar badge helpers
 * (mobile/src/lib/leaderboard, rendered by LeaderboardScreen).
 */

import { describe, it, expect } from "vitest";
import {
  standingFor,
  initialsOf,
  tintFor,
  formatHeight,
  friendsFooter,
  parseFriendsBoard,
  knownClimberCount,
  ranksStatus,
  ALLTIME_STATUS_FALLBACK,
} from "../../mobile/src/lib/leaderboard";
import { spokenReset } from "../../mobile/src/lib/daily";
import type { ClimberRank } from "../../mobile/src/contexts/AppDataContext";
import { AVATARS } from "@app/lib/avatars";

const board = (peaks: number[], ids = peaks.map((_, i) => `u${i}`)): ClimberRank[] =>
  peaks.map((peakY, i) => ({ rank: i + 1, userId: ids[i], handle: `P${i}`, username: null, peakY, wins: 0, avatarId: null }));

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

describe("friendsFooter", () => {
  it("is null when every friend is on the board", () => {
    expect(friendsFooter(0, 0)).toBeNull();
  });

  it("counts friends who haven't climbed, singular and plural", () => {
    expect(friendsFooter(0, 1)).toBe("1 friend hasn't climbed yet");
    expect(friendsFooter(0, 3)).toBe("3 friends haven't climbed yet");
  });

  it("counts hidden friends on their own, singular and plural", () => {
    expect(friendsFooter(1, 0)).toBe("1 friend is hidden");
    expect(friendsFooter(2, 0)).toBe("2 friends are hidden");
  });

  it("joins both counts on one line", () => {
    expect(friendsFooter(2, 3)).toBe("3 friends haven't climbed yet · 2 hidden");
    expect(friendsFooter(1, 1)).toBe("1 friend hasn't climbed yet · 1 hidden");
  });
});

describe("parseFriendsBoard", () => {
  const valid = { climbers: board([300, 100], ["a", "me"]), hiddenCount: 1, notClimbedCount: 0 };

  it("accepts the route's response shape", () => {
    expect(parseFriendsBoard(valid)).toEqual(valid);
  });

  it("rejects bodies missing or mistyping a field rather than defaulting", () => {
    expect(parseFriendsBoard(null)).toBeNull();
    expect(parseFriendsBoard({ error: "Too many requests" })).toBeNull();
    expect(parseFriendsBoard({ ...valid, hiddenCount: undefined })).toBeNull();
    expect(parseFriendsBoard({ ...valid, notClimbedCount: -1 })).toBeNull();
    expect(parseFriendsBoard({ ...valid, climbers: [{ userId: "a" }] })).toBeNull();
  });

  it("keeps a climber's catalogue avatarId, or null", () => {
    const [a, me] = valid.climbers;
    const body = { ...valid, climbers: [{ ...a, avatarId: AVATARS[0].id }, { ...me, avatarId: null }] };
    expect(parseFriendsBoard(body)?.climbers.map((c) => c.avatarId)).toEqual([AVATARS[0].id, null]);
  });

  it.each(["ember-knight", "", "__proto__", "constructor", AVATARS[0].id.toUpperCase(), `${AVATARS[0].id} `])(
    "reads a non-catalogue avatarId %j as null and keeps the board",
    (avatarId) => {
      const [a, me] = valid.climbers;
      const board = parseFriendsBoard({ ...valid, climbers: [{ ...a, avatarId }, me] });
      expect(board?.climbers.map((c) => c.avatarId)).toEqual([null, null]);
    }
  );

  it("reads a missing avatarId (older server) as null", () => {
    const climbers = valid.climbers.map(({ avatarId: _omit, ...rest }) => rest);
    expect(parseFriendsBoard({ ...valid, climbers })?.climbers.map((c) => c.avatarId)).toEqual([null, null]);
  });

  it("rejects a mistyped avatarId rather than dropping it", () => {
    for (const avatarId of [42, true, {}, ["ember-knight"]]) {
      const climbers = [{ ...valid.climbers[0], avatarId }, valid.climbers[1]];
      expect(parseFriendsBoard({ ...valid, climbers })).toBeNull();
    }
  });
});

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("ranksStatus: the Ranks status pill copy, by period", () => {
  it("Today: clock + the reset countdown, spoken as words", () => {
    const s = ranksStatus("today", 6 * HOUR + 36 * MIN + 59_000, 1302);
    expect(s).toEqual({
      icon: "clock",
      text: "Resets in 6h 36m",
      label: "Today's board resets in 6 hours 36 minutes",
    });
  });

  it("Today ignores the climber count and never names the scope or period", () => {
    const s = ranksStatus("today", 48 * MIN, 1302);
    expect(s.text).toBe("Resets in 48m");
    expect(`${s.text} ${s.label}`).not.toMatch(/climber|global|friends|all.time|today's tower/i);
  });

  it("All-time: people + the formatted climber count", () => {
    expect(ranksStatus("alltime", HOUR, 1302)).toEqual({
      icon: "people",
      text: "1,302 climbers",
      label: "1,302 climbers on the all-time board",
    });
  });

  it("All-time says '1 climber' for a single climber", () => {
    expect(ranksStatus("alltime", HOUR, 1).text).toBe("1 climber");
  });

  it.each([undefined, null, 0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "1302", {}])(
    "All-time with an unknown count (%j) shows the fallback, never a fabricated count",
    (total) => {
      const s = ranksStatus("alltime", HOUR, total);
      expect(s).toEqual({ icon: "people", text: ALLTIME_STATUS_FALLBACK, label: ALLTIME_STATUS_FALLBACK });
      expect(s.text).not.toMatch(/\d/);
    },
  );
});

describe("knownClimberCount", () => {
  it("accepts positive safe integers only", () => {
    expect(knownClimberCount(1)).toBe(1);
    expect(knownClimberCount(1302)).toBe(1302);
    expect(knownClimberCount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "5", null, undefined, true]) {
      expect(knownClimberCount(bad)).toBeNull();
    }
  });
});

describe("spokenReset", () => {
  it.each([
    [6 * HOUR + 36 * MIN, "6 hours 36 minutes"],
    [1 * HOUR + 1 * MIN, "1 hour 1 minute"],
    [2 * HOUR, "2 hours 0 minutes"],
    [48 * MIN + 30_000, "48 minutes"],
    [1 * MIN, "1 minute"],
    [59_999, "less than a minute"],
    [0, "less than a minute"],
    [-5_000, "less than a minute"],
  ])("%d ms -> %s", (ms, spoken) => {
    expect(spokenReset(ms)).toBe(spoken);
  });
});
