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
 *  - FreeStackShell draws the tools in the tab band, beside the tabs.
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
    (b) => b.getAttribute("aria-label") === label,
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
