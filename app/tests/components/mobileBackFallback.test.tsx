/**
 * Back from a pushed screen that was opened cold (deep link, notification,
 * universal link) has no in-app entry behind it. The swipe-back gesture
 * (RouteTransition), the Android hardware back button (useNativeShell) and the
 * Challenge header must go to the screen's parent instead of leaving the app,
 * and must still pop normally when there is in-app history. Android back on
 * Home keeps minimising the app.
 *
 * Renders the real components in a MemoryRouter; only Capacitor, auth,
 * haptics, the network and reduced motion are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const shell = vi.hoisted(() => ({
  backButton: null as null | (() => void),
  minimizeApp: vi.fn(async () => {}),
  reduceMotion: true,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "android" },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn((event: string, handler: () => void) => {
      if (event === "backButton") shell.backButton = handler;
      return Promise.resolve({ remove: vi.fn() });
    }),
    minimizeApp: () => shell.minimizeApp(),
  },
}));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: {}, Style: { Dark: "DARK" } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: {} }));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: {} }));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false }),
}));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => shell.reduceMotion }));
/** Empty bodies in the shapes the Challenge screen's sections read. */
function emptyBody(path: string): unknown {
  if (path.startsWith("/api/challenge")) return [];
  if (path.startsWith("/api/friends/requests")) return { incoming: [], outgoing: [] };
  if (path.startsWith("/api/friends")) return { friends: [] };
  return {};
}
vi.mock("../../mobile/src/lib/api", () => ({
  API_BASE: "https://example.test",
  apiFetch: vi.fn(async (path: string) => ({ ok: true, status: 200, json: () => Promise.resolve(emptyBody(path)) }) as Response),
}));

import { RouteTransition } from "../../mobile/src/components/RouteTransition";
import { useNativeShell } from "../../mobile/src/lib/useNativeShell";
import { parentRoute } from "../../mobile/src/lib/navigation";
import { ChallengeScreen } from "../../mobile/src/screens/ChallengeScreen";
import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";

const PUSH_PATHS = ["/leaderboard", "/profile", "/profile/edit", "/profile/avatar", "/challenge", "/climb"];

function LocationProbe() {
  return createElement("output", { "data-testid": "path" }, useLocation().pathname);
}

function NativeShellProbe() {
  useNativeShell();
  const navigate = useNavigate();
  return createElement("button", { type: "button", onClick: () => navigate("/profile/avatar") }, "Open avatar");
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(entries: string[], screen: ReactElement): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: entries, initialIndex: entries.length - 1 },
        screen,
        createElement(LocationProbe),
      ),
    );
  });
}

const path = () => container.querySelector("[data-testid=path]")?.textContent;

/** Every route renders a label inside the real RouteTransition. */
const transitionTree = () =>
  createElement(
    RouteTransition,
    null,
    createElement(
      Routes,
      null,
      ...["/", ...PUSH_PATHS].map((p) => createElement(Route, { key: p, path: p, element: createElement("p", null, p) })),
    ),
  );

function touch(target: Element, type: string, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX, clientY: 300 }] });
  target.dispatchEvent(event);
}

/** A left-edge swipe well past the pop threshold. */
async function swipeBack() {
  const scene = container.querySelector(".route-scene");
  if (!scene) throw new Error("route scene not found");
  await act(async () => {
    touch(scene, "touchstart", 4);
  });
  await act(async () => {
    touch(scene, "touchmove", 30);
  });
  await act(async () => {
    touch(scene, "touchmove", window.innerWidth - 10);
  });
  await act(async () => {
    touch(scene, "touchend", 0);
  });
}

async function pressAndroidBack() {
  const handler = shell.backButton;
  if (!handler) throw new Error("backButton listener not registered");
  await act(async () => {
    handler();
  });
}

beforeEach(() => {
  shell.backButton = null;
  shell.minimizeApp.mockClear();
  shell.reduceMotion = true;
  window.history.replaceState(null, "");
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  container.remove();
});

describe("parentRoute", () => {
  it("maps each pushed screen to the parent its header Back uses, and anything else to Home", () => {
    expect(parentRoute("/profile/edit")).toBe("/profile");
    expect(parentRoute("/profile/avatar")).toBe("/profile");
    expect(parentRoute("/challenge")).toBe("/");
    expect(parentRoute("/leaderboard")).toBe("/");
    expect(parentRoute("/duel/abc")).toBe("/");
    // Inherited object keys are not routes.
    expect(parentRoute("constructor")).toBe("/");
    expect(parentRoute("__proto__")).toBe("/");
  });
});

describe("swipe-back on a pushed screen", () => {
  it.each([
    ["/profile/edit", "/profile"],
    ["/profile/avatar", "/profile"],
    ["/challenge", "/"],
    ["/leaderboard", "/"],
  ])("from a deep-linked %s goes to %s instead of leaving the app", async (from, to) => {
    await mount([from], transitionTree());
    await swipeBack();
    expect(path()).toBe(to);
  });

  it("pops to the previous in-app screen when there is one", async () => {
    await mount(["/leaderboard", "/profile/edit"], transitionTree());
    await swipeBack();
    expect(path()).toBe("/leaderboard");
  });

  it("goes to the parent after the pop animation when motion is allowed", async () => {
    shell.reduceMotion = false;
    await mount(["/profile/edit"], transitionTree());
    await swipeBack();
    expect(path()).toBe("/profile/edit");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(path()).toBe("/profile");
  });
});

describe("Android hardware back", () => {
  it.each([
    ["/profile/edit", "/profile"],
    ["/profile/avatar", "/profile"],
    ["/challenge", "/"],
    ["/profile", "/"],
  ])("from a deep-linked %s goes to %s instead of leaving the app", async (from, to) => {
    await mount([from], createElement(NativeShellProbe));
    await pressAndroidBack();
    expect(path()).toBe(to);
    expect(shell.minimizeApp).not.toHaveBeenCalled();
  });

  it("pops to the previous in-app screen when there is one", async () => {
    await mount(["/leaderboard", "/profile/edit"], createElement(NativeShellProbe));
    await pressAndroidBack();
    expect(path()).toBe("/leaderboard");
  });

  it("uses the current screen's history after an in-app push, not the screen it registered on", async () => {
    await mount(["/profile/edit"], createElement(NativeShellProbe));
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(path()).toBe("/profile/avatar");
    await pressAndroidBack();
    expect(path()).toBe("/profile/edit");
  });

  it("still minimises the app on Home", async () => {
    await mount(["/"], createElement(NativeShellProbe));
    await pressAndroidBack();
    expect(shell.minimizeApp).toHaveBeenCalledTimes(1);
    expect(path()).toBe("/");
  });
});

describe("Challenge header Back", () => {
  const challengeTree = () =>
    createElement(
      AppDataProvider,
      null,
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/challenge", element: createElement(ChallengeScreen) }),
        createElement(Route, { path: "*", element: null }),
      ),
    );

  it("goes Home from a deep-linked Challenge screen", async () => {
    await mount(["/challenge"], challengeTree());
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Back"]')?.click();
    });
    expect(path()).toBe("/");
  });

  it("pops to the previous in-app screen when there is one", async () => {
    await mount(["/leaderboard", "/challenge"], challengeTree());
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Back"]')?.click();
    });
    expect(path()).toBe("/leaderboard");
  });
});
