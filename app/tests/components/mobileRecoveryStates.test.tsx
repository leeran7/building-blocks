/**
 * Failure and recovery states on the mobile SPA hub screens. Renders the real
 * screens inside the real AppDataProvider; only the network (apiFetch), auth,
 * haptics and the external-link opener are mocked, so "Try again" goes through
 * the real slice refresh and its TTL backoff.
 *
 * Guards: Edit Profile never renders (or saves) a blank form when settings
 * failed to load, because that PUT nulls the saved username and socials; the
 * Ranks error and empty states offer an action; a failed dashboard is not
 * shown as "no record"; Back on a deep-linked push screen stays in the app;
 * Try again keeps focus across a retry that fails again; one Try again is one
 * request.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, useLayoutEffect, type ReactElement } from "react";
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
  /** The next GET to this path stays pending until `release` is called. */
  gate: null as string | null,
  release: null as ((r: Response) => void) | null,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
  if (net.gate === path && (init?.method ?? "GET") === "GET") {
    net.gate = null;
    return new Promise<Response>((resolve) => {
      net.release = resolve;
    });
  }
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

import { AppDataProvider, useDashboard } from "../../mobile/src/contexts/AppDataContext";
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

async function mount(entries: string[], extra: ReactElement | null = null): Promise<HTMLDivElement> {
  const tree: ReactElement = createElement(
    MemoryRouter,
    { initialEntries: entries, initialIndex: entries.length - 1 },
    createElement(AppDataProvider, null, routes(), createElement(LocationProbe), extra),
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
  net.gate = null;
  net.release = null;
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

describe("Edit Profile when settings fail to load", () => {
  it("shows the error and Try again instead of a form, and sends no PUT", async () => {
    net.status["/api/settings"] = 500;
    await mount(["/profile", "/profile/edit"]);

    expect(container.textContent).toContain("Couldn't load your profile");
    expect(buttonByText("Try again")).toBeTruthy();
    expect(buttonByText("Save changes")).toBeUndefined();
    expect(nameInput()).toBeNull();
    expect(container.querySelector('input[aria-label="X handle"]')).toBeNull();
    expect(calls("/api/settings", "PUT")).toHaveLength(0);
  });

  it("Try again refetches now (inside the TTL) and seeds the form from the saved settings", async () => {
    net.status["/api/settings"] = 500;
    await mount(["/profile", "/profile/edit"]);
    expect(calls("/api/settings")).toHaveLength(1);

    net.status["/api/settings"] = 200;
    await click(buttonByText("Try again"));

    expect(calls("/api/settings")).toHaveLength(2);
    expect(nameInput()?.value).toBe(SAVED.displayName);
    expect(container.querySelector<HTMLInputElement>('input[placeholder="yourhandle"]')?.value).toBe(SAVED.username);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="X handle"]')?.value).toBe("ariaclimbs");
    expect(buttonByText("Save changes")?.disabled).toBe(true);
    expect(calls("/api/settings", "PUT")).toHaveLength(0);
  });

  it("still saves on the happy path, keeping the saved username and socials", async () => {
    await mount(["/profile", "/profile/edit"]);
    type(nameInput(), "Aria Summit");
    await click(buttonByText("Save changes"));

    const puts = calls("/api/settings", "PUT");
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0][1]?.body as string)).toEqual({
      displayName: "Aria Summit",
      username: "aria",
      social: { X: "ariaclimbs" },
    });
  });
});

async function releaseHeld(status: number, body: unknown = { error: "down" }) {
  const release = net.release;
  if (!release) throw new Error("no held request");
  net.release = null;
  await act(async () => {
    release(jsonResponse(body, status));
  });
}

