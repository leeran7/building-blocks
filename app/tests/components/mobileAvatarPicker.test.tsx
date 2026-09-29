/**
 * Profile characters on the mobile SPA: the cached settings shape, the hex badge,
 * and the /profile/avatar "Choose character" picker. The API allow-lists avatarId; these pin the
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
import { AVATARS, avatarEntry, requiredStars } from "@app/lib/avatars";
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
import { unlockedAvatarNames } from "../../mobile/src/components/levels/LevelResultCard";
import {
  AvatarPickerScreen,
  GRID_END_PADDING,
  OPTIONS,
  SAVED_FLASH_MS,
  GRID_CELLS,
  groupHeading,
  nextIndex,
  nextStarUnlock,
  starUnlockCount,
} from "../../mobile/src/screens/AvatarPickerScreen";
import {
  LAVA_CANVAS_VH,
  LAVA_CLEARANCE,
  LAVA_CREST_PX,
  LAVA_SURFACE_FROM_TOP,
} from "../../mobile/src/components/AnimatedBackdrop";

/** Star-ladder characters: the first two rungs (15 and 30 stars). */
const KESTREL = avatarEntry("kestrel")!;
const LYNX = avatarEntry("lynx")!;
const STICKS = AVATARS.filter((a) => a.stickColor !== undefined).map((a) => a.id);

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
  vi.useRealTimers();
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
        createElement(Route, { path: "/shop/:characterId", element: createElement("p", null, "Skin details screen") }),
      ),
    ),
  );
}

const radios = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
/** A tile by its character name, whatever its state suffix (", equipped", ", locked. …"). */
const tile = (name: string) =>
  radios().find((r) => {
    const label = r.getAttribute("aria-label") ?? "";
    return label === name || label.startsWith(`${name},`);
  });
const saveButton = () => container.querySelector<HTMLButtonElement>("[data-avatar-save]") ?? undefined;
const preview = () => container.querySelector('[aria-label="Selected character"]');
const previewName = () => preview()?.querySelector("p[aria-live]")?.textContent;
const previewTag = () => preview()?.querySelector("p[aria-live] + span")?.textContent;
const notice = () => container.querySelector("[data-avatar-lock-notice]");
const savedStatus = () => container.querySelector('[data-avatar-save-bar] [role="status"]')?.textContent;

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("settingsFromResponse avatarId", () => {
  it("keeps a catalogue id and nulls a retired, inherited, or mistyped one", () => {
    expect(settingsFromResponse({ avatarId: KESTREL.id })?.avatarId).toBe(KESTREL.id);
    expect(settingsFromResponse({ avatarId: "stick-sky" })?.avatarId).toBe("stick-sky");
    for (const avatarId of ["retired-avatar", "__proto__", "constructor", 42, undefined]) {
      expect(settingsFromResponse({ avatarId })?.avatarId).toBeNull();
    }
  });
});

