/**
 * One tab pattern on every stack (Leeran, 2026-10-31, "lets do A"): the
 * navbar marks the mode you are in (1v1, Daily, Endless) and the band under
 * it always reads Leaderboard | Play, in that order, for that mode.
 *
 * Renders the real shells and navbar and reads the links they draw.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

import { FreeStackShell, type FreeStackSection } from "../../src/components/FreeStackShell";
import { DuelStackShell, type DuelStackSection } from "../../src/components/Duel/DuelStackShell";
import { Navbar } from "../../src/components/Navbar";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

/** The band's tabs as [label, href, active]. */
function tabs(doc: Document) {
  return [...doc.querySelectorAll("[role=tablist] a")].map((a) => [
    a.textContent,
    a.getAttribute("href"),
    a.getAttribute("aria-selected") === "true",
  ]);
}

/** The navbar mode links marked current. */
function markedModes(doc: Document) {
  return [...doc.querySelectorAll("nav a[aria-current]")].map((a) => a.textContent);
}

const free = (section: FreeStackSection) =>
  parse(
    renderToStaticMarkup(
      createElement(FreeStackShell, { section, title: "t", children: createElement("div") }),
    ),
  );
const duel = (section: DuelStackSection) =>
  parse(renderToStaticMarkup(createElement(DuelStackShell, { section, children: createElement("div") })));

describe("every stack band reads Leaderboard | Play", () => {
  it.each([
    ["leaderboard", "/climb", "/play", 0],
    ["play", "/climb", "/play", 1],
    ["daily-leaderboard", "/daily/leaderboard", "/daily", 0],
    ["daily", "/daily/leaderboard", "/daily", 1],
  ] as const)("%s", (section, board, play, active) => {
    expect(tabs(free(section))).toEqual([
      ["Leaderboard", board, active === 0],
      ["Play", play, active === 1],
    ]);
  });

  it("1v1 has the same two tabs", () => {
    expect(tabs(duel("leaderboard"))).toEqual([
      ["Leaderboard", "/duel/leaderboard", true],
      ["Play", "/duel", false],
    ]);
  });
});

describe("the navbar marks the mode", () => {
  it.each([
    ["leaderboard", "Endless"],
    ["play", "Endless"],
    ["daily-leaderboard", "Daily"],
    ["daily", "Daily"],
  ] as const)("%s marks %s", (section, mode) => {
    expect(markedModes(free(section))).toEqual([mode]);
  });

  it("1v1 pages mark 1v1", () => {
    expect(markedModes(duel("play"))).toEqual(["1v1"]);
    expect(markedModes(duel("chips"))).toEqual(["1v1"]);
  });

  it("marks nothing on a page outside the three modes", () => {
    expect(markedModes(parse(renderToStaticMarkup(createElement(Navbar, { contextLabel: "Rules" }))))).toEqual([]);
    expect(markedModes(parse(renderToStaticMarkup(createElement(Navbar, {}))))).toEqual([]);
  });

  it("gives the marked link the signal colour and no idle colour", () => {
    const a = free("daily").querySelector("nav a[aria-current]")!;
    const cls = a.getAttribute("class")!.split(/\s+/);
    expect(cls).toContain("text-signal");
    expect(cls).not.toContain("text-text-muted");
  });
});
