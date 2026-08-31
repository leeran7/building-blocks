/**
 * GET /climb searchParams → selected board + standings isolation.
 * Invokes the production page, not a source-text grep of parseClimbBoard.
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";

const { topFreeClimbers, probeFreeClimbBoardOccupied } = vi.hoisted(() => ({
  topFreeClimbers: vi.fn(),
  probeFreeClimbBoardOccupied: vi.fn(),
}));

vi.mock("../../src/db/climb", () => ({
  topFreeClimbers,
  probeFreeClimbBoardOccupied,
}));

vi.mock("next/link", () => ({
  default: function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: ReactNode;
    [key: string]: unknown;
  }) {
    return createElement("a", { href, ...rest }, children);
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    token: null,
    loading: false,
    isAnonymous: false,
    signOut: async () => {},
  }),
}));

import FreeClimbPage, { generateMetadata } from "../../app/climb/page";

const MAYA: ClimberRank = {
  rank: 1,
  userId: "maya",
  handle: "Maya",
  peakY: 12,
  wins: 0,
};

const DREW: ClimberRank = {
  rank: 1,
  userId: "drew",
  handle: "Drew",
  peakY: 40,
  wins: 0,
};

function searchParams(board?: string) {
  return Promise.resolve(board === undefined ? {} : { board });
}

async function renderPage(board?: string): Promise<string> {
  const tree = await FreeClimbPage({ searchParams: searchParams(board) });
  return renderToStaticMarkup(tree);
}

describe("GET /climb board selection", () => {
  beforeEach(() => {
    topFreeClimbers.mockReset();
    probeFreeClimbBoardOccupied.mockReset();
    topFreeClimbers.mockImplementation(async (_limit: number, board = "mobile") => {
      if (board === "desktop") return [DREW];
      return [MAYA];
    });
    probeFreeClimbBoardOccupied.mockResolvedValue(false);
  });

  it("shows only Mobile standings when board is omitted", async () => {
    const html = await renderPage();
    expect(html).toContain("Maya");
    expect(html).not.toContain("Drew");
    expect(html).toContain("Mobile skill climb leaderboard");
    expect(topFreeClimbers).toHaveBeenCalledWith(50, "mobile");
    const meta = await generateMetadata({ searchParams: searchParams() });
    expect(String(meta.title)).toContain("Mobile");
  });

  it("shows only Desktop standings for ?board=desktop", async () => {
    const html = await renderPage("desktop");
    expect(html).toContain("Drew");
    expect(html).not.toContain("Maya");
    expect(html).toContain("Desktop skill climb leaderboard");
    expect(topFreeClimbers).toHaveBeenCalledWith(50, "desktop");
    const meta = await generateMetadata({
      searchParams: searchParams("desktop"),
    });
    expect(String(meta.title)).toContain("Desktop");
  });

  it.each(["tablet", "Mobile", "1", ""] as const)(
    "falls back to Mobile for unknown board %j without merging lists",
    async (board) => {
      const html = await renderPage(board);
      expect(html).toContain("Maya");
      expect(html).not.toContain("Drew");
      expect(topFreeClimbers).toHaveBeenCalledWith(50, "mobile");
    }
  );

  it("shows standings-unavailable, not empty-board copy, when the read fails", async () => {
    topFreeClimbers.mockRejectedValue(new Error("db down"));
    const html = await renderPage();
    expect(html).toContain("standings unavailable");
    expect(html).not.toContain("no climbers yet");
    expect(html).not.toContain("View Desktop leaderboard");
  });

  it("offers the Desktop control on empty Mobile when Desktop is occupied", async () => {
    topFreeClimbers.mockResolvedValue([]);
    probeFreeClimbBoardOccupied.mockResolvedValue(true);
    const html = await renderPage();
    expect(html).toContain("no climbers yet");
    expect(html).toContain("View Desktop leaderboard");
    expect(html).toContain('href="/climb?board=desktop"');
    expect(probeFreeClimbBoardOccupied).toHaveBeenCalledWith("desktop");
    expect(topFreeClimbers).toHaveBeenCalledTimes(1);
  });
});
