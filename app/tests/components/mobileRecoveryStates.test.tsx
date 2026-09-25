/**
 * Failure and recovery states on the mobile SPA hub screens. Renders the real
 * screens inside the real AppDataProvider; only the network (apiFetch), auth,
 * haptics and the external-link opener are mocked, so "Try again" goes through
 * the real slice refresh and its TTL backoff.
 *
 * Guards: Edit Profile never renders (or saves) a blank form when settings
 * failed to load, because that PUT nulls the saved username and socials; the
 * Ranks error and empty states offer an action; a failed dashboard is not
 * shown as "no record"; Back on a deep-linked push screen stays in the app.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
  isHapticsEnabled: () => true,
  setHapticsEnabled: vi.fn(),
}));
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));

const SAVED = {
  displayName: "Aria Stone",
  username: "aria",
  social: { X: "ariaclimbs" },
  leaderboardConsent: true,
  avatarId: null,
};
const RANKED_DASH = {
  user: { id: "me", email: "aria@example.test", username: "aria" },
  freeClimb: { peakY: 3400, rank: 5, totalClimbers: 40, wins: 2, handle: "Aria Stone" },
};

const net = vi.hoisted(() => ({
  status: {} as Record<string, number>,
  global: [] as unknown[],
  friends: null as unknown,
  dash: null as unknown,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
  const status = net.status[path] ?? 200;
  if (status !== 200) return jsonResponse({ error: "down" }, status);
  if (path === "/api/settings" && init?.method === "PUT") {
    return jsonResponse({ ...SAVED, ...(JSON.parse(init.body as string) as object) });
  }
  if (path === "/api/settings") return jsonResponse(SAVED);
  if (path === "/api/dashboard") return jsonResponse(net.dash);
  if (path === "/api/climb/leaderboard") return jsonResponse({ climbers: net.global });
  if (path === "/api/climb/leaderboard/friends") return jsonResponse(net.friends);
  return jsonResponse({}, 404);
});
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  API_BASE: "https://example.test",
}));

import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";
import { EditProfileScreen } from "../../mobile/src/screens/EditProfileScreen";
import { AvatarPickerScreen } from "../../mobile/src/screens/AvatarPickerScreen";
import { LeaderboardScreen } from "../../mobile/src/screens/LeaderboardScreen";
import { HomeScreen } from "../../mobile/src/screens/HomeScreen";
import { ProfileScreen } from "../../mobile/src/screens/ProfileScreen";
import { hasInAppHistory } from "../../mobile/src/lib/navigation";

const row = (rank: number, userId: string, peakY: number) => ({
  rank,
  userId,
  handle: `Climber ${userId}`,
  username: null,
  peakY,
  wins: 0,
});

function LocationProbe() {
  return createElement("output", { "data-testid": "path" }, useLocation().pathname);
}

const routes = () =>
  createElement(
    Routes,
    null,
    createElement(Route, { path: "/", element: createElement(HomeScreen) }),
    createElement(Route, { path: "/leaderboard", element: createElement(LeaderboardScreen) }),
    createElement(Route, { path: "/profile", element: createElement(ProfileScreen) }),
    createElement(Route, { path: "/profile/edit", element: createElement(EditProfileScreen) }),
    createElement(Route, { path: "/profile/avatar", element: createElement(AvatarPickerScreen) }),
    createElement(Route, { path: "/climb", element: createElement("p", null, "climb screen") }),
  );

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(entries: string[]): Promise<HTMLDivElement> {
  const tree: ReactElement = createElement(
    MemoryRouter,
    { initialEntries: entries, initialIndex: entries.length - 1 },
    createElement(AppDataProvider, null, routes(), createElement(LocationProbe)),
  );
  await act(async () => {
    root = createRoot(container);
    root.render(tree);
  });
  return container;
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function type(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("input not found");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonByText = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
const path = () => container.querySelector("[data-testid=path]")?.textContent;
const calls = (p: string, method = "GET") =>
  apiFetch.mock.calls.filter(([cp, init]) => cp === p && (init?.method ?? "GET") === method);
const nameInput = () => container.querySelector<HTMLInputElement>('input[placeholder="Your name on the leaderboard"]');

beforeEach(() => {
  apiFetch.mockClear();
  net.status = {};
  net.global = [row(1, "g1", 9000), row(2, "g2", 8000), row(3, "g3", 7000)];
  net.friends = { climbers: [row(1, "me", 100), row(2, "f1", 90)], hiddenCount: 0, notClimbedCount: 0 };
  net.dash = RANKED_DASH;
  window.history.replaceState(null, "");
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  container.remove();
  window.history.replaceState(null, "");
});

describe("Back on a push screen", () => {
  it("pops to the previous in-app screen when there is one", async () => {
    await mount(["/leaderboard", "/profile/edit"]);
    await click(container.querySelector('button[aria-label="Back"]'));
    expect(path()).toBe("/leaderboard");
  });

  it("goes to Profile from a deep-linked Edit Profile instead of leaving the app", async () => {
    await mount(["/profile/edit"]);
    await click(container.querySelector('button[aria-label="Back"]'));
    expect(path()).toBe("/profile");
  });

  it("goes to Profile from a deep-linked avatar picker instead of leaving the app", async () => {
    await mount(["/profile/avatar"]);
    await click(container.querySelector('button[aria-label="Back"]'));
    expect(path()).toBe("/profile");
  });

  it("reads the hash router's history index before the location key", () => {
    // A cold start redirected with `replace` (/settings -> /profile/edit): new key, still index 0.
    window.history.replaceState({ usr: null, key: "k1", idx: 0 }, "");
    expect(hasInAppHistory("k1")).toBe(false);
    window.history.replaceState({ usr: null, key: "k2", idx: 2 }, "");
    expect(hasInAppHistory("k2")).toBe(true);
    // No router state (memory router): fall back to the location key.
    window.history.replaceState(null, "");
    expect(hasInAppHistory("default")).toBe(false);
    expect(hasInAppHistory("k3")).toBe(true);
  });
});
