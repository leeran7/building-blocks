/**
 * On a touch screen the game stage covers the website's tab bar, so the
 * in-game ⚙ panel lists the page's info dialogs (Today's tower, Controls,
 * About) and opens them (Leeran, 2026-10-31, mockup B).
 *
 * Driven through the real GameSettingsButton next to the real GameNotes:
 *  - touch: the panel shows one row per dialog, with Today's countdown;
 *  - a row closes the panel and opens that dialog;
 *  - a page with no info dialogs (the app, the landing demo) gets no rows;
 *  - with a mouse the tab bar is visible, so no rows.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pointer = vi.hoisted(() => ({ coarse: true }));
vi.mock("../../src/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => pointer.coarse }));

import { GameNotes } from "../../src/components/Game/GameNotes";
import { GameSettingsButton } from "../../src/components/Game/GameSettings";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function mount(withNotes: boolean) {
  act(() => {
    root.render(
      createElement(
        "div",
        null,
        withNotes
          ? createElement(GameNotes, {
              stack: "Daily Climb",
              aboutTitle: "About the Daily Climb",
              today: {
                text: createElement("span", null, "Today's tower ", createElement("span", { "data-info-detail": "" }, "3h 39m")),
                content: createElement("p", { id: "today-panel" }, "Next tower in"),
              },
              children: createElement("p", { id: "about-copy" }, "about"),
            })
          : null,
        createElement(GameSettingsButton, { muted: false, onToggleMute: () => {} }),
      ),
    );
  });
}

beforeEach(() => {
  pointer.coarse = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const cog = () => host.querySelector<HTMLButtonElement>('button[aria-label="Game settings"]')!;
const panel = () => host.querySelector('[role="group"][aria-label="Game settings"]');
const rows = () =>
  [...(panel()?.querySelectorAll<HTMLButtonElement>("button:not([role=switch])") ?? [])].filter(
    (b) => !b.closest("[role=radiogroup]") && !b.hasAttribute("aria-pressed") && !b.hasAttribute("aria-checked"),
  );
const openTitles = () =>
  [...host.querySelectorAll("dialog")]
    .filter((d) => d.open)
    .map((d) => document.getElementById(d.getAttribute("aria-labelledby")!)?.textContent);

describe("in-game ⚙ panel: info rows", () => {
  it("lists Today's tower (with its countdown), Controls and About on touch", () => {
    mount(true);
    act(() => cog().click());
    expect(rows().map((r) => r.textContent)).toEqual([
      "Today's tower3h 39m ›",
      "Controls & power-ups›",
      "About the Daily Climb›",
    ]);
  });

  it("a row closes the panel and opens that dialog", () => {
    mount(true);
    act(() => cog().click());
    const about = rows().find((r) => r.textContent?.startsWith("About"))!;
    act(() => about.click());
    expect(panel()).toBeNull();
    expect(openTitles()).toEqual(["About the Daily Climb"]);
  });

  it("shows no rows on a page without info dialogs", () => {
    mount(false);
    act(() => cog().click());
    expect(panel()).not.toBeNull();
    expect(rows()).toEqual([]);
  });

  it("shows no rows with a mouse, where the tab bar is visible", () => {
    pointer.coarse = false;
    mount(true);
    act(() => cog().click());
    expect(panel()).not.toBeNull();
    expect(rows()).toEqual([]);
  });
});