describe("HexAvatar", () => {
  it("shows the avatar art for a catalogue id instead of initials", () => {
    render(createElement(HexAvatar, { userId: "u1", name: "Aria Stone", avatarId: KESTREL.id, size: 64 }));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(new RegExp(`${KESTREL.id}\\.webp`));
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("draws a stick id as an inline SVG figure in its colour, with no image", () => {
    let checked = 0;
    for (const id of STICKS) {
      const color = avatarEntry(id)!.stickColor!;
      render(createElement(HexAvatar, { userId: "u1", name: "Aria Stone", avatarId: id, size: 64 }));
      expect(container.querySelector("img")).toBeNull();
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.querySelector(`[fill="${color}"]`)).toBeTruthy();
      expect(container.textContent).toBe("");
      checked++;
    }
    expect(checked).toBe(6);
  });

  it("falls back to initials with no avatar or a retired id", () => {
    let checked = 0;
    for (const avatarId of [null, undefined, "retired-avatar"]) {
      render(createElement(HexAvatar, { userId: "u1", name: "Aria Stone", avatarId, size: 64 }));
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("svg")).toBeNull();
      expect(container.textContent).toBe("AS");
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("unlockedAvatarNames (the level result's unlock line)", () => {
  it("collapses every stick id into one Stick figures entry, in first-seen position", () => {
    expect(unlockedAvatarNames([...STICKS, KESTREL.id])).toEqual(["Stick figures", "Kestrel"]);
    expect(unlockedAvatarNames([KESTREL.id, "stick-pink", LYNX.id, "stick-green"])).toEqual([
      "Kestrel",
      "Stick figures",
      "Lynx",
    ]);
  });

  it("names star characters one by one and drops ids outside the catalogue", () => {
    expect(unlockedAvatarNames([KESTREL.id, LYNX.id])).toEqual(["Kestrel", "Lynx"]);
    expect(unlockedAvatarNames(["retired-avatar", "__proto__"])).toEqual([]);
    expect(unlockedAvatarNames([])).toEqual([]);
  });
});

describe("picker order and groups", () => {
  const STAR_NAMES = [
    "Kestrel", "Lynx", "Raven", "Panther", "Wolf", "Otter", "Heron", "Yak", "Mantis",
    "Cobra", "Badger", "Falcon", "Marmot", "Bison", "Ibex", "Sentinel", "Viking",
  ];
  const ORDER = [
    "Wraith", "Gecko",
    "Green Stick", "Ember Stick", "Amber Stick", "Sky Stick", "Violet Stick", "Pink Stick",
    "Initials",
    ...STAR_NAMES,
  ];

  it("lists the Shop Wraith, Gecko and the six sticks, Initials, then the star ladder cheapest first, and no skins", () => {
    expect(OPTIONS.some((o) => o.entry?.skinOf !== undefined)).toBe(false);
    expect(OPTIONS.map((o) => o.name)).toEqual(ORDER);
    expect(OPTIONS.find((o) => o.name === "Initials")?.id).toBeNull();
    const ladder = OPTIONS.flatMap((o) => (o.entry && requiredStars(o.entry) !== null ? [requiredStars(o.entry)!] : []));
    expect(ladder).toHaveLength(STAR_NAMES.length);
    expect(ladder[0]).toBe(15);
    expect(ladder.at(-1)).toBe(840);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
  });

  it("renders the tiles in that order, with the saved one equipped", () => {
    state.settings = settings(KESTREL.id);
    renderPicker();
    expect(radios().map((r) => r.getAttribute("aria-label"))).toEqual(
      ORDER.map((n) => (n === "Initials" ? "Use initials" : n === "Kestrel" ? "Kestrel, equipped" : n)),
    );
    expect(radios().filter((r) => r.hasAttribute("data-equipped"))).toEqual([tile("Kestrel")]);
  });

  it("groupHeading starts a group only at the Shop, the free-after-tutorial ones and Initials", () => {
    const headings = OPTIONS.flatMap((_, i) => {
      const h = groupHeading(i);
      return h === null ? [] : [[i, h] as const];
    });
    expect(headings).toEqual([
      [0, "Shop · buy with gems"],
      [1, "Free after the tutorial"],
      [8, "Initials and star unlocks"],
    ]);
  });

  it("draws each heading inside the radiogroup, hidden from screen readers, just before its group", () => {
    state.settings = settings(null);
    renderPicker();
    const ps = [...container.querySelectorAll('[role="radiogroup"] > p')];
    expect(ps.map((p) => p.textContent)).toEqual([
      "Shop · buy with gems",
      "Free after the tutorial",
      "Initials and star unlocks",
    ]);
    for (const p of ps) expect(p.getAttribute("aria-hidden")).toBe("true");
    expect(ps.map((p) => p.nextElementSibling?.getAttribute("aria-label"))).toEqual([
      "Wraith",
      "Gecko",
      "Use initials, equipped",
    ]);
  });
});

describe("nextStarUnlock / starUnlockCount", () => {
  const state0 = (stars: number, unlockedIds: string[] = []) => ({ stars, unlockedIds, grandfatheredId: null });

  it("nextStarUnlock names the next rung, the stars left and progress from the rung below", () => {
    expect(nextStarUnlock(state0(0))).toEqual({ entry: KESTREL, starsLeft: 15, progress: 0 });
    const lynx = nextStarUnlock(state0(20, [KESTREL.id]));
    expect(lynx?.entry.id).toBe("lynx");
    expect(lynx?.starsLeft).toBe(10);
    expect(lynx?.progress).toBeCloseTo(5 / 15);
    const viking = nextStarUnlock(state0(839));
    expect(viking?.entry.id).toBe("viking");
    expect(viking?.starsLeft).toBe(1);
    expect(viking?.progress).toBeCloseTo(89 / 90);
  });

  it("nextStarUnlock skips a grandfathered rung, and is null at the top or with no unlock state", () => {
    expect(nextStarUnlock(state0(20, [KESTREL.id, LYNX.id]))?.entry.id).toBe("raven");
    expect(nextStarUnlock(state0(840))).toBeNull();
    expect(nextStarUnlock(state0(5000))).toBeNull();
    expect(nextStarUnlock(undefined)).toBeNull();
  });

  it("starUnlockCount counts only star characters: premium and sticks never add to it", () => {
    expect(starUnlockCount(state0(0, ["wraith", "gecko", ...STICKS]))).toEqual({ owned: 0, total: 17 });
    expect(starUnlockCount(state0(30, [...STICKS, KESTREL.id, LYNX.id]))).toEqual({ owned: 2, total: 17 });
    // No unlock state (an API that enforces none): everything counts as owned.
    expect(starUnlockCount(undefined)).toEqual({ owned: 17, total: 17 });
  });

  it("the picker shows the next unlock and the unlocked count", () => {
    state.settings = {
      ...settings(null),
      avatarUnlocks: { stars: 20, unlockedIds: [...STICKS, KESTREL.id], grandfatheredId: null },
    };
    renderPicker();
    expect(container.querySelector("[data-avatar-next]")?.textContent).toBe("Next: Lynx in 10 ★");
    expect(container.querySelector("[data-avatar-pinned]")?.textContent).toContain("1/17 unlocked");
  });

  it("hides the next strip once every star character is unlocked", () => {
    state.settings = {
      ...settings(null),
      avatarUnlocks: {
        stars: 900,
        unlockedIds: AVATARS.filter((a) => a.unlock.kind !== "premium").map((a) => a.id),
        grandfatheredId: null,
      },
    };
    renderPicker();
    expect(container.querySelector("[data-avatar-next]")).toBeNull();
    expect(container.querySelector("[data-avatar-pinned]")?.textContent).toContain("17/17 unlocked");
  });
});

describe("AvatarPickerScreen", () => {
  it("announces the loading state as a busy status and offers no Save yet", () => {
    state.settings = null;
    renderPicker();
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(status?.getAttribute("aria-label")).toBe("Loading characters");
    expect(saveButton()).toBeUndefined();
    expect(preview()).toBeNull();
  });

  it("checks and equips the saved tile, previews it, and keeps Save disabled", () => {
    state.settings = settings(KESTREL.id);
    renderPicker();
    expect(container.querySelector("h1")?.textContent).toBe("Choose character");
    expect(radios().filter((r) => r.getAttribute("aria-checked") === "true")).toEqual([tile(KESTREL.name)]);
    expect(tile(KESTREL.name)?.getAttribute("aria-label")).toBe("Kestrel, equipped");
    expect(previewName()).toBe("Kestrel");
    expect(previewTag()).toBe("Equipped");
    expect(saveButton()?.textContent).toBe("Save character");
    expect(saveButton()?.disabled).toBe(true);
  });

  it("switches the preview pose with pressed-state buttons", async () => {
    state.settings = settings(KESTREL.id);
    renderPicker();
    const pose = (label: string) =>
      [...container.querySelectorAll('[aria-label="Preview pose"] button')].find((b) => b.textContent === label);
    expect(pose("Walk")?.getAttribute("aria-pressed")).toBe("true");
    expect(pose("Climb")?.getAttribute("aria-pressed")).toBe("false");
    await click(pose("Climb"));
    expect(pose("Climb")?.getAttribute("aria-pressed")).toBe("true");
    expect(pose("Walk")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("saves {avatarId}, refreshes the boards, shows Saved, then returns to Save character after SAVED_FLASH_MS", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    state.settings = settings(null);
    apiFetch.mockResolvedValueOnce(json(settings(LYNX.id)));
    renderPicker();

    await click(tile(LYNX.name));
    expect(previewTag()).toBe("Unlocked");
    expect(saveButton()?.disabled).toBe(false);
    await click(saveButton());

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ avatarId: LYNX.id });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ avatarId: LYNX.id }));
    // The dashboard too: its handle is the Profile header's name, and the
    // pseudonym's animal follows the avatar.
    expect(invalidate).toHaveBeenCalledWith(["leaderboard", "friendsLeaderboard", "dashboard"]);

    // Stays on the picker; Save flashes "Saved" and the pick is now equipped.
    expect(container.textContent).not.toContain("Profile screen");
    expect(saveButton()?.textContent).toBe("Saved");
    expect(saveButton()?.querySelector("svg")).toBeTruthy();
    expect(savedStatus()).toBe("Saved");
    expect(tile(LYNX.name)?.getAttribute("aria-label")).toBe("Lynx, equipped");
    expect(tile("Use initials")?.hasAttribute("data-equipped")).toBe(false);
    expect(previewTag()).toBe("Equipped");
    // Save is disabled now, so keyboard focus moves to the equipped tile, not <body>.
    expect(document.activeElement).toBe(tile(LYNX.name));

    act(() => vi.advanceTimersByTime(SAVED_FLASH_MS - 1));
    expect(saveButton()?.textContent).toBe("Saved");

    act(() => vi.advanceTimersByTime(1));
    expect(saveButton()?.textContent).toBe("Save character");
    expect(saveButton()?.querySelector("svg")).toBeNull();
    expect(saveButton()?.disabled).toBe(true);
    expect(savedStatus()).toBe("");
    expect(container.textContent).not.toContain("Profile screen");
  });

  it("picking another tile during the Saved flash ends it at once", async () => {
    state.settings = settings(null);
    apiFetch.mockResolvedValueOnce(json(settings(LYNX.id)));
    renderPicker();
    await click(tile(LYNX.name));
    await click(saveButton());
    expect(saveButton()?.textContent).toBe("Saved");
    await click(tile(KESTREL.name));
    expect(saveButton()?.textContent).toBe("Save character");
    expect(saveButton()?.disabled).toBe(false);
  });

  describe("the Use initials badge previews the name the player would have with no avatar", () => {
    const UID = "u1";
    const hashAnimal = climberHandle(UID).split(" ")[1];
    // An animal whose initial differs from the hash animal's, so the saved
    // pick's initials and the no-avatar initials cannot coincide.
    const pick = ANIMALS.find((a) => a[0] !== hashAnimal[0])!.toLowerCase();
    const tileBadge = () => tile("Use initials")?.querySelector(".hex")?.textContent;

    it("spells the hash-animal pseudonym's initials when there is no display name", async () => {
      const afterChoosing = initialsOf(climberHandle(UID, null));
      expect(afterChoosing).not.toBe(initialsOf(climberHandle(UID, pick)));
      state.settings = settings(pick, null);
      renderPicker();

      expect(tileBadge()).toBe(afterChoosing);
      await click(tile("Use initials"));
      expect(previewName()).toBe("Initials");
      expect(notice()?.textContent).toBe("Initials on your badge. You climb as the Green Stick.");
    });

    it("spells the display name's initials when there is one", () => {
      state.settings = settings(pick, "Aria Stone");
      renderPicker();
      expect(tileBadge()).toBe(initialsOf("Aria Stone"));
    });
  });

  it('"Use initials" sends avatarId: null', async () => {
    state.settings = settings(KESTREL.id);
    apiFetch.mockResolvedValueOnce(json(settings(null)));
    renderPicker();

    await click(tile("Use initials"));
    await click(saveButton());

    expect(JSON.parse((apiFetch.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ avatarId: null });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ avatarId: null }));
  });

  it("re-selecting the saved avatar disables Save again", async () => {
    state.settings = settings(KESTREL.id);
    renderPicker();
    await click(tile(LYNX.name));
    expect(saveButton()?.disabled).toBe(false);
    await click(tile(KESTREL.name));
    expect(saveButton()?.disabled).toBe(true);
  });

  it("a rejected save shows the error, keeps the cached avatar and stays on the picker", async () => {
    state.settings = settings(KESTREL.id);
    apiFetch.mockResolvedValueOnce(json({ error: "Unknown avatar", code: "UNKNOWN_AVATAR" }, 400));
    renderPicker();

    await click(tile(LYNX.name));
    await click(saveButton());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unknown avatar");
    expect(setSettings).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Profile screen");
    expect(saveButton()?.disabled).toBe(false);
    expect(saveButton()?.textContent).toBe("Save character");
    expect(tile(KESTREL.name)?.hasAttribute("data-equipped")).toBe(true);
  });

  it("a network failure shows a connection error and saves nothing", async () => {
    state.settings = settings(KESTREL.id);
    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPicker();

    await click(tile(LYNX.name));
    await click(saveButton());

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/connection/i);
    expect(setSettings).not.toHaveBeenCalled();
  });

  it("Back without saving sends nothing and leaves the cached avatar", async () => {
    state.settings = settings(KESTREL.id);
    renderPicker();
    await click(tile(LYNX.name));
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
  const NOT_SAVED = "Couldn't save your character. Please update the app or try again later.";
  /** PUT /api/settings on an API build that predates avatars. */
  const legacySettings = { displayName: "Aria Stone", username: null, social: {}, leaderboardConsent: true };

  async function saveAfter(response: Response, pick: string, saved: string | null = KESTREL.id) {
    state.settings = settings(saved);
    apiFetch.mockResolvedValueOnce(response);
    renderPicker();
    await click(tile(pick));
    await click(saveButton());
  }

  function expectNotSaved() {
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(NOT_SAVED);
    expect(setSettings).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Profile screen");
    expect(saveButton()?.disabled).toBe(false);
    expect(saveButton()?.textContent).toBe("Save character");
    // Focus goes back to Save (it was disabled, and so blurred, while in flight).
    expect(document.activeElement).toBe(saveButton());
  }

  it("(a) caches exactly the server's settings and shows Saved when the avatar is echoed", async () => {
    await saveAfter(json(settings(LYNX.id)), LYNX.name);
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings).toHaveBeenCalledWith(settings(LYNX.id));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(saveButton()?.textContent).toBe("Saved");
    expect(container.textContent).not.toContain("Profile screen");
  });

  it("(b) treats a 200 without avatarId (an API that predates avatars) as a failed save", async () => {
    await saveAfter(json(legacySettings), LYNX.name);
    expectNotSaved();
  });

  it("(b) also when the pick is Use initials, where a missing field would parse as null", async () => {
    await saveAfter(json(legacySettings), "Use initials");
    expectNotSaved();
  });

  it("(c) treats a 200 that stored a different avatar as a failed save", async () => {
    await saveAfter(json(settings(KESTREL.id)), LYNX.name);
    expectNotSaved();
  });

  it("(d) treats an unparseable 200 as a failed save, never the client's own pick", async () => {
    const unparseable = { ok: true, status: 200, json: () => Promise.reject(new SyntaxError("bad json")) } as Response;
    await saveAfter(unparseable, LYNX.name);
    expectNotSaved();
  });

  it("(d) and a 200 whose body is not an object", async () => {
    await saveAfter(json("ok"), LYNX.name);
    expectNotSaved();
  });
});

