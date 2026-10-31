/**
 * Phones: the navbar hides its mode links (1v1, Daily, Endless) below sm, and
 * the game pages are fullscreen there, covering the Leaderboard | Play band.
 * Leeran (2026-10-31): "Unauthenticated mobile navigation is broken", "How do
 * I even get to the leaderboard page on mobile?", "Add a dropdown menu
 * similar to the authed dropdown for mobile", "Authenticated menu should also
 * house the same links".
 *
 * Mounts the real Navbar, signed out and signed in, and drives its dropdown:
 * both menus list the modes to play, then their leaderboards, phone-only.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as { uid: string; displayName: string } | null,
  token: null as string | null,
}));
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ ...auth, loading: false, signOut: async () => undefined }),
}));
const routerMock = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
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

beforeEach(() => {
  auth.user = null;
  auth.token = null;
  // The account menu and bell fetch on mount; leave those pending.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const guestTrigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="Menu"]');
const accountTrigger = () => host.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]');
const modes = () => host.querySelector('[role="group"][aria-label="Game modes"]');
const modeLinks = () =>
  [...(modes()?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href")]);

// Play group, then the Leaderboards group (Leeran chose this over a
// Leaderboard button beside each mode).
const EVERY_MODE = [
  ["1v1", "/duel"],
  ["Daily", "/daily"],
  ["Endless", "/play"],
  ["1v1", "/duel/leaderboard"],
  ["Daily", "/daily/leaderboard"],
  ["Endless", "/climb"],
];

describe("signed-out phone menu", () => {
  it("is a phone-only dropdown with each mode's Play and Leaderboard, then Sign in and Get started", () => {
    mount("Endless");
    const trigger = guestTrigger()!;
    expect(trigger.closest(".sm\\:hidden")).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    act(() => trigger.click());
    expect(modeLinks()).toEqual(EVERY_MODE);
    const current = [...modes()!.querySelectorAll("a")].map((a) => a.getAttribute("aria-current"));
    expect(current).toEqual([null, null, "true", null, null, null]);
    expect([...modes()!.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["Play", "Leaderboards"]);

    const menu = host.querySelector('nav[aria-label="Menu"]')!;
    expect([...menu.querySelectorAll("a")].slice(-2).map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Sign in", "/auth/signin"],
      ["Get started", "/auth/signup"],
    ]);
  });

  it("closes on a pick, on Escape and on a press outside, not on a press inside", () => {
    mount("Daily Climb");
    act(() => guestTrigger()!.click());
    const board = [...modes()!.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/daily/leaderboard")!;
    act(() => board.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(modes()).toBeNull();

    act(() => guestTrigger()!.click());
    act(() => modes()!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(modes()).not.toBeNull();
    act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(modes()).toBeNull();

    act(() => guestTrigger()!.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(modes()).toBeNull();
    expect(document.activeElement).toBe(guestTrigger());
  });

  it("keeps the wide-screen Sign in link hidden on phones only, and Get started everywhere", () => {
    mount();
    const outside = [...host.querySelectorAll("a")].filter((a) => !a.closest('nav[aria-label="Menu"]'));
    const signIn = outside.find((a) => a.getAttribute("href") === "/auth/signin")!;
    const signUp = outside.find((a) => a.getAttribute("href") === "/auth/signup")!;
    expect(signIn.className.split(/\s+/)).toContain("max-sm:hidden");
    expect(signUp.className.split(/\s+/)).not.toContain("max-sm:hidden");
  });
});

describe("signed-in account menu", () => {
  it("houses the same mode rows, phone-only, and no guest menu", () => {
    auth.user = { uid: "u1", displayName: "Lenny" };
    auth.token = "tok";
    mount("1v1");
    expect(guestTrigger()).toBeNull();

    act(() => accountTrigger()!.click());
    expect(modeLinks()).toEqual(EVERY_MODE);
    expect(modes()!.closest(".sm\\:hidden")).not.toBeNull();
    expect(modes()!.querySelector('a[aria-current="true"]')?.textContent).toBe("1v1");
  });
});
