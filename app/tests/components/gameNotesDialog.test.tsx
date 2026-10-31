/**
 * /play and /daily keep "Controls & power-ups" and their About copy behind
 * buttons in the stack tab band (Leeran, 2026-10-31: move the two cards under
 * the stage onto "the bar by the tabs", as modals).
 *
 * Driven through the real GameNotes / InfoDialog:
 *  - the About copy is in the page while every dialog is closed (crawlable);
 *  - each band button opens its own dialog, and only that one;
 *  - the close button, and a click on the backdrop, close it; a click inside
 *    the content does not;
 *  - Daily's "Today's tower" button opens its own dialog;
 *  - FreeStackShell draws the tools in the tab band, beside the tabs, and the
 *    1v1 band carries the same Controls / About buttons (Leeran: keep /climb,
 *    /duel/leaderboard etc. in sync).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/play",
}));

import { FreeStackShell } from "../../src/components/FreeStackShell";
import { DuelStackShell } from "../../src/components/Duel/DuelStackShell";
import { GameNotes } from "../../src/components/Game/GameNotes";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      createElement(GameNotes, {
        stack: "Endless",
        aboutTitle: "About this game",
        children: createElement("p", { id: "about-copy" }, "This is Endless, the solo mode."),
      }),
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button[aria-haspopup=dialog]")].find(
    (b) => b.getAttribute("title") === label,
  )!;
const openDialogs = () => [...host.querySelectorAll("dialog")].filter((d) => d.open);
const titleOf = (d: Element) =>
  document.getElementById(d.getAttribute("aria-labelledby")!)?.textContent;

describe("GameNotes in the tab band", () => {
  it("renders the About copy into the page with every dialog closed", () => {
    expect(host.querySelector("#about-copy")?.textContent).toBe("This is Endless, the solo mode.");
    expect(host.querySelector("#about-copy")?.closest("dialog")).not.toBeNull();
    expect(host.querySelectorAll("dialog").length).toBeGreaterThan(0);
    expect(openDialogs()).toHaveLength(0);
  });

  it("opens only the dialog of the button pressed", () => {
    act(() => button("Controls & power-ups").click());
    expect(openDialogs().map(titleOf)).toEqual(["Controls & power-ups"]);
    expect(openDialogs()[0].textContent).toMatch(/power-ups/i);
    expect(openDialogs()[0].querySelector("#about-copy")).toBeNull();

    act(() => openDialogs()[0].close());
    act(() => button("About this game").click());
    expect(openDialogs().map(titleOf)).toEqual(["About this game"]);
    expect(openDialogs()[0].querySelector("#about-copy")).not.toBeNull();
  });

  it("closes from the backdrop but not from a click inside the content", () => {
    act(() => button("About this game").click());
    const dialog = openDialogs()[0] as HTMLDialogElement;

    act(() => dialog.querySelector<HTMLElement>("#about-copy")!.click());
    expect(dialog.open).toBe(true);

    act(() => dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(dialog.open).toBe(false);
  });

  it("closes from its close button", () => {
    act(() => button("Controls & power-ups").click());
    const dialog = openDialogs()[0] as HTMLDialogElement;
    act(() => dialog.querySelector<HTMLButtonElement>("button[aria-label=Close]")!.click());
    expect(dialog.open).toBe(false);
  });
});

describe("FreeStackShell tools", () => {
  it("draws the tools in the tab band, beside the tabs, not in the page body", () => {
    const html = renderToStaticMarkup(
      createElement(FreeStackShell, {
        section: "play",
        title: "Play",
        tools: createElement("button", { id: "tool" }, "?"),
        children: createElement("div", { id: "stage" }, "canvas"),
      }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tablist = doc.querySelector("[role=tablist]")!;
    const tool = doc.getElementById("tool")!;
    expect(tool).not.toBeNull();
    // Same row: the tablist's band container is the tool's parent.
    expect(tool.parentElement!.contains(tablist)).toBe(true);
    expect(tool.parentElement!.contains(doc.getElementById("stage"))).toBe(false);
  });
});

describe("Daily's Today's tower button", () => {
  it("opens a dialog with the panel the page hands it", () => {
    act(() => {
      root.render(
        createElement(GameNotes, {
        stack: "Endless",
          aboutTitle: "About the Daily Climb",
          today: {
            text: "Today's tower 3h 52m",
            content: createElement("p", { id: "today-panel" }, "Next tower in"),
          },
          children: createElement("p", null, "about"),
        }),
      );
    });
    expect(button("Today's tower").textContent).toContain("3h 52m");
    act(() => button("Today's tower").click());
    expect(openDialogs().map(titleOf)).toEqual(["Today's tower"]);
    expect(openDialogs()[0].querySelector("#today-panel")).not.toBeNull();
  });
});

describe("1v1 band", () => {
  it("has the same Controls and About buttons as the Endless / Daily band", () => {
    const html = renderToStaticMarkup(
      createElement(DuelStackShell, { section: "leaderboard", children: createElement("div", { id: "board" }) }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tablist = doc.querySelector("[role=tablist]")!;
    const titles = [...doc.querySelectorAll("button[aria-haspopup=dialog]")].map((b) => b.getAttribute("title"));
    expect(titles).toEqual(expect.arrayContaining(["Controls & power-ups", "About 1v1"]));
    const controls = [...doc.querySelectorAll("button[aria-haspopup=dialog]")].find(
      (b) => b.getAttribute("title") === "About 1v1",
    )!;
    // In the band, not in the page body.
    expect(controls.closest("main")).toBeNull();
    expect(tablist.closest("main")).toBeNull();
  });
});
