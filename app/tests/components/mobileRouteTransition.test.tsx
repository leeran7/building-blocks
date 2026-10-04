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
import { PageSwap } from "../../mobile/src/components/PageSwap";
import { isGameRoute } from "../../mobile/src/lib/navigation";

const PATHS = ["/", "/shop", "/shop/wraith", "/profile", "/settings", "/climb", "/levels/3/play", "/levels/4/play"];
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

/** Guest mode has no tab bar, so its RouteTransition takes no tab swipes. */
let tabSwipe = true;

function Shell() {
  const { pathname } = useLocation();
  return createElement(
    "div",
    null,
    createElement(RouteTransition, {
      tabSwipe,
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
  tabSwipe = true;
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
    ["/profile", "/profile/avatar", NavigationType.Push, "hero"],
    ["/profile", "/profile/edit", NavigationType.Push, "hero"],
    ["/profile/edit", "/profile/avatar", NavigationType.Push, "hero"],
    ["/settings", "/profile/avatar", NavigationType.Push, "push"],
    ["/profile/avatar", "/profile/edit", NavigationType.Push, "push"],
    ["/profile/avatar", "/profile", NavigationType.Pop, "pop"],
    ["/profile", "/settings", NavigationType.Push, "push"],
    ["/settings", "/profile/edit", NavigationType.Push, "push"],
    ["/shop/wraith", "/shop", NavigationType.Pop, "pop"],
    ["/settings", "/profile", NavigationType.Replace, "pop"],
    ["/shop/wraith", "/shop", NavigationType.Push, "pop"],
    ["/profile/edit", "/settings", NavigationType.Pop, "pop"],
    ["/", "/climb", NavigationType.Push, "launch"],
    ["/", "/levels/3/play", NavigationType.Push, "launch"],
    ["/challenge", "/duel/abc", NavigationType.Push, "launch"],
    ["/levels/3/play", "/levels/4/play", NavigationType.Replace, "launch"],
    ["/climb", "/", NavigationType.Pop, "land"],
    ["/levels/3/play", "/", NavigationType.Replace, "land"],
    ["/tutorial", "/", NavigationType.Replace, "land"],
    ["/climb", "/leaderboard", NavigationType.Replace, "land"],
  ] as const)("%s -> %s (%s) is a %s", (from, to, nav, kind) => {
    expect(transitionKind(from, to, nav)).toBe(kind);
  });
});

