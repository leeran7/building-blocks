/**
 * Saving the profile on the native Edit profile screen
 * (mobile/src/screens/EditProfileScreen) marks the cached friends board stale.
 * The caller's own Friends row shows their display name, so without this the
 * old name stays up for the whole 30s TTL.
 *
 * The real screen renders inside the real AppDataProvider next to a probe that
 * reads the friends slice. Only the network (apiFetch), auth and haptics are
 * mocked. A save the server rejects must not invalidate.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
  isHapticsEnabled: () => true,
  setHapticsEnabled: vi.fn(),
}));

const net = vi.hoisted(() => ({
  displayName: "Old Name",
  putOk: true,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
  if (path === "/api/settings" && init?.method === "PUT") {
    if (!net.putOk) return jsonResponse({ error: "Could not save." }, 400);
    const body = JSON.parse(String(init.body)) as { displayName?: string | null };
    net.displayName = body.displayName ?? "";
  }
  if (path === "/api/settings") {
    return jsonResponse({ displayName: net.displayName, username: null, social: null, leaderboardConsent: true });
  }
  if (path === "/api/climb/leaderboard/friends") {
    const me = { rank: 1, userId: "me", handle: net.displayName, username: null, peakY: 100, wins: 0 };
    return jsonResponse({ climbers: [me], hiddenCount: 0, notClimbedCount: 0 });
  }
  return jsonResponse({}, 404);
});

vi.mock("../../mobile/src/lib/api", () => ({
  API_BASE: "https://example.test",
  isNative: false,
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
}));

import { AppDataProvider, useFriendsLeaderboard } from "../../mobile/src/contexts/AppDataContext";
import { EditProfileScreen } from "../../mobile/src/screens/EditProfileScreen";

function FriendsBoardProbe() {
  const { data } = useFriendsLeaderboard(true);
  return createElement("output", { "data-testid": "friends" }, data ? data.climbers.map((c) => c.handle).join(",") : "");
}

const friendsCalls = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/leaderboard/friends").length;

let root: Root | null = null;
let container: HTMLElement | null = null;

async function mount(): Promise<HTMLElement> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  container = el;
  await act(async () => {
    root = createRoot(el);
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/profile/edit"] },
        createElement(AppDataProvider, null, createElement(FriendsBoardProbe), createElement(EditProfileScreen)),
      ),
    );
  });
  return el;
}

function displayNameInput(c: HTMLElement): HTMLInputElement {
  // The input inside the "Display name" field label (its placeholder is the player's pseudonym).
  const input =
    [...c.querySelectorAll("label")]
      .find((l) => l.firstElementChild?.textContent === "Display name")
      ?.querySelector<HTMLInputElement>("input") ?? null;
  if (!input) throw new Error("display name input not found");
  return input;
}

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickSave(c: HTMLElement) {
  const button = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Save changes");
  if (!button) throw new Error("Save changes button not found");
  await act(async () => {
    button.click();
  });
}

const probeText = (c: HTMLElement) => c.querySelector("[data-testid=friends]")?.textContent;

beforeEach(() => {
  net.displayName = "Old Name";
  net.putOk = true;
  apiFetch.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Edit profile save and the friends board", () => {
  it("refetches the friends board after a successful save, so the caller's row shows the new name", async () => {
    const c = await mount();
    expect(friendsCalls()).toBe(1);
    expect(probeText(c)).toBe("Old Name");

    await typeInto(displayNameInput(c), "New Name");
    await clickSave(c);

    expect(apiFetch.mock.calls.some(([p, init]) => p === "/api/settings" && init?.method === "PUT")).toBe(true);
    expect(friendsCalls()).toBe(2);
    expect(probeText(c)).toBe("New Name");
  });

  it("leaves the cached friends board alone when the server rejects the save", async () => {
    net.putOk = false;
    const c = await mount();
    expect(friendsCalls()).toBe(1);

    await typeInto(displayNameInput(c), "New Name");
    await clickSave(c);

    expect(apiFetch.mock.calls.some(([p, init]) => p === "/api/settings" && init?.method === "PUT")).toBe(true);
    expect(friendsCalls()).toBe(1);
    expect(probeText(c)).toBe("Old Name");
  });
});
