/**
 * Profile header name on the mobile SPA. A player with no display name is shown
 * under their pseudonym, whose animal follows the avatar the same header draws.
 * Profile still renders the header when the dashboard failed or has not loaded,
 * so the name must then come from the signed-in uid (useAuth), not fall back to
 * "Player" or reach for the email.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { climberHandle, defaultAvatarFor } from "@app/lib/handle";
import type { DashboardData, SettingsData } from "../../mobile/src/contexts/AppDataContext";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const UID = "u1";
const AVATAR = "wolf";
const EMAIL = "aria@example.test";

const { state } = vi.hoisted(() => ({
  state: {
    settings: null as SettingsData | null,
    dash: { data: null as DashboardData | null, error: null as string | null },
  },
}));

vi.mock("../../mobile/src/lib/api", () => ({ apiFetch: vi.fn(), API_BASE: "https://example.test" }));
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: UID }, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
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
      setSettings: vi.fn(),
      refreshSettings: vi.fn(async () => {}),
    }),
    useDashboard: () => ({ data: state.dash.data, loading: false, error: state.dash.error, fetchedAt: 1 }),
    useInvalidateAppData: () => vi.fn(),
  };
});

import { ProfileScreen } from "../../mobile/src/screens/ProfileScreen";
import { avatarSrc } from "../../mobile/src/lib/avatarImages";

const NEVER_CLIMBED: SettingsData = {
  displayName: null,
  username: null,
  social: null,
  leaderboardConsent: true,
  avatarId: AVATAR,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.settings = NEVER_CLIMBED;
  state.dash = { data: null, error: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderProfile() {
  act(() =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/profile"] },
        createElement(Routes, null, createElement(Route, { path: "/profile", element: createElement(ProfileScreen) })),
      ),
    ),
  );
}

/** The identity card: the avatar button's section. */
function identityCard(): HTMLElement {
  // The avatar button is named "Avatar: <current>. Change avatar".
  const card = container.querySelector('button[aria-label$=". Change avatar"]')?.closest("section");
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

/** The header name line: the first text line beside the avatar. */
function headerName(): string | null | undefined {
  return identityCard().querySelector(":scope > div > p")?.textContent;
}

describe("Profile header name for a player with no display name", () => {
  it("uses a fixture whose chosen animal differs from the uid's hash animal", () => {
    // Otherwise the avatar-aware and hash-only names coincide and nothing below could fail.
    expect(defaultAvatarFor(UID)).not.toBe(AVATAR);
    expect(climberHandle(UID, AVATAR)).not.toBe(climberHandle(UID, null));
    expect(climberHandle(UID, AVATAR)).toContain("Wolf");
    expect(avatarSrc(AVATAR)).toBeTruthy();
  });

  it.each([
    ["the dashboard failed", { data: null, error: "down" }],
    ["the dashboard is absent", { data: null, error: null }],
  ])("names the Wolf picture's pseudonym from the signed-in uid when %s", (_label, dash) => {
    state.dash = dash;
    renderProfile();

    expect(headerName()).toBe(climberHandle(UID, AVATAR));
    expect(headerName()).not.toBe("Player");
    // The header draws the Wolf picture the name matches.
    const img = identityCard().querySelector("img");
    expect(img?.getAttribute("src")).toBe(avatarSrc(AVATAR));
  });

  it("keeps the email off the name line for a never-climbed account", () => {
    state.dash = {
      data: { user: { id: UID, email: EMAIL, username: null }, freeClimb: null },
      error: null,
    };
    renderProfile();

    expect(headerName()).toBe(climberHandle(UID, AVATAR));
    const lines = [...identityCard().querySelectorAll(":scope > div > p")].map((p) => p.textContent);
    expect(lines.filter((t) => t?.includes(EMAIL))).toEqual([EMAIL]);
    expect(lines[0]).not.toContain(EMAIL);
  });
});

describe("Profile header name for the longest pseudonym", () => {
  it("puts the whole name, animal and number included, on the name line", () => {
    // qa-53 with Kestrel is the generator's longest: 8-letter adjective, 7-letter animal, 2 digits.
    const longUid = "qa-53";
    const longest = climberHandle(longUid, "kestrel");
    expect(longest.split(" ").map((w) => w.length)).toEqual([8, 7, 2]);
    state.settings = { ...NEVER_CLIMBED, avatarId: "kestrel" };
    state.dash = {
      data: { user: { id: longUid, email: EMAIL, username: null }, freeClimb: null },
      error: null,
    };
    renderProfile();

    expect(headerName()).toBe(longest);
    // The pencil stays beside the name.
    expect(identityCard().querySelector('button[aria-label="Edit profile"]')).toBeTruthy();
  });
});
