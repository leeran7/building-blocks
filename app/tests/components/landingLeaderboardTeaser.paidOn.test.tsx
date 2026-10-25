/**
 * LeaderboardTeaser — paid duels ON branch.
 *
 * The landing leads with the climb (plan D1): even with paid duels on, it
 * shows only the free board, plus one plain link to the chip duels page that
 * carries the disclosure. The chip leaderboard is not read on the landing.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";

vi.mock("../../src/config/paidDuel", () => ({
  PAID_DUELS_ENABLED: true,
  PAID_DUELS_ENABLED_PUBLIC: true,
}));

vi.mock("../../src/db/climb", () => ({
  topFreeClimbers: vi.fn(),
}));

import { topFreeClimbers } from "../../src/db/climb";
import { LeaderboardTeaser } from "../../src/components/LandingPage/LeaderboardTeaser";

const CLIMBERS: ClimberRank[] = [
  { rank: 1, userId: "u1", handle: "apex", username: "apex", peakY: 900, wins: 2, avatarId: null },
];

describe("LeaderboardTeaser — paid duels ON", () => {
  beforeEach(() => {
    vi.mocked(topFreeClimbers).mockReset();
  });

  it("shows the free board and one disclosed link to the paid modes, not the ranked board", async () => {
    vi.mocked(topFreeClimbers).mockResolvedValue(CLIMBERS);
    const html = renderToStaticMarkup(await LeaderboardTeaser());

    expect(html).toContain("Top climbers");
    expect(html).toContain("apex");
    const link = /<p data-paid-modes-link[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(link).not.toBeNull();
    expect(link![1]).toContain('href="/duel/chips"');
    expect(link![1]).toContain("18+, not available in all states");
    // A plain link, never a second filled CTA.
    expect(link![1]).not.toMatch(/\bbg-signal\b/);
  });
});
