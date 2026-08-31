/**
 * Empty vs unavailable vs AC-17 Desktop control. These invoke production
 * helpers and render ClimbLeaderboard — they do not grep catch(() => []).
 */

import { createElement, type CSSProperties, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import {
  DESKTOP_BOARD_CONTROL_LABEL,
  DESKTOP_BOARD_CONTROL_MIN_PX,
  DesktopBoardControl,
} from "../../src/components/Climb/DesktopBoardControl";
import { FreeLeaderboardBoard } from "../../src/components/LandingPage/FreeLeaderboardBoard";
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
    className,
    style,
  }: {
    href: string;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) {
    return createElement("a", { href, className, style }, children);
  },
}));

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
});
