/**
 * Screen-to-screen motion in the mobile shell. Screens are transparent over
 * the lava backdrop, so the outgoing screen must stay mounted while the next
 * one animates in: unmounting it at once left a frame of bare backdrop
 * between Shop and Skin Details. The tab bar slides away with a pushed screen
 * instead of vanishing, and back again on the way out.
 *
 * Renders the real RouteTransition and BottomNavDock in a MemoryRouter; only
 * haptics and reduced motion are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, NavigationType, Route, Routes, useLocation, useNavigate, type Location, type NavigateFunction } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../../mobile/src/lib/haptics", () => ({ tapLight: vi.fn(async () => {}) }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduce }));

import { RouteTransition, transitionKind } from "../../mobile/src/components/RouteTransition";
import { BottomNavDock, isTabRoot } from "../../mobile/src/components/BottomNav";

const PATHS = ["/", "/shop", "/shop/wraith", "/profile", "/settings"];

let container: HTMLDivElement;
let root: Root | null = null;
const probe: { navigate: NavigateFunction } = { navigate: () => {} };

function NavigateProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    probe.navigate = navigate;
  }, [navigate]);
  return null;
}

function Shell() {
  const { pathname } = useLocation();
  return createElement(
    "div",
    null,
    createElement(RouteTransition, {
      children: (location: Location) =>
        createElement(
          Routes,
          { location },
          ...PATHS.map((p) => createElement(Route, { key: p, path: p, element: createElement("p", null, p) })),
        ),
    }),
    createElement(BottomNavDock, { show: isTabRoot(pathname) }),
    createElement(NavigateProbe),
  );
}

async function mount(entries: string[]) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1 }, createElement(Shell)));
  });
}

async function go(to: string | number) {
  await act(async () => {
    if (typeof to === "number") void probe.navigate(to);
    else void probe.navigate(to);
  });
}

const scenes = () => [...container.querySelectorAll<HTMLElement>(".route-scene")];
const sceneOf = (route: string) =>
  [...container.querySelectorAll("p")].find((p) => p.textContent === route)?.parentElement ?? null;
const dock = () => container.querySelector<HTMLElement>(".nav-dock");

async function animationEnd(el: Element | null) {
  if (!el) throw new Error("element not found");
  await act(async () => {
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
  });
}

beforeEach(() => {
  motion.reduce = false;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  container.remove();
});

describe("transitionKind", () => {
  it.each([
    ["/shop", "/profile", NavigationType.Push, "tab"],
    ["/profile", "/shop", NavigationType.Pop, "tab"],
    ["/shop", "/shop/wraith", NavigationType.Push, "push"],
    ["/profile", "/settings", NavigationType.Push, "push"],
    ["/settings", "/profile/edit", NavigationType.Push, "push"],
    ["/shop/wraith", "/shop", NavigationType.Pop, "pop"],
    ["/settings", "/profile", NavigationType.Replace, "pop"],
    ["/shop/wraith", "/shop", NavigationType.Push, "pop"],
    ["/profile/edit", "/settings", NavigationType.Pop, "pop"],
  ] as const)("%s -> %s (%s) is a %s", (from, to, nav, kind) => {
    expect(transitionKind(from, to, nav)).toBe(kind);
  });
});

describe("RouteTransition keeps the outgoing screen until it has animated out", () => {
  it("pushes Skin Details over a Shop that is still on screen, then drops the Shop", async () => {
    await mount(["/shop"]);
    const shop = sceneOf("/shop");
    await go("/shop/wraith");

    expect(scenes()).toHaveLength(2);
    // The same Shop element: it was kept mounted, not re-created.
    expect(sceneOf("/shop")).toBe(shop);
    expect(shop?.className).toBe("route-scene route-exit-push");
    expect(shop?.hasAttribute("inert")).toBe(true);
    expect(shop?.getAttribute("aria-hidden")).toBe("true");
    expect(sceneOf("/shop/wraith")?.className).toBe("route-scene route-enter-push");

    // A child's animation ending must not cut the Shop's own exit short.
    await animationEnd(shop?.querySelector("p") ?? null);
    expect(scenes()).toHaveLength(2);

    await animationEnd(shop);
    expect(scenes()).toHaveLength(1);
    expect(sceneOf("/shop")).toBeNull();
    expect(sceneOf("/shop/wraith")?.className).toBe("route-scene route-enter-push");
  });

  it("pops back with the Shop sliding in under the leaving Skin Details", async () => {
    await mount(["/shop", "/shop/wraith"]);
    await go(-1);
    expect(sceneOf("/shop/wraith")?.className).toBe("route-scene route-exit-pop");
    expect(sceneOf("/shop")?.className).toBe("route-scene route-enter-pop");
  });

  it("cross-fades between tabs", async () => {
    await mount(["/shop"]);
    await go("/profile");
    expect(sceneOf("/shop")?.className).toBe("route-scene route-exit-tab");
    expect(sceneOf("/profile")?.className).toBe("route-scene route-enter-tab");
  });

  it("only ever keeps one outgoing screen when taps come faster than the animation", async () => {
    await mount(["/"]);
    await go("/shop");
    await go("/profile");
    await go("/settings");
    expect(scenes().map((s) => s.textContent)).toEqual(["/profile", "/settings"]);
  });

  it("does not replay or remount when the same tab is tapped again", async () => {
    await mount(["/shop"]);
    const shop = sceneOf("/shop");
    await go("/shop");
    expect(scenes()).toHaveLength(1);
    expect(sceneOf("/shop")).toBe(shop);
    expect(shop?.className).toBe("route-scene route-enter-initial");
  });

  it("swaps screens with nothing left behind under reduced motion", async () => {
    motion.reduce = true;
    await mount(["/shop"]);
    await go("/shop/wraith");
    expect(scenes().map((s) => s.textContent)).toEqual(["/shop/wraith"]);
  });

  it("drops the outgoing screen on its own if animationend never arrives", async () => {
    vi.useFakeTimers();
    try {
      await mount(["/shop"]);
      await go("/shop/wraith");
      expect(scenes()).toHaveLength(2);
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(scenes().map((s) => s.textContent)).toEqual(["/shop/wraith"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("BottomNavDock", () => {
  it("slides the tab bar away with a pushed screen, still marking the tab it left", async () => {
    await mount(["/shop"]);
    expect(dock()?.className).toBe("nav-dock nav-dock-in");
    await go("/shop/wraith");

    const leaving = dock();
    expect(leaving?.className).toBe("nav-dock nav-dock-out");
    expect(leaving?.hasAttribute("inert")).toBe(true);
    expect(leaving?.querySelector("[aria-current=page]")?.getAttribute("aria-label")).toBe("Shop");

    await animationEnd(leaving);
    expect(dock()).toBeNull();
  });

  it("slides the tab bar back in on the way back to the tab", async () => {
    await mount(["/shop", "/shop/wraith"]);
    expect(dock()).toBeNull();
    await go(-1);
    expect(dock()?.className).toBe("nav-dock nav-dock-in");
    expect(dock()?.hasAttribute("inert")).toBe(false);
  });

  it("stays put between tabs", async () => {
    await mount(["/shop"]);
    const bar = dock();
    await go("/profile");
    expect(dock()).toBe(bar);
    expect(bar?.className).toBe("nav-dock nav-dock-in");
    expect(bar?.querySelector("[aria-current=page]")?.getAttribute("aria-label")).toBe("Profile");
  });

  it("goes at once under reduced motion", async () => {
    motion.reduce = true;
    await mount(["/shop"]);
    await go("/shop/wraith");
    expect(dock()).toBeNull();
  });
});
