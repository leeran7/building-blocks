/**
 * The mobile shell's motion system in action. Screens are transparent over the
 * lava backdrop, so the outgoing screen must stay mounted while the next one
 * animates in: unmounting it at once left a frame of bare backdrop between
 * Shop and Skin Details. The tab bar slides away with a pushed screen and
 * back again, its highlight travels between tabs, and every bottom sheet
 * slides away on close as it slid in.
 *
 * Renders the real RouteTransition, BottomNavDock and SheetPortal with real
 * Motion animations (the suite's setup skips them; this file turns them back
 * on). Only haptics and the reduced-motion check are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  NavigationType,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type Location,
  type NavigateFunction,
} from "react-router-dom";
import { AnimatePresence, MotionGlobalConfig } from "motion/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../../mobile/src/lib/haptics", () => ({ tapLight: vi.fn(async () => {}) }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduce }));

import {
  RouteTransition,
  sceneEnterFrom,
  sceneExitTo,
  sceneRest,
  transitionKind,
} from "../../mobile/src/components/RouteTransition";
import { BottomNavDock, isTabRoot } from "../../mobile/src/components/BottomNav";
import { SheetPortal } from "../../mobile/src/components/SheetPortal";

const PATHS = ["/", "/shop", "/shop/wraith", "/profile", "/settings"];
/** Longer than any transition in the system (lib/motionTokens). */
const SETTLE_MS = 900;

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

async function settle(ms = SETTLE_MS) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

const scenes = () => [...container.querySelectorAll<HTMLElement>(".route-scene")];
const sceneOf = (route: string) =>
  [...container.querySelectorAll("p")].find((p) => p.textContent === route)?.closest<HTMLElement>(".route-scene") ?? null;
const dock = () => container.querySelector<HTMLElement>(".nav-dock");

// happy-dom's Web Animations stub rejects every cancelled animation, so let
// Motion fall back to its own frame loop here, as it does on older WebViews.
const realAnimate = Element.prototype.animate;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  delete (Element.prototype as Partial<Element>).animate;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.animate = realAnimate;
});

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
    ["/shop", "/shop/wraith", NavigationType.Push, "hero"],
    ["/profile", "/shop/wraith", NavigationType.Push, "push"],
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

describe("scene motion", () => {
  const base = { swiped: false, reduce: false };
  it("pushes in from the right and pops in from the left, both fading up", () => {
    expect(sceneEnterFrom({ ...base, kind: "push" })).toMatchObject({ opacity: 0, x: 56 });
    expect(sceneEnterFrom({ ...base, kind: "pop" })).toMatchObject({ opacity: 0, x: -40 });
    expect(sceneEnterFrom({ ...base, kind: "tab" })).toEqual({ opacity: 0, y: 8, scale: 0.985 });
  });

  it("sends the old screen the other way, gone before the new one is in", () => {
    const push = sceneExitTo({ ...base, kind: "push" });
    expect(push).toMatchObject({ opacity: 0, x: -24 });
    expect(sceneExitTo({ ...base, kind: "pop" })).toMatchObject({ opacity: 0, x: 32 });
    const exitS = (push.transition as { duration: number }).duration;
    const fade = (sceneRest({ ...base, kind: "push" }).transition as { opacity: { delay: number; duration: number } }).opacity;
    expect(exitS).toBeLessThan(fade.delay + fade.duration);
  });

  it("drops a swiped-away screen at once instead of animating it back", () => {
    expect(sceneExitTo({ ...base, kind: "pop", swiped: true })).toEqual({ opacity: 0, transition: { duration: 0 } });
  });

  it("moves nothing under reduced motion", () => {
    expect(sceneEnterFrom({ kind: "push", swiped: false, reduce: true })).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
    expect(sceneRest({ kind: "push", swiped: false, reduce: true }).transition).toEqual({ duration: 0 });
    expect(sceneExitTo({ kind: "push", swiped: false, reduce: true }).transition).toEqual({ duration: 0 });
  });
});

