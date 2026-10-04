/**
 * Settings on the mobile SPA: the game preferences, leaderboard visibility and
 * account actions that used to sit on Edit Profile. Device-local preferences
 * and the account actions render without the settings load; only leaderboard
 * visibility waits on it, and only it is replaced by Try again when it fails.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsData } from "../../mobile/src/contexts/AppDataContext";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { apiFetch, setSettings, invalidate, signOut, clearAll, clearDailyStore, state } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  clearDailyStore: vi.fn(),
  setSettings: vi.fn(),
  invalidate: vi.fn(),
  signOut: vi.fn(async () => {}),
  clearAll: vi.fn(),
  state: { settings: null as SettingsData | null, error: false },
}));

vi.mock("../../mobile/src/lib/api", () => ({ apiFetch, API_BASE: "https://example.test" }));
vi.mock("@app/lib/daily", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/daily")>()),
  clearDailyStore,
}));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false, signOut }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  isHapticsEnabled: () => true,
  setHapticsEnabled: vi.fn(),
}));
vi.mock("../../mobile/src/contexts/AppDataContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../mobile/src/contexts/AppDataContext")>();
  return {
    ...real,
    useSettings: () => ({
      data: state.settings,
      loading: state.settings === null && !state.error,
      error: state.error,
      fetchedAt: 1,
      setSettings,
      refreshSettings: vi.fn(async () => {}),
    }),
    useSetSettings: () => setSettings,
    useInvalidateAppData: () => invalidate,
    useClearAppData: () => clearAll,
  };
});

import { SettingsScreen, VISIBILITY_NOT_SAVED } from "../../mobile/src/screens/SettingsScreen";
import { isSfxMuted } from "@app/components/Game/sfxMute";
import { CONSENT_STALE_SLICES } from "../../mobile/src/hooks/useAcceptLeaderboardConsent";
import { hasLeaderboardConsent, setLeaderboardConsent } from "../../mobile/src/lib/consent";

function settings(over: Partial<SettingsData> = {}): SettingsData {
  return {
    displayName: "Aria Stone",
    username: "aria",
    social: null,
    leaderboardConsent: true,
    avatarId: null,
    ...over,
  };
}

function withoutConsentBody() {
  const { leaderboardConsent: _dropped, ...rest } = settings();
  return rest;
}

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = settings();
  state.error = false;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Where() {
  return createElement("p", { id: "where" }, useLocation().pathname);
}

/** Settings pushed on Profile, as the gear opens it. */
function renderSettings() {
  act(() =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/profile", "/settings"], initialIndex: 1 },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/settings", element: createElement(SettingsScreen) }),
          createElement(Route, { path: "*", element: createElement(Where) }),
        ),
      ),
    ),
  );
}

