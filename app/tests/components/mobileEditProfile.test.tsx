/**
 * Edit Profile on the mobile SPA: unsaved edits survive a trip to the avatar
 * picker, and the save response goes through the shared settingsFromResponse
 * allow-list. The picker is pushed as its own route, which unmounts Edit
 * Profile, so without the draft the typed name was silently lost.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATARS } from "@app/lib/avatars";
import { climberHandle } from "@app/lib/handle";
import type { SettingsData } from "../../mobile/src/contexts/AppDataContext";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { apiFetch, setSettings, invalidate, state } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  setSettings: vi.fn(),
  invalidate: vi.fn(),
  state: { settings: null as SettingsData | null, uid: "u1" },
}));

vi.mock("../../mobile/src/lib/api", () => ({ apiFetch, API_BASE: "https://example.test" }));
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: state.uid }, loading: false, signOut: vi.fn(async () => {}) }),
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
      loading: false,
      error: null,
      fetchedAt: 1,
      setSettings,
      refreshSettings: vi.fn(async () => {}),
    }),
    useDashboard: () => ({ data: null, loading: false, error: null, fetchedAt: 1 }),
    useInvalidateAppData: () => invalidate,
    useClearAppData: () => vi.fn(),
  };
});

import { EditProfileScreen } from "../../mobile/src/screens/EditProfileScreen";
import { AvatarPickerScreen } from "../../mobile/src/screens/AvatarPickerScreen";
import { stashEditProfileDraft, takeEditProfileDraft } from "../../mobile/src/lib/editProfileDraft";
import { initialsOf } from "../../mobile/src/lib/leaderboard";

const [FIRST] = AVATARS;
const SAVED_NAME = "Aria Stone";
const TYPED_NAME = "Aria Unsaved";

function settings(over: Partial<SettingsData> = {}): SettingsData {
  return {
    displayName: SAVED_NAME,
    username: "aria",
    social: null,
    leaderboardConsent: true,
    avatarId: null,
    ...over,
  };
}

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  state.uid = "u1";
  state.settings = settings();
  // Module-level draft: make sure no earlier test leaves one behind.
  takeEditProfileDraft("u1");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function ProfileStub() {
  const navigate = useNavigate();
  return createElement("button", { type: "button", onClick: () => navigate("/profile/edit") }, "Open edit profile");
}

/** Edit Profile pushed on Profile, with the real picker route above it (App.tsx:70-72). */
function renderEditProfile() {
  act(() =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/profile", "/profile/edit"], initialIndex: 1 },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/profile", element: createElement(ProfileStub) }),
          createElement(Route, { path: "/profile/edit", element: createElement(EditProfileScreen) }),
          createElement(Route, { path: "/profile/avatar", element: createElement(AvatarPickerScreen) }),
        ),
      ),
    ),
  );
}

/** The text input inside the "Display name" field label. */
const nameInput = () =>
  [...container.querySelectorAll("label")]
    .find((l) => l.firstElementChild?.textContent === "Display name")
    ?.querySelector<HTMLInputElement>("input") ?? null;
const button = (re: RegExp) => [...container.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);
const heading = () => container.querySelector("h1")?.textContent;

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function type(input: HTMLInputElement | null, value: string) {
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function putBody(call: number): Record<string, unknown> {
  const [path, init] = apiFetch.mock.calls[call] as [string, RequestInit];
  expect(path).toBe("/api/settings");
  expect(init.method).toBe("PUT");
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("EditProfileScreen unsaved edits across the avatar picker", () => {
  it("keeps a typed name after opening the picker and going Back, and Save still sends it", async () => {
    renderEditProfile();
    expect(nameInput()?.value).toBe(SAVED_NAME);
    type(nameInput(), TYPED_NAME);
    expect(button(/save changes/i)?.disabled).toBe(false);

    await click(byLabel("Avatar:"));
    expect(heading()).toBe("Choose avatar");
    await click(byLabel("Back"));

    expect(heading()).toBe("Edit profile");
    expect(nameInput()?.value).toBe(TYPED_NAME);
    expect(button(/save changes/i)?.disabled).toBe(false);

    apiFetch.mockResolvedValueOnce(json(settings({ displayName: TYPED_NAME })));
    await click(button(/save changes/i));
    expect(putBody(0)).toMatchObject({ displayName: TYPED_NAME, username: "aria" });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ displayName: TYPED_NAME }));
  });

  it("keeps typed username and social handles through a saved avatar pick", async () => {
    renderEditProfile();
    type(container.querySelector<HTMLInputElement>('input[placeholder="yourhandle"]'), "aria2");
    type(container.querySelector<HTMLInputElement>('input[aria-label="X handle"]'), "ariaclimbs");

    await click(byLabel("Avatar:"));
    // The picker's save updates the cached settings and pops back.
    apiFetch.mockResolvedValueOnce(json(settings({ avatarId: FIRST.id })));
    state.settings = settings({ avatarId: FIRST.id });
    await click(container.querySelector(`[role="radio"][aria-label="${FIRST.name}"]`));
    await click(button(/save avatar/i));

    expect(heading()).toBe("Edit profile");
    expect(container.querySelector<HTMLInputElement>('input[placeholder="yourhandle"]')?.value).toBe("aria2");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="X handle"]')?.value).toBe("ariaclimbs");
    expect(byLabel("Avatar:")?.getAttribute("aria-label")).toBe(`Avatar: ${FIRST.name}. Change avatar`);
  });

  it("starts from the saved values after leaving Edit Profile via Back and reopening it", async () => {
    renderEditProfile();
    type(nameInput(), TYPED_NAME);
    await click(byLabel("Avatar:"));
    await click(byLabel("Back"));
    expect(nameInput()?.value).toBe(TYPED_NAME);

    await click(byLabel("Back"));
    await click(button(/open edit profile/i));
    expect(heading()).toBe("Edit profile");
    expect(nameInput()?.value).toBe(SAVED_NAME);
    expect(button(/save changes/i)?.disabled).toBe(true);
  });
});