describe("RouteTransition keeps the outgoing screen until it has animated out", () => {
  it("pushes Skin Details over a Shop that is still on screen, then drops the Shop", async () => {
    await mount(["/shop"]);
    await settle();
    const shop = sceneOf("/shop");
    await go("/shop/wraith");

    expect(scenes()).toHaveLength(2);
    // The same Shop element: it was kept mounted, not re-created.
    expect(sceneOf("/shop")).toBe(shop);
    expect(shop?.dataset.routeRole).toBe("exit");
    expect(shop?.dataset.routeKind).toBe("hero");
    expect(shop?.hasAttribute("inert")).toBe(true);
    expect(shop?.getAttribute("aria-hidden")).toBe("true");
    expect(sceneOf("/shop/wraith")?.dataset.routeRole).toBe("enter");

    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/shop/wraith"]);
  });

  it("pops back with the leaving Skin Details marked as a pop", async () => {
    await mount(["/shop", "/shop/wraith"]);
    await go(-1);
    expect(sceneOf("/shop/wraith")?.dataset.routeRole).toBe("exit");
    expect(sceneOf("/shop/wraith")?.dataset.routeKind).toBe("pop");
    expect(sceneOf("/shop")?.dataset.routeRole).toBe("enter");
  });

  it("cross-fades between tabs", async () => {
    await mount(["/shop"]);
    // Let the Shop finish fading in: one still at opacity 0 has nothing to fade out.
    await settle();
    await go("/profile");
    expect(sceneOf("/shop")?.dataset.routeKind).toBe("tab");
    expect(sceneOf("/shop")?.dataset.routeRole).toBe("exit");
    expect(sceneOf("/profile")?.dataset.routeRole).toBe("enter");
  });

  it("does not replay or remount when the same tab is tapped again", async () => {
    await mount(["/shop"]);
    const shop = sceneOf("/shop");
    await go("/shop");
    expect(scenes()).toHaveLength(1);
    expect(sceneOf("/shop")).toBe(shop);
  });

  it("drops the old screen straight away under reduced motion", async () => {
    motion.reduce = true;
    await mount(["/shop"]);
    await go("/shop/wraith");
    await settle(80);
    expect(scenes().map((s) => s.textContent)).toEqual(["/shop/wraith"]);
  });
});

function touch(target: Element, type: string, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX, clientY: 300 }] });
  target.dispatchEvent(event);
}

describe("swipe-back racing another back", () => {
  it("steps back once when Back is pressed while the swiped screen is still sliding away", async () => {
    await mount(["/profile", "/settings", "/shop/wraith"]);
    const scene = sceneOf("/shop/wraith");
    if (!scene) throw new Error("scene not found");
    for (const [type, x] of [["touchstart", 4], ["touchmove", 30], ["touchmove", 380], ["touchend", 0]] as const) {
      await act(async () => {
        touch(scene, type, x);
      });
    }
    // Header Back (or Android back) lands before the swipe's own delayed back.
    await go(-1);
    expect(sceneOf("/settings")).not.toBeNull();
    await settle(300);
    expect(sceneOf("/settings")?.dataset.routeRole).toBe("enter");
    expect(sceneOf("/profile")).toBeNull();
  });
});

describe("BottomNavDock", () => {
  it("slides the tab bar away with a pushed screen, still marking the tab it left", async () => {
    await mount(["/shop"]);
    expect(dock()?.dataset.dock).toBe("in");
    await go("/shop/wraith");

    const leaving = dock();
    expect(leaving?.dataset.dock).toBe("out");
    // Lifted out of the layout so the pushed screen has its full height at once.
    expect(leaving?.classList.contains("nav-dock-out")).toBe(true);
    expect(leaving?.hasAttribute("inert")).toBe(true);
    expect(leaving?.querySelector("[aria-current=page]")?.getAttribute("aria-label")).toBe("Shop");

    await settle();
    expect(dock()).toBeNull();
  });

  it("slides the tab bar back in on the way back to the tab", async () => {
    await mount(["/shop", "/shop/wraith"]);
    expect(dock()).toBeNull();
    await go(-1);
    expect(dock()?.dataset.dock).toBe("in");
    expect(dock()?.hasAttribute("inert")).toBe(false);
  });

  it("stays put between tabs, with one highlight that moves to the new tab", async () => {
    await mount(["/shop"]);
    const bar = dock();
    await go("/profile");
    expect(dock()).toBe(bar);
    const highlights = bar?.querySelectorAll("[data-tab-highlight]") ?? [];
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.closest("button")?.getAttribute("aria-label")).toBe("Profile");
  });
});

describe("SheetPortal", () => {
  let close: () => void = () => {};
  function Host() {
    const [open, setOpen] = useState(true);
    useEffect(() => {
      close = () => setOpen(false);
    }, []);
    return createElement(
      AnimatePresence,
      null,
      open
        ? createElement(SheetPortal, {
            key: "sheet",
            scrim: createElement("button", { type: "button", "data-scrim": true }),
            children: createElement("section", { role: "dialog", "data-panel": true }, "Gem packs"),
          })
        : null,
    );
  }

  it("slides the sheet away when it is closed from a button, not just from a swipe", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Host));
    });
    const dialog = () => document.body.querySelector("[data-panel]");
    expect(dialog()).not.toBeNull();

    await act(async () => close());
    // A few frames later it is still there, on its way out...
    await settle(80);
    expect(dialog()).not.toBeNull();
    // ...and gone once it has slid off.
    await settle();
    expect(dialog()).toBeNull();
  });

  it("animates a wrapper, never the panel the swipe gesture drags", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Host));
    });
    const panel = document.body.querySelector<HTMLElement>("[data-panel]");
    const wrapper = document.body.querySelector<HTMLElement>("[data-sheet-motion]");
    expect(panel?.parentElement).toBe(wrapper);
    await settle(80);
    expect(wrapper?.style.transform).not.toBe("");
    expect(panel?.style.transform).toBe("");
  });
});
