/**
 * LeaderboardTeaser — paid duels OFF (default) branch.
 *
 * Renders the merged landing leaderboard as a resolved server tree
 * (renderToStaticMarkup) with the paid flag mocked off: only the free board
 * shows, there is no ranked heading, no "one lone tab", and no ranked-chip
 * callout. Also proves the free board's degrade path (server read rejects →
 * `.catch(() => [])` → empty state) survives the merge.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";

vi.mock("../../src/config/paidDuel", () => ({
  PAID_DUELS_ENABLED: false,
  PAID_DUELS_ENABLED_PUBLIC: false,
}));

vi.mock("../../src/db/climb", () => ({
  topFreeClimbers: vi.fn(),
}));

vi.mock("../../src/db/chips", () => ({
  chipLeaderboard: vi.fn(),
}));

import { topFreeClimbers } from "../../src/db/climb";
import { chipLeaderboard } from "../../src/db/chips";
import { LeaderboardTeaser } from "../../src/components/LandingPage/LeaderboardTeaser";

const CLIMBERS: ClimberRank[] = [
  { rank: 1, userId: "u1", handle: "apex", username: "apex", peakY: 900, wins: 2, avatarId: null },
  { rank: 2, userId: "u2", handle: "rival", username: null, peakY: 700, wins: 0, avatarId: null },
  { rank: 3, userId: "u3", handle: "third", username: null, peakY: 500, wins: 0, avatarId: null },
];

describe("LeaderboardTeaser — paid duels OFF", () => {
  beforeEach(() => {
    vi.mocked(topFreeClimbers).mockReset();
    vi.mocked(chipLeaderboard).mockReset();
  });

  it("renders only the free board — no ranked board, no lone tab, no chip callout", async () => {
    vi.mocked(topFreeClimbers).mockResolvedValue(CLIMBERS);
    const html = renderToStaticMarkup(await LeaderboardTeaser());

    expect(html).toContain("Top climbers");
    expect(html).toContain("apex");
    // Ranked board and its relocated explainer must be absent when paid is off.
    expect(html).not.toContain("Top ranked players");
    expect(html).not.toContain("not available in all states");
    // The ranked read must not even be attempted when the flag is off.
    expect(chipLeaderboard).not.toHaveBeenCalled();
  });

  it("degrades the free board to its empty state when the server read rejects", async () => {
    vi.mocked(topFreeClimbers).mockRejectedValue(new Error("db down"));
    const html = renderToStaticMarkup(await LeaderboardTeaser());

    expect(html).toContain("no climbers yet");
    expect(html).toContain("Play the free climb");
    expect(html).not.toContain("Top ranked players");
  });
});