describe("scene motion", () => {
  const base = { from: 1 as const, swiped: false, swipeVelocity: 0, reduce: false };
  it("pushes in from the right and pops in from the left, both fading up", () => {
    expect(sceneEnterFrom({ ...base, kind: "push" })).toMatchObject({ opacity: 0, x: 56 });
    expect(sceneEnterFrom({ ...base, kind: "pop" })).toMatchObject({ opacity: 0, x: -40 });
    expect(sceneEnterFrom({ ...base, kind: "initial" })).toEqual({ opacity: 0, y: 8, scale: 0.985 });
  });

  it("sends the old screen the other way, gone before the new one is in", () => {
    const push = sceneExitTo({ ...base, kind: "push" });
    expect(push).toMatchObject({ opacity: 0, x: -24 });
    expect(sceneExitTo({ ...base, kind: "pop" })).toMatchObject({ opacity: 0, x: 32 });
    const exitS = (push.transition as { duration: number }).duration;
    const fade = (sceneRest({ ...base, kind: "push" }).transition as { opacity: { delay: number; duration: number } }).opacity;
    expect(exitS).toBeLessThan(fade.delay + fade.duration);
  });

  it("carries a swiped-away screen on off the right edge at the finger's speed, the one behind fading in at once", () => {
    const swiped = { ...base, kind: "pop" as const, from: -1 as const, swiped: true, swipeVelocity: 1200 };
    const exit = sceneExitTo(swiped);
    expect(exit).toMatchObject({ x: window.innerWidth, transition: { velocity: 1200 } });
    // It stays solid on its way out: the screen behind is what fades.
    expect(exit).not.toHaveProperty("opacity");
    const fade = (sceneRest(swiped).transition as { opacity: { delay: number } }).opacity;
    expect(fade.delay).toBe(0);
    expect(sceneEnterFrom(swiped)).toMatchObject({ opacity: 0, x: -40 });
    expect(sceneExitTo({ ...swiped, reduce: true })).toEqual({ opacity: 0, transition: { duration: 0 } });
  });

  it("zooms a run up into place while the screen behind sinks back, and reverses it on the way out", () => {
    expect(sceneEnterFrom({ ...base, kind: "launch" })).toEqual({ opacity: 0, scale: 1.06 });
    expect(sceneExitTo({ ...base, kind: "launch" })).toMatchObject({ opacity: 0, scale: 0.96 });
    expect(sceneEnterFrom({ ...base, kind: "land" })).toEqual({ opacity: 0, scale: 0.96 });
    expect(sceneExitTo({ ...base, kind: "land" })).toMatchObject({ opacity: 0, scale: 1.06 });
    expect(sceneRest({ ...base, kind: "launch" })).toMatchObject({ opacity: 1, scale: 1 });
    expect(sceneEnterFrom({ ...base, kind: "launch", reduce: true })).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
  });

  it("slides tabs in from their side of the bar and the old tab the other way", () => {
    expect(sceneEnterFrom({ ...base, kind: "tab", from: 1 })).toEqual({ opacity: 0, x: 56 });
    expect(sceneEnterFrom({ ...base, kind: "tab", from: -1 })).toEqual({ opacity: 0, x: -56 });
    expect(sceneExitTo({ ...base, kind: "tab", from: 1 })).toMatchObject({ opacity: 0, x: -24 });
    expect(sceneExitTo({ ...base, kind: "tab", from: -1 })).toMatchObject({ opacity: 0, x: 24 });
  });

  it("carries a tab swiped leftwards on off the left edge at the finger's speed", () => {
    const exit = sceneExitTo({ ...base, kind: "tab", from: 1, swiped: true, swipeVelocity: -900 });
    expect(exit).toMatchObject({ x: -window.innerWidth, transition: { velocity: -900 } });
  });

  it("moves nothing under reduced motion", () => {
    const reduced = { ...base, kind: "push" as const, reduce: true };
    expect(sceneEnterFrom(reduced)).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
    expect(sceneRest(reduced).transition).toEqual({ duration: 0 });
    expect(sceneExitTo(reduced).transition).toEqual({ duration: 0 });
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

function touch(target: Element, type: string, clientX: number, clientY = 300) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX, clientY }] });
  target.dispatchEvent(event);
}

describe("swipe-back", () => {
  it("steps back the moment the finger lets go, the swiped screen leaving beside the one behind", async () => {
    await mount(["/profile", "/settings", "/shop/wraith"]);
    const scene = sceneOf("/shop/wraith");
    if (!scene) throw new Error("scene not found");
    for (const [type, x] of [["touchstart", 4], ["touchmove", 30], ["touchmove", 380], ["touchend", 0]] as const) {
      await act(async () => {
        touch(scene, type, x);
      });
    }
    // No wait for a slide to finish first: the screen behind is entering already.
    expect(sceneOf("/settings")?.dataset.routeRole).toBe("enter");
    expect(sceneOf("/shop/wraith")?.dataset.routeRole).toBe("exit");
    expect(sceneOf("/shop/wraith")?.dataset.routeKind).toBe("pop");
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/settings"]);
  });

  it("tells the screen it lands on that it was popped to, and a pushed one that it was not", async () => {
    await mount(["/shop", "/shop/wraith"]);
    expect(sceneOf("/shop/wraith")?.dataset.routeKind).toBe("initial");
    await go(-1);
    expect(sceneOf("/shop")?.dataset.routeKind).toBe("pop");
    await settle();
    await go("/shop/wraith");
    expect(sceneOf("/shop/wraith")?.dataset.routeKind).toBe("hero");
  });
});