describe("EditProfileScreen save response", () => {
  it("normalises the PUT body through settingsFromResponse", async () => {
    renderEditProfile();
    type(nameInput(), TYPED_NAME);
    apiFetch.mockResolvedValueOnce(
      json({ displayName: TYPED_NAME, username: 7, social: "x", leaderboardConsent: 1, avatarId: "retired-avatar" }),
    );
    await click(button(/save changes/i));
    expect(setSettings).toHaveBeenCalledWith({
      displayName: TYPED_NAME,
      username: null,
      social: null,
      leaderboardConsent: true,
      avatarId: null,
    });
  });

  it("treats a non-object success body as a failed save", async () => {
    renderEditProfile();
    type(nameInput(), TYPED_NAME);
    apiFetch.mockResolvedValueOnce(json(null));
    await click(button(/save changes/i));
    expect(setSettings).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save. Try again.");
    expect(nameInput()?.value).toBe(TYPED_NAME);
  });
});

describe("editProfileDraft", () => {
  it("returns a draft once, and only to the account that stashed it", () => {
    const draft = { displayName: TYPED_NAME, username: "aria2", social: { X: "ariaclimbs" } };
    stashEditProfileDraft("u1", draft);
    expect(takeEditProfileDraft("u2")).toBeNull();
    expect(takeEditProfileDraft("u1")).toBeNull();

    stashEditProfileDraft("u1", draft);
    expect(takeEditProfileDraft("u1")).toEqual(draft);
    expect(takeEditProfileDraft("u1")).toBeNull();
  });
});

describe("EditProfileScreen avatar row", () => {
  it("badges a player with no display name by their pseudonym's initials before the dashboard loads", () => {
    state.settings = settings({ displayName: null, avatarId: null });
    renderEditProfile();

    const badge = byLabel("Avatar: Initials")?.querySelector(".hex")?.textContent;
    expect(badge).toBe(initialsOf(climberHandle("u1", null)));
    expect(badge).not.toBe(initialsOf("Player"));
  });
});

describe("EditProfileScreen display name placeholder", () => {
  const PICKED = "wolf";

  it("uses a fixture whose picked animal differs from the uid's hash animal", () => {
    expect(climberHandle("u1", PICKED)).not.toBe(climberHandle("u1", null));
    expect(climberHandle("u1", PICKED)).toContain("Wolf");
  });

  it("shows a pseudonymous player the name others see, without prefilling it", () => {
    state.settings = settings({ displayName: null, avatarId: PICKED });
    renderEditProfile();

    expect(nameInput()?.placeholder).toBe(climberHandle("u1", PICKED));
    expect(nameInput()?.value).toBe("");
    expect(button(/save changes/i)?.disabled).toBe(true);
  });

  it("still saves a null display name for a pseudonymous player who edits another field", async () => {
    state.settings = settings({ displayName: null, avatarId: PICKED });
    renderEditProfile();
    type(container.querySelector<HTMLInputElement>('input[placeholder="yourhandle"]'), "wolfy");

    apiFetch.mockResolvedValueOnce(json(settings({ displayName: null, username: "wolfy", avatarId: PICKED })));
    await click(button(/save changes/i));
    expect(putBody(0)).toMatchObject({ displayName: null, username: "wolfy" });
  });

  it("shows a named player the pseudonym their name reverts to once they clear it", () => {
    state.settings = settings({ displayName: SAVED_NAME, avatarId: PICKED });
    renderEditProfile();
    expect(nameInput()?.value).toBe(SAVED_NAME);

    type(nameInput(), "");
    expect(nameInput()?.placeholder).toBe(climberHandle("u1", PICKED));
    expect(nameInput()?.placeholder).not.toBe(SAVED_NAME);
  });
});

describe("Leaderboard visibility counts as saved only when the server echoes it", () => {
  const visibility = () => container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Leaderboard visibility"]');

  async function toggleAfter(response: Response) {
    state.settings = settings({ leaderboardConsent: true });
    apiFetch.mockResolvedValueOnce(response);
    renderEditProfile();
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
    expect(invalidate).toHaveBeenCalledWith(["leaderboard"]);
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