const switchNamed = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`);
const visibility = () => switchNamed("Leaderboard visibility");
const button = (re: RegExp) => [...container.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
const alerts = () => [...container.querySelectorAll('[role="alert"]')].map((a) => a.textContent);
const where = () => container.querySelector("#where")?.textContent;

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("Settings screen", () => {
  it("is titled Settings and holds controls, sound, haptics, visibility and the account actions", () => {
    renderSettings();
    expect(container.querySelector("h1")?.textContent).toBe("Settings");
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy();
    expect(switchNamed("Sound")).toBeTruthy();
    expect(switchNamed("Haptic feedback")).toBeTruthy();
    expect(visibility()).toBeTruthy();
    expect(button(/^Sign out$/)).toBeTruthy();
    expect(button(/^Delete account$/)).toBeTruthy();
  });

  it("goes Back to Profile", async () => {
    renderSettings();
    await click(container.querySelector('button[aria-label="Back"]'));
    expect(where()).toBe("/profile");
  });
});

describe("The Sound switch", () => {
  it("is on with nothing saved, and turning it off saves the mute runs read", async () => {
    renderSettings();
    expect(switchNamed("Sound")?.getAttribute("aria-checked")).toBe("true");
    expect(isSfxMuted()).toBe(false);

    await click(switchNamed("Sound"));
    expect(switchNamed("Sound")?.getAttribute("aria-checked")).toBe("false");
    expect(isSfxMuted()).toBe(true);

    await click(switchNamed("Sound"));
    expect(isSfxMuted()).toBe(false);
  });

  it("starts off when a run muted the sound", () => {
    localStorage.setItem("doomstack:sfx-muted", "1");
    renderSettings();
    expect(switchNamed("Sound")?.getAttribute("aria-checked")).toBe("false");
  });
});

describe("Settings before the server settings arrive", () => {
  it("shows the local preferences and account actions while visibility loads", () => {
    state.settings = null;
    renderSettings();
    expect(switchNamed("Sound")).toBeTruthy();
    expect(switchNamed("Haptic feedback")).toBeTruthy();
    expect(button(/^Sign out$/)).toBeTruthy();
    expect(visibility()).toBeNull();
    expect(container.querySelector('[aria-label="Loading leaderboard visibility"]')).toBeTruthy();
  });

  it("offers Try again for visibility alone when the load fails, and Sign out still works", async () => {
    state.settings = null;
    state.error = true;
    renderSettings();
    expect(visibility()).toBeNull();
    expect(button(/^Try again$/)).toBeTruthy();
    expect(switchNamed("Sound")).toBeTruthy();

    await click(button(/^Sign out$/));
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("puts focus on the Privacy card, not the top of the page, when Try again recovers", async () => {
    state.settings = null;
    state.error = true;
    renderSettings();
    const tryAgain = button(/^Try again$/);
    tryAgain?.focus();
    expect(document.activeElement).toBe(tryAgain);

    // The load lands: the panel (and the focused button) gives way to the switch.
    state.settings = settings();
    state.error = false;
    renderSettings();
    expect(visibility()).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Privacy");
    expect(document.activeElement?.closest("section")?.contains(visibility())).toBe(true);
  });
});

describe("Delete account", () => {
  it("asks first, then deletes and signs out", async () => {
    apiFetch.mockResolvedValueOnce(json({ ok: true }));
    renderSettings();
    await click(button(/^Delete account$/));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();

    await click(button(/^Delete$/));
    expect(apiFetch).toHaveBeenCalledWith("/api/account/delete", { method: "DELETE" });
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(clearDailyStore).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the server refuses", () => apiFetch.mockResolvedValueOnce(json({ error: "Nope" }, 500)), "Nope"],
    [
      "the request never arrives",
      () => apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch")),
      "Could not delete account. Check your connection.",
    ],
  ])("stays signed in, keeps local data and says why inside the open confirm when %s", async (_case, arrange, message) => {
    arrange();
    renderSettings();
    await click(button(/^Delete account$/));
    // A tap focuses Delete, which the request then disables.
    button(/^Delete$/)?.focus();
    await click(button(/^Delete$/));
    expect(signOut).not.toHaveBeenCalled();
    expect(clearAll).not.toHaveBeenCalled();
    expect(clearDailyStore).not.toHaveBeenCalled();
    expect(alerts()).toEqual([message]);
    // Focus is in the confirm with the error, not dropped to <body>.
    const confirm = container.querySelector('[role="alertdialog"]');
    expect(confirm?.contains(container.querySelector('[role="alert"]'))).toBe(true);
    expect(document.activeElement).toBe(confirm);
  });
});

describe("Leaderboard visibility counts as saved only when the server echoes it", () => {
  async function toggleAfter(response: Response) {
    state.settings = settings({ leaderboardConsent: true });
    apiFetch.mockResolvedValueOnce(response);
    renderSettings();
    expect(visibility()?.getAttribute("aria-checked")).toBe("true");
    await click(visibility());
  }

  it("keeps the new value and caches the server's when the 200 echoes it", async () => {
    await toggleAfter(json(settings({ leaderboardConsent: false })));
    expect(JSON.parse((apiFetch.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      leaderboardConsent: false,
    });
    expect(visibility()?.getAttribute("aria-checked")).toBe("false");
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ leaderboardConsent: false }));
    // Every board the player's visibility shows on, not only the all-time one.
    expect(invalidate).toHaveBeenCalledWith(CONSENT_STALE_SLICES);
    expect(hasLeaderboardConsent()).toBe(false);
  });

  it("leaves the device's consent as it was until the server confirms", async () => {
    setLeaderboardConsent(true);
    await toggleAfter(json(withoutConsentBody()));
    expect(hasLeaderboardConsent()).toBe(true);
  });

  it("flips back when the 200 carries no leaderboardConsent, which would parse as false", async () => {
    const { leaderboardConsent: _dropped, ...withoutConsent } = settings();
    await toggleAfter(json(withoutConsent));
    expect(visibility()?.getAttribute("aria-checked")).toBe("true");
    expect(setSettings).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("flips back when the 200 stored the other value", async () => {
    await toggleAfter(json(settings({ leaderboardConsent: true })));
    expect(visibility()?.getAttribute("aria-checked")).toBe("true");
    expect(setSettings).not.toHaveBeenCalled();
  });

  it("flips back when the 200 does not parse", async () => {
    await toggleAfter({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("bad json")) } as Response);
    expect(visibility()?.getAttribute("aria-checked")).toBe("true");
    expect(setSettings).not.toHaveBeenCalled();
  });
});

describe("A failed visibility toggle says why on screen", () => {
  beforeEach(() => {
    state.settings = settings({ leaderboardConsent: true });
  });

  it("shows no message before a toggle or after one the server confirms", async () => {
    apiFetch.mockResolvedValueOnce(json(settings({ leaderboardConsent: false })));
    renderSettings();
    expect(alerts()).toEqual([]);
    await click(visibility());
    expect(visibility()?.getAttribute("aria-checked")).toBe("false");
    expect(alerts()).toEqual([]);
  });

  it.each([
    ["the PUT is rejected", () => json({ error: "Could not save" }, 500)],
    ["the 200 does not echo the value", () => json({ displayName: "Aria Stone" })],
  ])("shows an alert beside the switch when %s", async (_case, response) => {
    apiFetch.mockResolvedValueOnce(response());
    renderSettings();
    await click(visibility());
    expect(visibility()?.getAttribute("aria-checked")).toBe("true");
    expect(alerts()).toEqual([VISIBILITY_NOT_SAVED]);
    // Same section as the switch, so it reads as the switch's error.
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.closest("section")?.contains(visibility() ?? null)).toBe(true);
  });

  it("shows an alert when the request never reaches the server", async () => {
    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderSettings();
    await click(visibility());
    expect(visibility()?.getAttribute("aria-checked")).toBe("true");
    expect(alerts()).toEqual([VISIBILITY_NOT_SAVED]);
  });

  it("clears the message when the retry succeeds", async () => {
    apiFetch.mockResolvedValueOnce(json({}, 500));
    renderSettings();
    await click(visibility());
    expect(alerts()).toEqual([VISIBILITY_NOT_SAVED]);
    apiFetch.mockResolvedValueOnce(json(settings({ leaderboardConsent: false })));
    await click(visibility());
    expect(visibility()?.getAttribute("aria-checked")).toBe("false");
    expect(alerts()).toEqual([]);
  });
});