describe("the picker fills the screen, Save sticks to the bottom (user report)", () => {
  /** The rendered page skeleton: main > [header, scroller, save bar]. */
  function layout() {
    const main = container.querySelector("main");
    const kids = [...(main?.children ?? [])];
    const pinned = main?.querySelector("[data-avatar-pinned]") ?? null;
    const scroller = main?.querySelector("[data-avatar-scroller]") ?? null;
    const bar = saveButton()?.closest("footer") ?? null;
    return { main, kids, pinned, scroller, bar };
  }
  const classes = (el: Element | null) => new Set((el?.getAttribute("class") ?? "").split(/\s+/));

  it("the page is a full-height column and the scroller takes all the space between the pinned preview and save bar", () => {
    state.settings = settings(null);
    renderPicker();
    const { main, kids, pinned, scroller, bar } = layout();
    for (const c of ["flex", "h-full", "min-h-0", "flex-col"]) expect(classes(main).has(c)).toBe(true);
    // Order: header, pinned preview, scroller, save bar, each a direct child of the page.
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(["header", "div", "div", "footer"]);
    expect(kids[1]).toBe(pinned);
    expect(kids[2]).toBe(scroller);
    expect(kids[3]).toBe(bar);
    // The preview stays put (never scrolls away); the grid below it scrolls.
    expect(classes(pinned).has("shrink-0")).toBe(true);
    expect(pinned?.contains(preview())).toBe(true);
    expect(scroller?.contains(preview())).toBe(false);
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

  it("the save bar is clear: no surface, border or shadow band, so the backdrop shows to the bottom edge", async () => {
    state.settings = settings(null);
    renderPicker();
    const { bar } = layout();
    const surface = [...classes(bar)].filter((c) =>
      /^(glass|glow-card|bg-|border|shadow|backdrop-|ring)/.test(c),
    );
    expect(surface).toEqual([]);
    expect(bar?.getAttribute("style") ?? "").toBe("");
    // With nothing to save the button is muted; once there is, it has its own lime fill.
    expect(classes(saveButton() ?? null).has("cta-lime")).toBe(false);
    await click(tile(KESTREL.name));
    expect(classes(saveButton() ?? null).has("cta-lime")).toBe(true);
  });

  it("the grid ends with the lava-clearance padding, so the last row can scroll above the lava", () => {
    state.settings = settings(null);
    renderPicker();
    const { scroller } = layout();
    const content = scroller?.querySelector<HTMLElement>("[data-avatar-content]") ?? null;
    // The radiogroup is the last thing in the padded content.
    expect(content?.lastElementChild?.getAttribute("role")).toBe("radiogroup");
    expect(classes(content).has("pb-(--avatar-grid-end)")).toBe(true);
    expect(content?.style.getPropertyValue("--avatar-grid-end")).toBe(GRID_END_PADDING);
    expect(GRID_END_PADDING).toContain(LAVA_CLEARANCE);
  });

  /**
   * Evaluates the production CSS length for a given screen: vh, rem, px and
   * the home-indicator inset become numbers; calc/max become arithmetic.
   */
  function cssPx(length: string, viewportH: number, safeBottom: number): number {
    const js = length
      .replace(/env\(safe-area-inset-bottom\)/g, String(safeBottom))
      .replace(/([\d.]+)vh/g, (_, n) => `(${n}*${viewportH / 100})`)
      .replace(/([\d.]+)rem/g, (_, n) => `(${n}*16)`)
      .replace(/([\d.]+)px/g, "$1")
      .replace(/calc/g, "")
      .replace(/max/g, "Math.max");
    expect(js).toMatch(/^[\d\s.+\-*/(),Mathmax]+$/);
    return Function(`return ${js};`)() as number;
  }

  it.each([
    ["iPhone 15 Pro Max", 932, 34],
    ["iPhone 15", 852, 34],
    ["iPhone SE", 667, 0],
    ["iPad mini portrait", 1133, 20],
  ])("on %s the last row's bottom clears the lava crest", (_device, viewportH, safeBottom) => {
    // The lava crest's height above the bottom edge, from the canvas geometry.
    const crest = (viewportH * LAVA_CANVAS_VH * (1 - LAVA_SURFACE_FROM_TOP)) / 100 + LAVA_CREST_PX;
    // The clear save bar: pt-3 (12) + the 56px button + pb 1rem (16) + inset.
    const bar = 12 + 56 + 16 + safeBottom;
    const pad = cssPx(GRID_END_PADDING, viewportH, safeBottom);
    expect(pad).toBeGreaterThanOrEqual(16);
    expect(bar + pad).toBeGreaterThan(crest);
    // And not absurdly more than needed (a row or so of slack at most).
    expect(bar + pad - crest).toBeLessThan(96);
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
    const { kids, pinned, scroller, bar } = layout();
    expect(bar).toBeNull();
    expect(pinned).toBeNull();
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(["header", "div"]);
    expect(scroller?.querySelector('[role="status"][aria-busy="true"]')).toBeTruthy();
  });

  it("keeps the picker's a11y: radiogroup, one checked radio, labelled Save", () => {
    state.settings = settings(KESTREL.id);
    renderPicker();
    expect(container.querySelector('[role="radiogroup"][aria-label="Characters"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(tile(KESTREL.name)?.getAttribute("aria-checked")).toBe("true");
    expect(saveButton()?.textContent).toBe("Save character");
  });
});

describe("locked characters in the picker (server unlock state)", () => {
  const withUnlocks = (
    avatarId: string | null,
    stars: number,
    unlockedIds: string[],
    grandfatheredId: string | null = null,
  ): SettingsData => ({
    ...settings(avatarId),
    avatarUnlocks: { stars, unlockedIds, grandfatheredId },
  });
  const switchWarning = () => container.querySelector("[data-avatar-switch-warning]");

  it("dims a locked tile with its progress, and names the requirement for screen readers", () => {
    state.settings = withUnlocks("stick-green", 12, STICKS);
    renderPicker();
    const lynx = tile("Lynx");
    expect(lynx?.getAttribute("aria-label")).toBe("Lynx, locked. Earn 30 stars, you have 12");
    expect(lynx?.hasAttribute("data-locked")).toBe(true);
    expect(lynx?.textContent).toContain("12/30 ★");
    // Locked tiles can still be tapped to preview them.
    expect(lynx?.hasAttribute("aria-disabled")).toBe(false);
    // An unlocked stick stays a plain radio.
    expect(tile("Sky Stick")?.getAttribute("aria-label")).toBe("Sky Stick");
    expect(tile("Sky Stick")?.hasAttribute("data-locked")).toBe(false);
  });

  it("previews a locked character; Save is disabled with the lock label and never PUTs", async () => {
    state.settings = withUnlocks("stick-green", 12, STICKS);
    renderPicker();
    await click(tile("Lynx"));
    expect(radios().filter((r) => r.getAttribute("aria-checked") === "true")).toEqual([tile("Lynx")]);
    // The saved one stays equipped.
    expect(tile("Green Stick")?.getAttribute("aria-label")).toBe("Green Stick, equipped");
    expect(tile("Green Stick")?.hasAttribute("data-equipped")).toBe(true);
    expect(previewName()).toBe("Lynx");
    expect(previewTag()).toBe("30 ★ to unlock");
    expect(notice()?.textContent).toBe("Earn 30 stars to unlock Lynx. You have 12.");
    // The star progress bar: have / need.
    expect(preview()?.textContent).toContain("12 ★30 ★");
    expect(preview()?.textContent).toContain("Locked");
    expect(saveButton()?.textContent).toBe("Locked: earn 18 more ★");
    expect(saveButton()?.disabled).toBe(true);
    await click(saveButton());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("selects a character the server lists as unlocked, replacing the lock notice", async () => {
    state.settings = withUnlocks("stick-green", 15, [...STICKS, KESTREL.id]);
    renderPicker();
    await click(tile("Lynx"));
    expect(notice()?.textContent).toMatch(/^Earn 30 stars/);
    await click(tile(KESTREL.name));
    expect(tile(KESTREL.name)?.getAttribute("aria-checked")).toBe("true");
    expect(previewTag()).toBe("Unlocked");
    expect(notice()?.textContent).toBe("Your climber and your leaderboard badge.");
    expect(saveButton()?.textContent).toBe("Save character");
    expect(saveButton()?.disabled).toBe(false);
  });

  it("locks the unbought Wraith even at a full star count, and sends Save to its Shop page", async () => {
    const everythingElse = AVATARS.filter((a) => a.unlock.kind !== "purchase").map((a) => a.id);
    state.settings = withUnlocks("stick-green", 900, everythingElse);
    renderPicker();
    expect(tile("Wraith")?.getAttribute("aria-label")).toBe("Wraith, locked. Buy in the Shop");
    expect(tile("Wraith")?.textContent).toContain("Shop");
    // Gecko is free after the tutorial, and every star character is open at 900 stars.
    expect(tile("Gecko")?.hasAttribute("data-locked")).toBe(false);
    expect(tile("Viking")?.hasAttribute("data-locked")).toBe(false);

    await click(tile("Wraith"));
    expect(previewTag()).toBe("2,000 gems");
    expect(preview()?.textContent).toContain("In Shop");
    expect(notice()?.textContent).toBe("Buy Wraith in the Shop for 2,000 gems.");
    expect(preview()?.textContent).not.toContain("★");
    expect(saveButton()?.textContent).toBe("Get it in the Shop");
    expect(saveButton()?.disabled).toBe(false);
    await click(saveButton());
    expect(container.textContent).toContain("Skin details screen");
  });

  it("shows a saved skin as its character's tile, equipped, naming the skin", async () => {
    state.settings = withUnlocks("lynx-void", 30, [...STICKS, "kestrel", "lynx", "lynx-void"]);
    renderPicker();
    expect(tile("Lynx")?.getAttribute("aria-label")).toBe("Lynx, equipped");
    expect(previewTag()).toBe("Equipped · Void Lynx");
    expect(saveButton()?.disabled).toBe(true);
  });

  it("keeps a saved Shop character selectable (grandfathered) and warns before leaving it", async () => {
    state.settings = withUnlocks("wraith", 0, [...STICKS, "wraith"], "wraith");
    renderPicker();
    expect(tile("Wraith")?.getAttribute("aria-label")).toBe("Wraith, equipped");
    expect(tile("Gecko")?.hasAttribute("data-locked")).toBe(true);
    await click(tile("Green Stick"));
    expect(switchWarning()?.textContent).toBe("Switching will lock Wraith until you buy it in the Shop.");
  });

  it("locks the stick figures until the tutorial is done", async () => {
    state.settings = { ...settings(null), avatarUnlocks: { stars: 0, tutorialDone: false, unlockedIds: [], grandfatheredId: null } };
    renderPicker();
    const locked = STICKS.map((id) => tile(avatarEntry(id)!.name));
    expect(locked.every((t) => t?.hasAttribute("data-locked"))).toBe(true);
    expect(locked).toHaveLength(6);
    expect(tile("Green Stick")?.getAttribute("aria-label")).toBe("Green Stick, locked. Finish the tutorial");
    // Initials is never locked.
    expect(tile("Use initials")?.hasAttribute("data-locked")).toBe(false);

    await click(tile("Green Stick"));
    expect(previewTag()).toBe("Finish the tutorial");
    expect(notice()?.textContent).toBe("Finish the tutorial on level 1 to unlock Green Stick.");
    expect(saveButton()?.textContent).toBe("Clear level 1 first");
    expect(saveButton()?.disabled).toBe(true);
    await click(saveButton());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("unlocks the stick figures once the server lists them, and saves one", async () => {
    state.settings = { ...settings(null), avatarUnlocks: { stars: 0, tutorialDone: true, unlockedIds: STICKS, grandfatheredId: null } };
    apiFetch.mockResolvedValueOnce(json(settings("stick-sky")));
    renderPicker();
    for (const id of STICKS) expect(tile(avatarEntry(id)!.name)?.hasAttribute("data-locked")).toBe(false);
    // The star ladder is still locked at 0 stars.
    expect(tile(KESTREL.name)?.hasAttribute("data-locked")).toBe(true);

    await click(tile("Sky Stick"));
    expect(previewTag()).toBe("Unlocked");
    await click(saveButton());
    expect(JSON.parse((apiFetch.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      avatarId: "stick-sky",
    });
    expect(saveButton()?.textContent).toBe("Saved");
  });

  it("shows a grandfathered saved avatar as selectable when the server lists it", () => {
    state.settings = withUnlocks(LYNX.id, 0, [...STICKS, LYNX.id], LYNX.id);
    renderPicker();
    expect(tile(LYNX.name)?.getAttribute("aria-checked")).toBe("true");
    expect(tile(LYNX.name)?.getAttribute("aria-label")).toBe("Lynx, equipped");
    expect(tile(LYNX.name)?.hasAttribute("data-locked")).toBe(false);
  });

  it("warns before switching away from a grandfathered avatar, and ties the warning to Save", async () => {
    state.settings = withUnlocks(LYNX.id, 0, [...STICKS, LYNX.id], LYNX.id);
    renderPicker();
    expect(switchWarning()).toBeNull();

    await click(tile("Green Stick"));
    expect(switchWarning()?.textContent).toBe("Switching will lock Lynx until you earn 30 stars.");
    expect(saveButton()?.getAttribute("aria-describedby")).toBe(switchWarning()?.id);
    expect(saveButton()?.disabled).toBe(false);

    // Going back to the saved avatar clears it.
    await click(tile(LYNX.name));
    expect(switchWarning()).toBeNull();
  });

  it("does not warn when the saved avatar is earned (not grandfathered)", async () => {
    state.settings = withUnlocks(LYNX.id, 30, [...STICKS, KESTREL.id, LYNX.id], null);
    renderPicker();
    await click(tile("Green Stick"));
    expect(switchWarning()).toBeNull();
    expect(saveButton()?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("after a 403 and a refresh that locks the pick, keeps previewing it but shows it locked", async () => {
    state.settings = withUnlocks("stick-green", 15, [...STICKS, KESTREL.id]);
    apiFetch.mockResolvedValueOnce(json({ error: "Earn 15 stars to unlock Kestrel", code: "AVATAR_LOCKED" }, 403));
    renderPicker();
    await click(tile(KESTREL.name));
    await click(saveButton());
    expect(tile(KESTREL.name)?.getAttribute("aria-checked")).toBe("true");

    // The refreshed server state no longer lists Kestrel.
    state.settings = withUnlocks("stick-green", 14, STICKS);
    renderPicker();
    expect(tile(KESTREL.name)?.getAttribute("aria-label")).toBe("Kestrel, locked. Earn 15 stars, you have 14");
    expect(tile(KESTREL.name)?.getAttribute("aria-checked")).toBe("true");
    expect(tile("Green Stick")?.hasAttribute("data-equipped")).toBe(true);
    expect(saveButton()?.textContent).toBe("Locked: earn 1 more ★");
    expect(saveButton()?.disabled).toBe(true);
  });

  it("locks nothing when the server sent no unlock state (an older API that enforces none)", () => {
    state.settings = settings("stick-green");
    renderPicker();
    expect(container.querySelectorAll("[data-locked]")).toHaveLength(0);
    expect(container.querySelector("[data-avatar-next]")).toBeNull();
  });

  it("shows the server's AVATAR_LOCKED message when a save is refused", async () => {
    state.settings = withUnlocks("stick-green", 20, [...STICKS, KESTREL.id]);
    apiFetch.mockResolvedValueOnce(json({ error: "Earn 15 stars to unlock Kestrel", code: "AVATAR_LOCKED" }, 403));
    renderPicker();
    await click(tile(KESTREL.name));
    await click(saveButton());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Earn 15 stars to unlock Kestrel");
    expect(setSettings).not.toHaveBeenCalled();
  });
});

describe("parseAvatarUnlocks / settingsFromResponse avatarUnlocks", () => {
  it("keeps a well-formed state", () => {
    expect(settingsFromResponse({ avatarUnlocks: { stars: 3, unlockedIds: ["wraith"] } })?.avatarUnlocks).toEqual({
      stars: 3,
      unlockedIds: ["wraith"],
      grandfatheredId: null,
    });
    expect(
      settingsFromResponse({ avatarUnlocks: { stars: 3, unlockedIds: ["wraith", "yak"], grandfatheredId: "yak" } })
        ?.avatarUnlocks?.grandfatheredId,
    ).toBe("yak");
  });

  it("keeps a boolean tutorialDone and leaves out anything else", () => {
    const parse = (tutorialDone: unknown) =>
      settingsFromResponse({ avatarUnlocks: { stars: 3, unlockedIds: [], tutorialDone } })?.avatarUnlocks;
    expect(parse(true)?.tutorialDone).toBe(true);
    expect(parse(false)?.tutorialDone).toBe(false);
    for (const bad of ["yes", 1, null, undefined]) {
      const kept = parse(bad);
      expect(kept).toBeDefined();
      expect(kept && "tutorialDone" in kept).toBe(false);
    }
  });

  it("drops a grandfatheredId that is not a catalogue id", () => {
    expect(
      settingsFromResponse({ avatarUnlocks: { stars: 3, unlockedIds: ["wraith"], grandfatheredId: "__proto__" } })
        ?.avatarUnlocks,
    ).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ["missing", undefined],
    ["negative stars", { stars: -1, unlockedIds: [] }],
    ["fractional stars", { stars: 1.5, unlockedIds: [] }],
    ["ids not an array", { stars: 3, unlockedIds: "wraith" }],
    ["an unknown id", { stars: 3, unlockedIds: ["wraith", "__proto__"] }],
  ])("drops %s (so nothing shows locked)", (_label, avatarUnlocks) => {
    expect(settingsFromResponse({ avatarUnlocks })?.avatarUnlocks).toBeUndefined();
  });
});

describe("arrow keys follow the visual grid, group rows included (review W1)", () => {
  const at = (id: string | null) => OPTIONS.findIndex((o) => o.id === id);
  const n = OPTIONS.length;

  it("lays each group out from a new row", () => {
    expect(GRID_CELLS[at("wraith")]).toEqual({ row: 0, col: 0 });
    expect(GRID_CELLS[at("gecko")]).toEqual({ row: 1, col: 0 });
    expect(GRID_CELLS[at("stick-green")]).toEqual({ row: 1, col: 1 });
    expect(GRID_CELLS[at("stick-amber")]).toEqual({ row: 2, col: 0 });
    expect(GRID_CELLS[at("stick-pink")]).toEqual({ row: 3, col: 0 });
    expect(GRID_CELLS[at(null)]).toEqual({ row: 4, col: 0 });
    expect(GRID_CELLS[at("kestrel")]).toEqual({ row: 4, col: 1 });
  });

  it("Down moves straight down across a group boundary, never diagonally", () => {
    expect(nextIndex("ArrowDown", at("wraith"), n)).toBe(at("gecko"));
    expect(nextIndex("ArrowDown", at("gecko"), n)).toBe(at("stick-amber"));
    expect(nextIndex("ArrowDown", at("stick-pink"), n)).toBe(at(null));
  });

  it("Up from a column with nothing above lands on the nearest tile in the row above", () => {
    expect(nextIndex("ArrowUp", at("stick-ember"), n)).toBe(at("wraith"));
    expect(nextIndex("ArrowUp", at("stick-sky"), n)).toBe(at("stick-green"));
  });

  it("stays put at the top and bottom edges; Left/Right still step in order", () => {
    expect(nextIndex("ArrowUp", at("wraith"), n)).toBe(at("wraith"));
    expect(nextIndex("ArrowDown", n - 1, n)).toBe(n - 1);
    expect(nextIndex("ArrowRight", at("gecko"), n)).toBe(at("stick-green"));
    expect(nextIndex("Tab", 0, n)).toBeNull();
  });
});
