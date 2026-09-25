/**
 * LeaderboardTeaser — paid duels ON branch.
 *
 * With the paid flag mocked on, the merged block shows both boards (free +
 * ranked, top-3 each) plus the single ranked-chips + tournaments explainer
 * relocated from the removed DuelPromo. Also proves the ranked board's degrade
 * path (chipLeaderboard rejects → `.catch(() => [])` → empty state) while the
 * free board is unaffected.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";
import type { ChipLeaderboardRow } from "../../src/db/chips";

vi.mock("../../src/config/paidDuel", () => ({
  PAID_DUELS_ENABLED: true,
  PAID_DUELS_ENABLED_PUBLIC: true,
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
];

const RANKED: ChipLeaderboardRow[] = [
  {
    userId: "r1",
    displayName: "Sharpshooter",
    chipWins: 9,
    chipLosses: 2,
    winPct: 0.8,
    totalChipsWon: 4200,
  },
];

describe("LeaderboardTeaser — paid duels ON", () => {
  beforeEach(() => {
    vi.mocked(topFreeClimbers).mockReset();
    vi.mocked(chipLeaderboard).mockReset();
  });

  it("renders both boards and the relocated ranked-chip callout", async () => {
    vi.mocked(topFreeClimbers).mockResolvedValue(CLIMBERS);
    vi.mocked(chipLeaderboard).mockResolvedValue(RANKED);
    const html = renderToStaticMarkup(await LeaderboardTeaser());

    expect(html).toContain("Top climbers");
    expect(html).toContain("apex");
    expect(html).toContain("Top ranked players");
    expect(html).toContain("Sharpshooter");
    // The single callout relocated from DuelPromo must survive here.
    expect(html).toContain("Ranked chip duels + tournaments");
    expect(html).toContain("not available in all states");
  });

  it("degrades only the ranked board when its read rejects; free board stays", async () => {
    vi.mocked(topFreeClimbers).mockResolvedValue(CLIMBERS);
    vi.mocked(chipLeaderboard).mockRejectedValue(new Error("db down"));
    const html = renderToStaticMarkup(await LeaderboardTeaser());

    expect(html).toContain("Top ranked players");
    expect(html).toContain("no chip matches yet");
    // Free board unaffected by the ranked failure.
    expect(html).toContain("apex");
    expect(html).toContain("Top climbers");
  });
});
