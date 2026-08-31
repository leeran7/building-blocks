/**
 * Empty vs unavailable vs AC-17 Desktop control. These invoke production
 * helpers and render ClimbLeaderboard — they do not grep catch(() => []).
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";
import { ClimbBoardTabs } from "../../src/components/Climb/ClimbBoardTabs";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import {
  DESKTOP_BOARD_CONTROL_LABEL,
  DESKTOP_BOARD_CONTROL_MIN_PX,
  DesktopBoardControl,
} from "../../src/components/Climb/DesktopBoardControl";
import {
  FreeClimbCard,
  FreeClimbEmpty,
} from "../../src/components/Dashboard/FreeClimbCard";
import { FreeLeaderboardBoard } from "../../src/components/LandingPage/FreeLeaderboardBoard";
import { Hero } from "../../src/components/LandingPage/Hero";
import {
  climbLeaderboardFromRead,
  desktopOccupancy,
  prepareFreeLeaderboardBoards,
  shouldOfferDesktopControl,
} from "../../src/game/climbBoardRead";

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

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
}

const DESKTOP_CLIMBER: ClimberRank = {
  rank: 1,
  userId: "drew",
  handle: "Drew",
  peakY: 40,
  wins: 0,
};

function rejected(reason: Error): PromiseRejectedResult {
  return { status: "rejected", reason };
}

function fulfilled<T>(value: T): PromiseFulfilledResult<T> {
  return { status: "fulfilled", value };
}

describe("prepareFreeLeaderboardBoards (AC-19)", () => {
  it("marks a failed Mobile read unavailable while Desktop still lists", () => {
    const boards = prepareFreeLeaderboardBoards(
      rejected(new Error("mobile down")),
      fulfilled([DESKTOP_CLIMBER])
    );
    expect(boards.mobile.status).toBe("unavailable");
    expect(boards.desktop.status).toBe("ok");
    if (boards.desktop.status !== "ok") throw new Error("expected ok");
    expect(boards.desktop.climbers).toEqual([DESKTOP_CLIMBER]);

    const mobileProps = climbLeaderboardFromRead(boards.mobile, "mobile");
    const desktopProps = climbLeaderboardFromRead(boards.desktop, "desktop");
    expect(mobileProps.unavailable).toBe(true);
    expect(desktopProps.unavailable).toBe(false);
    expect(desktopProps.climbers).toHaveLength(1);

    const mobileHtml = renderToStaticMarkup(
      createElement(ClimbLeaderboard, {
        climbers: mobileProps.climbers,
        unavailable: mobileProps.unavailable,
        board: "mobile",
      })
    );
    expect(mobileHtml).toContain("standings unavailable");
    expect(mobileHtml).not.toContain("no climbers yet");

    const desktopHtml = renderToStaticMarkup(
      createElement(ClimbLeaderboard, {
        climbers: desktopProps.climbers,
        unavailable: desktopProps.unavailable,
        board: "desktop",
      })
    );
    expect(desktopHtml).toContain("Drew");
    expect(desktopHtml).not.toContain("standings unavailable");
  });

  it("marks a failed Desktop read unavailable while Mobile still lists", () => {
    const mobileClimber: ClimberRank = {
      rank: 1,
      userId: "maya",
      handle: "Maya",
      peakY: 12,
      wins: 0,
    };
    const boards = prepareFreeLeaderboardBoards(
      fulfilled([mobileClimber]),
      rejected(new Error("desktop down"))
    );
    const desktopProps = climbLeaderboardFromRead(boards.desktop, "desktop");
    const mobileProps = climbLeaderboardFromRead(boards.mobile, "mobile");
    expect(desktopProps.unavailable).toBe(true);
    expect(mobileProps.climbers.map((c) => c.userId)).toEqual(["maya"]);
  });
});

describe("shouldOfferDesktopControl (AC-17)", () => {
  const emptyOk = { status: "ok" as const, climbers: [] as ClimberRank[] };
  const populated = {
    status: "ok" as const,
    climbers: [DESKTOP_CLIMBER],
  };
  const unavailable = { status: "unavailable" as const };

  it("offers Desktop when Mobile is successfully empty and Desktop has climbers", () => {
    expect(
      shouldOfferDesktopControl({
        viewing: "mobile",
        mobile: emptyOk,
        desktopOccupied: desktopOccupancy(populated),
      })
    ).toBe(true);
  });

  it("offers Desktop when Mobile is empty and Desktop occupancy is unknown", () => {
    expect(
      shouldOfferDesktopControl({
        viewing: "mobile",
        mobile: emptyOk,
        desktopOccupied: null,
      })
    ).toBe(true);
  });

  it("does not offer Desktop when both boards are successfully empty", () => {
    expect(
      shouldOfferDesktopControl({
        viewing: "mobile",
        mobile: emptyOk,
        desktopOccupied: desktopOccupancy(emptyOk),
      })
    ).toBe(false);
  });

  it("does not offer Desktop when Mobile is unavailable", () => {
    expect(
      shouldOfferDesktopControl({
        viewing: "mobile",
        mobile: unavailable,
        desktopOccupied: true,
      })
    ).toBe(false);
  });

  it("does not offer Desktop while viewing Desktop", () => {
    expect(
      shouldOfferDesktopControl({
        viewing: "desktop",
        mobile: emptyOk,
        desktopOccupied: true,
      })
    ).toBe(false);
  });
});

describe("DesktopBoardControl", () => {
  it("links to the Desktop /climb URL at 44px with Desktop in the name", () => {
    const html = renderToStaticMarkup(createElement(DesktopBoardControl));
    expect(html).toContain('href="/climb?board=desktop"');
    expect(html).toContain(DESKTOP_BOARD_CONTROL_LABEL);
    expect(html).toContain(`min-height:${DESKTOP_BOARD_CONTROL_MIN_PX}px`);
    expect(html).toContain("bg-signal");
    expect(html).toContain("text-void");
    expect(html).not.toContain("text-muted");
  });
});

describe("ClimbLeaderboard empty + AC-17 control", () => {
  it("renders the Desktop control inside a successful empty Mobile state", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbLeaderboard, {
        climbers: [],
        unavailable: false,
        board: "mobile",
        emptyAction: createElement(DesktopBoardControl),
      })
    );
    expect(html).toContain("no climbers yet");
    expect(html).toContain(DESKTOP_BOARD_CONTROL_LABEL);
    expect(html).toContain("/climb?board=desktop");
  });

  it("does not render emptyAction when standings are unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbLeaderboard, {
        climbers: [],
        unavailable: true,
        board: "mobile",
        emptyAction: createElement(DesktopBoardControl),
      })
    );
    expect(html).toContain("standings unavailable");
    expect(html).not.toContain("no climbers yet");
    expect(html).not.toContain(DESKTOP_BOARD_CONTROL_LABEL);
  });
});

describe("FreeLeaderboardBoard landing teaser", () => {
  it("shows unavailable copy on the default Mobile tab when that read failed", () => {
    const html = renderToStaticMarkup(
      createElement(FreeLeaderboardBoard, {
        mobile: { status: "unavailable" },
        desktop: { status: "ok", climbers: [DESKTOP_CLIMBER] },
      })
    );
    expect(html).toContain("standings unavailable");
    expect(html).not.toContain("no climbers yet");
    expect(html).not.toContain(DESKTOP_BOARD_CONTROL_LABEL);
  });

  it("shows the Desktop control on empty Mobile when Desktop has climbers", () => {
    const html = renderToStaticMarkup(
      createElement(FreeLeaderboardBoard, {
        mobile: { status: "ok", climbers: [] },
        desktop: { status: "ok", climbers: [DESKTOP_CLIMBER] },
      })
    );
    expect(html).toContain("no climbers yet");
    expect(html).toContain(DESKTOP_BOARD_CONTROL_LABEL);
    expect(html).toContain("bg-signal");
  });

  it("omits the Desktop control when both boards are empty", () => {
    const html = renderToStaticMarkup(
      createElement(FreeLeaderboardBoard, {
        mobile: { status: "ok", climbers: [] },
        desktop: { status: "ok", climbers: [] },
      })
    );
    expect(html).toContain("no climbers yet");
    expect(html).not.toContain(DESKTOP_BOARD_CONTROL_LABEL);
  });

  it("defaults to Mobile with both boards present and a full-board link on /", () => {
    const mobileClimber: ClimberRank = {
      rank: 1,
      userId: "maya",
      handle: "Maya",
      peakY: 12,
      wins: 0,
    };
    const html = renderToStaticMarkup(
      createElement(FreeLeaderboardBoard, {
        mobile: { status: "ok", climbers: [mobileClimber] },
        desktop: { status: "ok", climbers: [DESKTOP_CLIMBER] },
      })
    );
    expect(html).toContain("Maya");
    expect(html).not.toContain("Drew");
    expect(html).toContain("role=\"tablist\"");
    expect(html).toContain("Mobile");
    expect(html).toContain("Desktop");
    expect(html).toContain("Full mobile leaderboard");
    expect(hrefs(html)).toContain("/climb");
    expect(hrefs(html)).not.toContain("/climb?board=desktop");
    expect(html).toContain("<button");
  });
});

describe("ClimbBoardTabs", () => {
  it("links Desktop to ?board=desktop and Mobile to a clean /climb URL", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbBoardTabs, { active: "mobile" })
    );
    expect(hrefs(html)).toEqual(["/climb", "/climb?board=desktop"]);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-current="page"');
  });

  it("keeps the same hrefs when Desktop is the active board", () => {
    const html = renderToStaticMarkup(
      createElement(ClimbBoardTabs, { active: "desktop" })
    );
    expect(hrefs(html)).toEqual(["/climb", "/climb?board=desktop"]);
    expect(html).toContain("Desktop");
  });
});

describe("FreeClimbCard / FreeClimbEmpty", () => {
  it("lists both boards Mobile first with rank, field size, and peak", () => {
    const html = renderToStaticMarkup(
      createElement(FreeClimbCard, {
        climb: {
          handle: "Riley",
          boards: [
            { board: "mobile", peakY: 12, rank: 3, totalClimbers: 10, wins: 0 },
            { board: "desktop", peakY: 40, rank: 1, totalClimbers: 80, wins: 2 },
          ],
        },
      })
    );
    const mobileAt = html.indexOf("Mobile");
    const desktopAt = html.indexOf("Desktop");
    expect(mobileAt).toBeGreaterThan(-1);
    expect(desktopAt).toBeGreaterThan(mobileAt);
    expect(html).toContain("#3");
    expect(html).toContain("of 10");
    expect(html).toContain("12m");
    expect(html).toContain("#1");
    expect(html).toContain("of 80");
    expect(html).toContain("40m");
    expect(hrefs(html)).toContain("/climb");
    expect(hrefs(html)).not.toContain("/climb?board=desktop");
  });

  it("shows only a Desktop row for a Desktop-only standing", () => {
    const html = renderToStaticMarkup(
      createElement(FreeClimbCard, {
        climb: {
          handle: "Drew",
          boards: [
            { board: "desktop", peakY: 40, rank: 1, totalClimbers: 80, wins: 0 },
          ],
        },
      })
    );
    expect(html).toContain("Desktop");
    expect(html).not.toContain("Mobile");
    expect(html).toContain("#1");
    expect(hrefs(html)).toContain("/climb?board=desktop");
    expect(hrefs(html)).not.toContain("/climb");
  });

  it("shows the empty card with no invented rank", () => {
    const html = renderToStaticMarkup(createElement(FreeClimbEmpty));
    expect(html).toContain("No record yet");
    expect(html).not.toMatch(/#\d/);
  });
});

describe("Hero social proof", () => {
  it("shows Mobile topPeak metres and paid figures separately from climb rows", () => {
    const html = renderToStaticMarkup(
      createElement(Hero, {
        stats: {
          totalBlocks: 7,
          minEntryUsd: 5,
          climberCount: 2,
          topPeak: 10,
        },
      })
    );
    expect(html).toContain("Blocks climbing");
    expect(html).toContain("7");
    expect(html).toContain("Claim #1");
    expect(html).toContain("$5");
    expect(html).toContain("Climbers");
    expect(html).toContain("2");
    expect(html).toContain("Top climb");
    expect(html).toContain("10m");
  });

  it("shows an em dash for Top climb when Mobile has no peak", () => {
    const html = renderToStaticMarkup(
      createElement(Hero, {
        stats: {
          totalBlocks: 7,
          minEntryUsd: 5,
          climberCount: 1,
          topPeak: null,
        },
      })
    );
    expect(html).toContain("Top climb");
    expect(html).toContain("—");
    expect(html).not.toContain("999m");
  });
});
