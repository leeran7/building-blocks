/**
 * Profile avatars on the mobile SPA: the cached settings shape, the hex badge,
 * and the /profile/avatar picker. The API allow-lists avatarId; these pin the
 * client half — a stored id only renders art if it is still in the catalogue,
 * and the picker sends exactly `{ avatarId }` (null for "Use initials"), keeps
 * the old avatar on a failed save, and refreshes the cached boards on success.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATARS } from "@app/lib/avatars";
import type { SettingsData } from "../../mobile/src/contexts/AppDataContext";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { apiFetch, setSettings, invalidate, state } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  setSettings: vi.fn(),
  invalidate: vi.fn(),
  state: { settings: null as SettingsData | null },
}));

vi.mock("../../mobile/src/lib/api", () => ({ apiFetch }));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/contexts/AppDataContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../mobile/src/contexts/AppDataContext")>();
  return {
    ...real,
    useSettings: () => ({
      data: state.settings,
      loading: false,
      error: null,
      fetchedAt: 1,
      setSettings,
      refreshSettings: vi.fn(async () => {}),
    }),
    useDashboard: () => ({ data: null, loading: false, error: null, fetchedAt: 1 }),
    useInvalidateAppData: () => invalidate,
  };
});

import { settingsFromResponse } from "../../mobile/src/contexts/AppDataContext";
import { HexAvatar } from "../../mobile/src/components/HexAvatar";
import { AvatarPickerScreen } from "../../mobile/src/screens/AvatarPickerScreen";

const [FIRST, SECOND] = AVATARS;

function settings(avatarId: string | null): SettingsData {
  return { displayName: "Aria Stone", username: null, social: null, leaderboardConsent: true, avatarId };
}

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: ReturnType<typeof createElement>) {
  act(() => root.render(node));
}

/** Picker pushed on top of Profile, so navigate(-1) lands on "Profile screen". */
function renderPicker() {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/profile", "/profile/avatar"], initialIndex: 1 },
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/profile", element: createElement("p", null, "Profile screen") }),
        createElement(Route, { path: "/profile/avatar", element: createElement(AvatarPickerScreen) }),
      ),
    ),
  );
}

const radio = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[role="radio"][aria-label="${label}"]`);
const saveButton = () =>
  [...container.querySelectorAll("button")].find((b) => /save avatar|saving/i.test(b.textContent ?? ""));

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("settingsFromResponse avatarId", () => {
  it("keeps a catalogue id and nulls a retired, inherited, or mistyped one", () => {
    expect(settingsFromResponse({ avatarId: FIRST.id })?.avatarId).toBe(FIRST.id);
    for (const avatarId of ["retired-avatar", "__proto__", "constructor", 42, undefined]) {
      expect(settingsFromResponse({ avatarId })?.avatarId).toBeNull();
    }
  });
});

describe("HexAvatar", () => {
  it("shows the avatar art for a catalogue id instead of initials", () => {
    render(createElement(HexAvatar, { userId: "u1", name: "Aria Stone", avatarId: FIRST.id, size: 64 }));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(new RegExp(`${FIRST.id}\\.webp`));
    expect(container.textContent).toBe("");
  });

  it("falls back to initials with no avatar or a retired id", () => {
    let checked = 0;
    for (const avatarId of [null, undefined, "retired-avatar"]) {
      render(createElement(HexAvatar, { userId: "u1", name: "Aria Stone", avatarId, size: 64 }));
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent).toBe("AS");
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("AvatarPickerScreen", () => {
  it("announces the loading state as a busy status and offers no Save yet", () => {
    state.settings = null;
    renderPicker();
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(status?.getAttribute("aria-label")).toBe("Loading avatars");
    expect(saveButton()).toBeUndefined();
  });

  it("offers Use initials plus every catalogue avatar, with the saved one checked and Save disabled", () => {
    state.settings = settings(FIRST.id);
    renderPicker();
    const radios = [...container.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Use initials", ...AVATARS.map((a) => a.name)]);
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("aria-label"))).toEqual([
      FIRST.name,
    ]);
    expect(saveButton()?.disabled).toBe(true);
  });

  it("saves a new pick as {avatarId}, caches it, refreshes both boards and goes back", async () => {
    state.settings = settings(null);
    apiFetch.mockResolvedValueOnce(json(settings(SECOND.id)));
    renderPicker();

    await click(radio(SECOND.name));
    expect(saveButton()?.disabled).toBe(false);
    await click(saveButton());

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ avatarId: SECOND.id });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ avatarId: SECOND.id }));
    expect(invalidate).toHaveBeenCalledWith(["leaderboard", "friendsLeaderboard"]);
    expect(container.textContent).toContain("Profile screen");
  });

  it('"Use initials" sends avatarId: null', async () => {
    state.settings = settings(FIRST.id);
    apiFetch.mockResolvedValueOnce(json(settings(null)));
    renderPicker();

    await click(radio("Use initials"));
    await click(saveButton());

    expect(JSON.parse((apiFetch.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ avatarId: null });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ avatarId: null }));
  });

  it("re-selecting the saved avatar disables Save again", async () => {
    state.settings = settings(FIRST.id);
    renderPicker();
    await click(radio(SECOND.name));
    expect(saveButton()?.disabled).toBe(false);
    await click(radio(FIRST.name));
    expect(saveButton()?.disabled).toBe(true);
  });

  it("a rejected save shows the error, keeps the cached avatar and stays on the picker", async () => {
    state.settings = settings(FIRST.id);
    apiFetch.mockResolvedValueOnce(json({ error: "Unknown avatar", code: "UNKNOWN_AVATAR" }, 400));
    renderPicker();

    await click(radio(SECOND.name));
    await click(saveButton());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unknown avatar");
    expect(setSettings).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Profile screen");
    expect(saveButton()?.disabled).toBe(false);
  });

  it("a network failure shows a connection error and saves nothing", async () => {
    state.settings = settings(FIRST.id);
    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPicker();

    await click(radio(SECOND.name));
    await click(saveButton());

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/connection/i);
    expect(setSettings).not.toHaveBeenCalled();
  });

  it("Back without saving sends nothing and leaves the cached avatar", async () => {
    state.settings = settings(FIRST.id);
    renderPicker();
    await click(radio(SECOND.name));
    await click(container.querySelector('button[aria-label="Back"]'));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(setSettings).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Profile screen");
  });
});
