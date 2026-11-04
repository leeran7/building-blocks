/**
 * Leaderboard → Play is a launch, not a page swap (Leeran, 2026-11-01:
 * "Animation going into play mode from leaderboard is not smooth").
 *
 * - The links that start a game stage (the band's Play tab, the board's CTA)
 *   tag their navigation LAUNCH_TRANSITION, so app/layout.tsx runs the
 *   `.page-launch` fade (board out, then stage in) instead of a crossfade
 *   that double-exposes the board over the HUD.
 * - On the game sections the band is marked `data-under-stage`, which
 *   globals.css uses to drop the pill's shared view-transition name on touch,
 *   where the stage covers it (it used to glide up over the HUD and vanish).
 *
 * next/link is replaced by an anchor that writes its transitionTypes out, so
 * the test reads what the real components pass.
 *
 * @vitest-environment happy-dom
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    transitionTypes,
    children,
    ...rest
  }: {
    href: string;
    transitionTypes?: string[];
    children: ReactNode;
  }) =>
    createElement(
      "a",
      { ...rest, href, "data-types": transitionTypes?.join(" ") ?? "" },
      children,
    ),
}));
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

import { FreeStackShell, type FreeStackSection } from "../../src/components/FreeStackShell";
import { DuelStackShell } from "../../src/components/Duel/DuelStackShell";
import { BoardCta } from "../../src/components/Leaderboard/BoardChrome";
import { LAUNCH_TRANSITION } from "../../src/components/navLinks";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const free = (section: FreeStackSection) =>
  parse(
    renderToStaticMarkup(
      createElement(FreeStackShell, { section, title: "t", children: createElement("div") }),
    ),
  );

/** The band's tabs as [label, transition types]. */
const tabTypes = (doc: Document) =>
  [...doc.querySelectorAll("[role=tablist] a")].map((a) => [
    a.textContent,
    a.getAttribute("data-types"),
  ]);

describe("Play starts a launch", () => {
  it.each(["leaderboard", "play", "daily-leaderboard", "daily"] as const)(
    "%s: Play tab is a launch, Leaderboard tab is a plain switch",
    (section) => {
      expect(tabTypes(free(section))).toEqual([
        ["Leaderboard", ""],
        ["Play", LAUNCH_TRANSITION.join(" ")],
      ]);
    },
  );

  it("1v1 Play opens the lobby, not a stage, so it stays a plain switch", () => {
    const doc = parse(
      renderToStaticMarkup(createElement(DuelStackShell, { section: "leaderboard", children: createElement("div") })),
    );
    expect(tabTypes(doc)).toEqual([
      ["Leaderboard", ""],
      ["Play", ""],
    ]);
  });

  it("BoardCta passes its transition types through", () => {
    const a = parse(
      renderToStaticMarkup(
        createElement(BoardCta, { href: "/play", transitionTypes: LAUNCH_TRANSITION, children: "Play" }),
      ),
    ).querySelector("a")!;
    expect(a.getAttribute("data-types")).toBe("launch");
  });
});

describe("the band under a touch stage stays out of the switch", () => {
  it.each([
    ["play", true],
    ["daily", true],
    ["leaderboard", false],
    ["daily-leaderboard", false],
  ] as const)("%s → under stage: %s", (section, under) => {
    expect(free(section).querySelector("[role=tablist]")!.hasAttribute("data-under-stage")).toBe(under);
  });
});