describe.each([
  ["Edit Profile", "/profile/edit"],
  ["the avatar picker", "/profile/avatar"],
])("Try again on %s when settings fail to load", (_screen, screenPath) => {
  it("keeps focus on Try again through a retry that fails again, and announces the failure", async () => {
    net.status["/api/settings"] = 500;
    await mount(["/profile", screenPath]);
    const button = buttonByText("Try again");
    button?.focus();
    expect(document.activeElement).toBe(button);
    const firstAlert = container.querySelector('[role="alert"]');
    expect(firstAlert?.textContent).toContain("Couldn't load your profile");

    net.gate = "/api/settings";
    await click(button);

    // In flight: the same button, busy, still focused; no skeleton swapped in.
    expect(button?.isConnected).toBe(true);
    expect(button?.textContent).toBe("Retrying…");
    expect(button?.getAttribute("aria-busy")).toBe("true");
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    // Not `disabled`: a real browser moves focus off a disabled button to
    // <body>. happy-dom does not, so the activeElement check alone misses it.
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(container.querySelector('[aria-busy="true"][role="status"]')).toBeNull();

    // A second tap while busy neither refetches nor ends the busy state.
    await click(button);
    expect(calls("/api/settings")).toHaveLength(2);
    expect(button?.textContent).toBe("Retrying…");

    await releaseHeld(500);

    expect(button?.isConnected).toBe(true);
    expect(button?.textContent).toBe("Try again");
    expect(button?.getAttribute("aria-busy")).toBe("false");
    expect(document.activeElement).toBe(button);
    // The alert re-mounts, so assistive tech hears the failure again.
    const secondAlert = container.querySelector('[role="alert"]');
    expect(secondAlert?.textContent).toContain("Couldn't load your profile");
    expect(secondAlert).not.toBe(firstAlert);
    expect(firstAlert?.isConnected).toBe(false);
  });

  it("shows the screen once a held retry succeeds", async () => {
    net.status["/api/settings"] = 500;
    await mount(["/profile", screenPath]);
    net.gate = "/api/settings";
    await click(buttonByText("Try again"));
    await releaseHeld(200, SAVED);

    expect(buttonByText("Try again")).toBeUndefined();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
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

describe("Ranks error and empty states", () => {
  it("Try again on a failed Global board refetches it", async () => {
    net.status["/api/climb/leaderboard"] = 500;
    await mount(["/leaderboard"]);
    expect(container.textContent).toContain("Couldn't load the leaderboard");
    const before = calls("/api/climb/leaderboard").length;

    net.status["/api/climb/leaderboard"] = 200;
    await click(buttonByText("Try again"));

    expect(calls("/api/climb/leaderboard").length).toBe(before + 1);
    expect(container.textContent).not.toContain("Couldn't load the leaderboard");
    expect(container.textContent).toContain("Climber g1");
  });

  it("Try again on a failed Friends board refetches only the Friends board", async () => {
    net.status["/api/climb/leaderboard/friends"] = 500;
    await mount(["/leaderboard"]);
    await click(container.querySelector("#lb-tab-friends"));
    expect(container.textContent).toContain("Couldn't load the leaderboard");
    const globalBefore = calls("/api/climb/leaderboard").length;

    net.status["/api/climb/leaderboard/friends"] = 200;
    await click(buttonByText("Try again"));

    expect(calls("/api/climb/leaderboard/friends")).toHaveLength(2);
    expect(calls("/api/climb/leaderboard").length).toBe(globalBefore);
    expect(container.textContent).toContain("Climber f1");
  });

  it("an empty Global board offers Play, which opens the climb", async () => {
    net.global = [];
    await mount(["/leaderboard"]);
    expect(container.textContent).toContain("No climbs yet. Be the first to the top.");
    await click(buttonByText("Play"));
    expect(path()).toBe("/climb");
  });
});

describe("dashboard failure is not 'no record'", () => {
  it("Home's Best card shows a dash, not Unranked, when the dashboard fails", async () => {
    net.status["/api/dashboard"] = 500;
    await mount(["/"]);
    const best = container.querySelector('[aria-live="polite"]');
    expect(best?.textContent).toContain("Couldn't load your best climb");
    expect(best?.textContent).not.toContain("Unranked");
  });

  it("Home still says Unranked for a player with no record", async () => {
    net.dash = { ...RANKED_DASH, freeClimb: null };
    await mount(["/"]);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("Unranked");
  });

  it("Profile says it couldn't load the climb, and Try again loads it", async () => {
    net.status["/api/dashboard"] = 500;
    await mount(["/profile"]);
    expect(container.textContent).toContain("Couldn't load your climb");
    expect(container.textContent).not.toContain("No climbs yet");

    net.status["/api/dashboard"] = 200;
    await click(buttonByText("Try again"));

    expect(calls("/api/dashboard")).toHaveLength(2);
    expect(container.textContent).not.toContain("Couldn't load your climb");
    expect(container.querySelector('[aria-label="Best climb"]')?.textContent).toContain("3,400");
  });

  it("one Try again sends one GET even when the failure lands before the effects flush", async () => {
    // Settles the held retry during the commit that shows it loading, so the
    // failure (and the in-flight flag reset) lands before that commit's
    // effects run with their "never fetched" slice, as a fast 500 can.
    function SettleOnLoadingCommit() {
      const dash = useDashboard();
      useLayoutEffect(() => {
        const release = net.release;
        if (!dash.loading || !release) return;
        net.release = null;
        release(jsonResponse({ error: "down" }, 500));
      });
      return null;
    }
    net.status["/api/dashboard"] = 500;
    await mount(["/profile"], createElement(SettleOnLoadingCommit));
    expect(calls("/api/dashboard")).toHaveLength(1);

    // Real scheduling, not act(): act flushes effects before the settle lands.
    const env = globalThis as Record<string, unknown>;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      net.gate = "/api/dashboard";
      buttonByText("Try again")?.click();
      for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 10));
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true;
    }

    expect(net.release).toBeNull();
    expect(calls("/api/dashboard")).toHaveLength(2);
    expect(container.textContent).toContain("Couldn't load your climb");
  });

  it("Profile still says No climbs yet for a player with no record", async () => {
    net.dash = { ...RANKED_DASH, freeClimb: null };
    await mount(["/profile"]);
    expect(container.textContent).toContain("No climbs yet");
    expect(buttonByText("Try again")).toBeUndefined();
  });
});