async function drag(scene: Element, points: Array<[number, number?]>) {
  const [first, ...rest] = points;
  await act(async () => {
    touch(scene, "touchstart", first[0], first[1]);
  });
  for (const [x, y] of rest) {
    await act(async () => {
      touch(scene, "touchmove", x, y);
    });
  }
  await act(async () => {
    touch(scene, "touchend", 0);
  });
}

describe("sideways between tabs", () => {
  it("swipes from Play to the Shop on its right, the Shop sliding in from the right", async () => {
    await mount(["/"]);
    await settle();
    const play = sceneOf("/");
    if (!play) throw new Error("scene not found");
    await drag(play, [[300], [290], [120]]);
    expect(play.dataset.routeRole).toBe("exit");
    expect(play.dataset.routeKind).toBe("tab");
    expect(sceneOf("/shop")?.dataset.routeRole).toBe("enter");
    expect(sceneOf("/shop")?.dataset.routeFrom).toBe("1");
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/shop"]);
  });

  it("swipes back from the Shop to Play on its left", async () => {
    await mount(["/shop"]);
    await settle();
    const shop = sceneOf("/shop");
    if (!shop) throw new Error("scene not found");
    await drag(shop, [[80], [90], [260]]);
    expect(sceneOf("/")?.dataset.routeRole).toBe("enter");
    expect(sceneOf("/")?.dataset.routeFrom).toBe("-1");
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/"]);
  });

  it("slides tapped tabs by their place in the bar too", async () => {
    await mount(["/profile"]);
    await settle();
    await go("/");
    expect(sceneOf("/")?.dataset.routeFrom).toBe("-1");
    await settle();
    await go("/profile");
    expect(sceneOf("/profile")?.dataset.routeFrom).toBe("1");
  });

  it("springs back from a short drag, from past the last tab, and from a mostly vertical move", async () => {
    await mount(["/profile"]);
    await settle();
    const profile = sceneOf("/profile");
    if (!profile) throw new Error("scene not found");
    // Short: under a third of the way, slowly.
    await drag(profile, [[200], [195], [170]]);
    await settle();
    // Profile is the last tab: there is nothing to its right.
    await drag(profile, [[300], [290], [40]]);
    await settle();
    // Scrolling: the finger moves mostly down (and a little toward the Shop).
    await drag(profile, [[120, 300], [128, 310], [300, 600]]);
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/profile"]);
  });

  it("gives a little past the last tab instead of following the finger", async () => {
    await mount(["/profile"]);
    await settle();
    const profile = sceneOf("/profile");
    if (!profile) throw new Error("scene not found");
    await act(async () => {
      touch(profile, "touchstart", 300);
    });
    for (const x of [290, 100]) {
      await act(async () => {
        touch(profile, "touchmove", x);
      });
    }
    // 200px of finger, 60px of screen.
    expect(profile.style.transform).toContain("translateX(-60px)");
    await act(async () => {
      touch(profile, "touchend", 0);
    });
  });

  it("leaves tabs to their own taps where there is no tab bar", async () => {
    tabSwipe = false;
    await mount(["/"]);
    await settle();
    const play = sceneOf("/");
    if (!play) throw new Error("scene not found");
    await drag(play, [[300], [290], [120]]);
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/"]);
  });
});

describe("a swipe still in progress when its screen starts leaving", () => {
  it("lets the screen leave and never steps back a second time", async () => {
    await mount(["/profile", "/settings", "/shop/wraith"]);
    const scene = sceneOf("/shop/wraith");
    if (!scene) throw new Error("scene not found");
    for (const [type, x] of [["touchstart", 4], ["touchmove", 30], ["touchmove", 380]] as const) {
      await act(async () => {
        touch(scene, type, x);
      });
    }
    // Android back lands mid-drag; the finger lifts while the screen is leaving.
    await go(-1);
    await act(async () => {
      touch(scene, "touchend", 0);
    });
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/settings"]);
  });
});

