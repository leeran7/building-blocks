/**
 * Phones: the navbar's mode links (1v1, Daily, Endless) are hidden below sm,
 * and a signed-out visitor had no other way to reach them (Leeran,
 * 2026-10-31: "Unauthenticated mobile navigation is broken"). NavModesMenu
 * puts them behind one labelled button for every visitor.
 *
 * Mounts the real Navbar, signed out, and drives the menu.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, token: null, loading: false, signOut: async () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

import { Navbar } from "../../src/components/Navbar";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function mount(contextLabel?: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(createElement(Navbar, { contextLabel })));
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-label^="Game modes"]')!;
const menu = () => host.querySelector('nav[aria-label="Game modes"]');

describe("phone modes menu, signed out", () => {
  it("is in the navbar for a signed-out visitor, phone-only, and names the current mode", () => {
    mount("Daily Climb");
    expect(host.textContent).toContain("Sign in");
    const btn = trigger();
    expect(btn).not.toBeNull();
    expect(btn.closest(".sm\\:hidden")).not.toBeNull();
    expect(btn.textContent).toContain("Daily");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("says Modes off the mode pages", () => {
    mount("Rules");
    expect(trigger().textContent).toContain("Modes");
  });

  it("opens to all three modes, marking the current one, and closes on a pick", () => {
    mount("Endless");
    act(() => trigger().click());
    const links = [...menu()!.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/duel", "/daily", "/play"]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    act(() => links[1].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(menu()).toBeNull();
  });

  it("closes on Escape and on a press outside, but not on a press inside", () => {
    mount("1v1");
    act(() => trigger().click());
    act(() => menu()!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(menu()).not.toBeNull();
    act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(menu()).toBeNull();

    act(() => trigger().click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("keeps a sign-in link on narrow phones, where the two auth links merge into one", () => {
    mount("Endless");
    const signIns = [...host.querySelectorAll('a[href="/auth/signin"]')];
    // One shown from 400px up, one under it: every width has exactly one.
    expect(signIns.map((a) => /max-\[399px\]:hidden/.test(a.className))).toEqual([true, false]);
    expect(signIns[1].className).toContain("min-[400px]:hidden");
    expect(host.querySelector('a[href="/auth/signup"]')!.className).toContain("max-[399px]:hidden");
  });
});
