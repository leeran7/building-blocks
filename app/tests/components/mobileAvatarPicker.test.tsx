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
import { initialsOf } from "../../mobile/src/lib/leaderboard";
import { ANIMALS, climberHandle } from "@app/lib/handle";
import { HexAvatar } from "../../mobile/src/components/HexAvatar";
import { AvatarPickerScreen } from "../../mobile/src/screens/AvatarPickerScreen";

const [FIRST, SECOND] = AVATARS;

function settings(avatarId: string | null, displayName: string | null = "Aria Stone"): SettingsData {
  return { displayName, username: null, social: null, leaderboardConsent: true, avatarId };
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

  it("saves a new pick as {avatarId}, caches it, refreshes both boards and the dashboard and goes back", async () => {
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
    // The dashboard too: its handle is the Profile header's name, and the
    // pseudonym's animal follows the avatar.
    expect(invalidate).toHaveBeenCalledWith(["leaderboard", "friendsLeaderboard", "dashboard"]);
    expect(container.textContent).toContain("Profile screen");
  });

  describe("the Use initials badge previews the name the player would have with no avatar", () => {
    const UID = "u1";
    const hashAnimal = climberHandle(UID).split(" ")[1];
    // An animal whose initial differs from the hash animal's, so the saved
    // pick's initials and the no-avatar initials cannot coincide.
    const pick = ANIMALS.find((a) => a[0] !== hashAnimal[0])!.toLowerCase();
    const tileBadge = () => radio("Use initials")?.querySelector(".hex")?.textContent;
    const previewBadge = () =>
      container.querySelector('[aria-label="Selected avatar"] .hex')?.textContent;

    it("spells the hash-animal pseudonym's initials when there is no display name", async () => {
      const afterChoosing = initialsOf(climberHandle(UID, null));
      expect(afterChoosing).not.toBe(initialsOf(climberHandle(UID, pick)));
      state.settings = settings(pick, null);
      renderPicker();

      expect(tileBadge()).toBe(afterChoosing);
      await click(radio("Use initials"));
      expect(previewBadge()).toBe(afterChoosing);
    });

    it("spells the display name's initials when there is one", async () => {
      state.settings = settings(pick, "Aria Stone");
      renderPicker();

      expect(tileBadge()).toBe(initialsOf("Aria Stone"));
      await click(radio("Use initials"));
      expect(previewBadge()).toBe(initialsOf("Aria Stone"));
    });
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

/**
 * The phone build talks to production. An API build older than avatars answers
 * PUT /api/settings with 200 and settings that have no avatarId, so a picker
 * that trusted its own pick looked saved and then reverted. Only the server's
 * echo of the pick counts as saved.
 */
describe("a 200 counts as saved only when the server echoes the avatar", () => {
  const NOT_SAVED = "Couldn't save your avatar. Please update the app or try again later.";
  /** PUT /api/settings on an API build that predates avatars. */
  const legacySettings = { displayName: "Aria Stone", username: null, social: {}, leaderboardConsent: true };

  async function saveAfter(response: Response, pick: string, saved: string | null = FIRST.id) {
    state.settings = settings(saved);
    apiFetch.mockResolvedValueOnce(response);
    renderPicker();
    await click(radio(pick));
    await click(saveButton());
  }

  function expectNotSaved() {
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(NOT_SAVED);
    expect(setSettings).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Profile screen");
    expect(saveButton()?.disabled).toBe(false);
    // Focus goes back to Save (it was disabled, and so blurred, while in flight).
    expect(document.activeElement).toBe(saveButton());
  }

  it("(a) caches exactly the server's settings and goes back when the avatar is echoed", async () => {
    await saveAfter(json(settings(SECOND.id)), SECOND.name);
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings).toHaveBeenCalledWith(settings(SECOND.id));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Profile screen");
  });

  it("(b) treats a 200 without avatarId (an API that predates avatars) as a failed save", async () => {
    await saveAfter(json(legacySettings), SECOND.name);
    expectNotSaved();
  });

  it("(b) also when the pick is Use initials, where a missing field would parse as null", async () => {
    await saveAfter(json(legacySettings), "Use initials");
    expectNotSaved();
  });

  it("(c) treats a 200 that stored a different avatar as a failed save", async () => {
    await saveAfter(json(settings(FIRST.id)), SECOND.name);
    expectNotSaved();
  });

  it("(d) treats an unparseable 200 as a failed save, never the client's own pick", async () => {
    const unparseable = { ok: true, status: 200, json: () => Promise.reject(new SyntaxError("bad json")) } as Response;
    await saveAfter(unparseable, SECOND.name);
    expectNotSaved();
  });

  it("(d) and a 200 whose body is not an object", async () => {
    await saveAfter(json("ok"), SECOND.name);
    expectNotSaved();
  });
});

describe("the picker fills the screen, Save sticks to the bottom (user report)", () => {
  /** The rendered page skeleton: main > [header, scroller, save bar]. */
  function layout() {
    const main = container.querySelector("main");
    const kids = [...(main?.children ?? [])];
    const scroller = main?.querySelector("[data-avatar-scroller]") ?? null;
    const bar = saveButton()?.closest("footer") ?? null;
    return { main, kids, scroller, bar };
  }
  const classes = (el: Element | null) => new Set((el?.getAttribute("class") ?? "").split(/\s+/));

  it("the page is a full-height column and the scroller takes all the space between header and save bar", () => {
    state.settings = settings(null);
    renderPicker();
    const { main, kids, scroller, bar } = layout();
    for (const c of ["flex", "h-full", "min-h-0", "flex-col"]) expect(classes(main).has(c)).toBe(true);
    // Order: header, scroller, save bar, each a direct child of the page.
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(["header", "div", "footer"]);
    expect(kids[1]).toBe(scroller);
    expect(kids[2]).toBe(bar);
    for (const c of ["flex-1", "min-h-0", "overflow-y-auto"]) expect(classes(scroller).has(c)).toBe(true);
  });

  it("the avatar grid scrolls inside the scroller, and Save lives outside it in the bottom bar", () => {
    state.settings = settings(null);
    renderPicker();
    const { scroller, bar } = layout();
    const grid = container.querySelector('[role="radiogroup"]');
    expect(scroller?.contains(grid)).toBe(true);
    expect(bar?.contains(grid)).toBe(false);
    expect(scroller?.contains(saveButton() ?? null)).toBe(false);
    expect(bar?.contains(saveButton() ?? null)).toBe(true);
  });

  it("the save bar sits just above the home indicator, with no gap above the bottom edge", () => {
    state.settings = settings(null);
    renderPicker();
    const { bar } = layout();
    const cls = classes(bar);
    expect(cls.has("shrink-0")).toBe(true);
    const bottom = [...cls].filter((c) => c.startsWith("pb-"));
    expect(bottom).toEqual(["pb-[calc(env(safe-area-inset-bottom)+1rem)]"]);
    // The old layout held Save 16vh up to stand clear of the lava band.
    expect(bar?.getAttribute("class")).not.toMatch(/vh/);
  });

  it("the save bar is clear: no surface, border or shadow band, so the backdrop shows to the bottom edge", () => {
    state.settings = settings(null);
    renderPicker();
    const { bar } = layout();
    const surface = [...classes(bar)].filter((c) =>
      /^(glass|glow-card|bg-|border|shadow|backdrop-|ring)/.test(c),
    );
    expect(surface).toEqual([]);
    expect(bar?.getAttribute("style") ?? "").toBe("");
    // The button keeps its own lime fill.
    expect(classes(saveButton() ?? null).has("cta-lime")).toBe(true);
  });

  it("tiles fade out into the backdrop at the scroller's edge instead of running under Save", () => {
    state.settings = settings(null);
    renderPicker();
    const { scroller } = layout();
    const mask = (scroller as HTMLElement | null)?.style.getPropertyValue("mask-image") ?? "";
    expect(mask).toContain("linear-gradient");
    expect(mask).toContain("transparent");
  });

  it("while loading, the scroller still fills the page (no save bar yet), with the busy skeleton inside", () => {
    state.settings = null;
    renderPicker();
    const { kids, scroller, bar } = layout();
    expect(bar).toBeNull();
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(["header", "div"]);
    expect(scroller?.querySelector('[role="status"][aria-busy="true"]')).toBeTruthy();
  });

  it("keeps the picker's a11y: radiogroup, one checked radio, labelled Save", () => {
    state.settings = settings(FIRST.id);
    renderPicker();
    expect(container.querySelector('[role="radiogroup"][aria-label="Avatars"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(radio(FIRST.name)?.getAttribute("aria-checked")).toBe("true");
    expect(saveButton()?.textContent).toBe("Save avatar");
  });
});