describe("isGameRoute", () => {
  it.each(["/climb", "/tutorial", "/levels/3/play", "/levels/12/play", "/duel/abc"])("treats %s as a full-screen run", (p) => {
    expect(isGameRoute(p)).toBe(true);
  });
  it.each(["/", "/levels", "/levels/3", "/levels/x/play", "/levels/3/play/x", "/climbing", "/duel", "/shop/climb"])(
    "treats %s as an ordinary screen",
    (p) => {
      expect(isGameRoute(p)).toBe(false);
    },
  );
});

describe("runs zoom in and out", () => {
  it("sinks the map back as a run zooms in over it, then drops the map", async () => {
    await mount(["/"]);
    await settle();
    const map = sceneOf("/");
    await go("/climb");
    expect(sceneOf("/")).toBe(map);
    expect(map?.dataset.routeRole).toBe("exit");
    expect(map?.dataset.routeKind).toBe("launch");
    expect(map?.hasAttribute("inert")).toBe(true);
    expect(sceneOf("/climb")?.dataset.routeKind).toBe("launch");
    expect(sceneOf("/climb")?.dataset.routeRole).toBe("enter");
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/climb"]);
  });

  it("lifts a finished run away as the map rises back", async () => {
    await mount(["/", "/levels/3/play"]);
    await settle();
    await go(-1);
    expect(sceneOf("/levels/3/play")?.dataset.routeRole).toBe("exit");
    expect(sceneOf("/levels/3/play")?.dataset.routeKind).toBe("land");
    expect(sceneOf("/")?.dataset.routeKind).toBe("land");
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/"]);
  });

  it("leaves a run's left edge to the game: an edge swipe never steps back", async () => {
    await mount(["/", "/climb"]);
    await settle();
    const scene = sceneOf("/climb");
    if (!scene) throw new Error("scene not found");
    for (const [type, x] of [["touchstart", 4], ["touchmove", 30], ["touchmove", 380], ["touchend", 0]] as const) {
      await act(async () => {
        touch(scene, type, x);
      });
    }
    await settle();
    expect(scenes().map((s) => s.textContent)).toEqual(["/climb"]);
    expect(scene.style.transform).not.toContain("translateX");
  });
});

describe("PageSwap", () => {
  let setPage: (p: { page: string; back: boolean }) => void = () => {};
  function Pages() {
    const [state, set] = useState({ page: "options", back: false });
    useEffect(() => {
      setPage = set;
    }, []);
    return createElement(PageSwap, { page: state.page, back: state.back, children: createElement("p", null, state.page) });
  }
  const pages = () => [...container.querySelectorAll<HTMLElement>("[data-page]")];

  it("slides the next page in beside the old one, which is inert until it is gone", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Pages));
    });
    // The first page is just there: no entrance on mount.
    expect(pages().map((p) => p.dataset.pageRole)).toEqual(["enter"]);
    await act(async () => {
      setPage({ page: "email", back: false });
    });
    const old = pages().find((p) => p.dataset.page === "options");
    expect(old?.dataset.pageRole).toBe("exit");
    expect(old?.hasAttribute("inert")).toBe(true);
    expect(pages().find((p) => p.dataset.page === "email")?.dataset.pageRole).toBe("enter");
    await settle();
    expect(pages().map((p) => p.dataset.page)).toEqual(["email"]);
  });

  it("drops the old page straight away under reduced motion", async () => {
    motion.reduce = true;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Pages));
    });
    await act(async () => {
      setPage({ page: "email", back: true });
    });
    await settle(80);
    expect(pages().map((p) => p.dataset.page)).toEqual(["email"]);
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
    // A few frames later it is still there, on its way out, but nothing in it
    // can be pressed any more...
    await settle(80);
    expect(dialog()).not.toBeNull();
    expect(dialog()?.closest("[inert]")).not.toBeNull();
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
