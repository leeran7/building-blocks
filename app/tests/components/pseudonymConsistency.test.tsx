/**
 * One player, one name. A player with no display name who picked the Wolf
 * avatar must be called the same thing by the public board, the friends board,
 * the dashboard record, every web and mobile social list (friends, friend
 * requests, challenges, search) and the player's own Profile header.
 *
 * Nothing between the database and the rendered text is re-implemented: the
 * real src/db reads and the real route handlers run against an in-memory
 * Prisma that honours `select`, and the real components fetch through those
 * handlers. Only auth, rate limiting, navigation, haptics and the AppData
 * invalidate hook are stubbed.
 *
 * @vitest-environment happy-dom
 */

import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../src/db/client", async () => ({ prisma: (await import("../api/fakeSocialPrisma")).fakePrisma }));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "me-1", email: "me@e.com", email_verified: true })),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
// FriendRequestsSection marks cached boards stale on accept; nothing here accepts.
vi.mock("../../mobile/src/contexts/AppDataContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mobile/src/contexts/AppDataContext")>()),
  useInvalidateAppData: () => () => {},
}));
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { uid: "me-1" }, loading: false, isAnonymous: false, signOut: async () => {} }),
}));

type Handler = (req: NextRequest) => Promise<Response>;

// Both clients' fetches go to the real route handlers, imported statically
// below and registered here (a lazy import inside the fetch made the first
// render's timing depend on module-load speed under suite load).
const { routes, routeFetch } = vi.hoisted(() => {
  const routes = new Map<string, Handler>();
  const routeFetch = async (url: string): Promise<Response> => {
    const u = new URL(url, "http://localhost");
    const handler = routes.get(u.pathname);
    if (!handler) return new Response("{}", { status: 404 });
    return handler(new NextRequest(`http://localhost${u.pathname}${u.search}`, { headers: { authorization: "Bearer t" } }));
  };
  return { routes, routeFetch };
});
vi.mock("../../mobile/src/lib/api", () => ({ apiFetch: (path: string) => routeFetch(path) }));

import { GET as friendsGET } from "../../app/api/friends/route";
import { GET as friendRequestsGET } from "../../app/api/friends/requests/route";
import { GET as challengesGET } from "../../app/api/challenge/route";
import { GET as searchGET } from "../../app/api/users/search/route";
import { addUser, befriend, challengeBetween, db, resetDb } from "../api/fakeSocialPrisma";
import { climberHandle } from "../../src/lib/handle";
import { FREE_STACK_SLUG } from "../../src/game/freeStack";
import { friendsLeaderboard, getUserFreeClimbRecord, topFreeClimbers } from "../../src/db/climb";
import { FriendsListSection } from "../../mobile/src/components/challenge/FriendsListSection";
import { FriendRequestsSection } from "../../mobile/src/components/challenge/FriendRequestsSection";
import { PendingChallengesSection } from "../../mobile/src/components/challenge/PendingChallengesSection";
import { UserSearchSection } from "../../mobile/src/components/challenge/UserSearchSection";
import { FriendsList } from "../../src/components/Challenge/FriendsList";
import { FriendRequests } from "../../src/components/Challenge/FriendRequests";
import { PendingChallenges } from "../../src/components/Challenge/PendingChallenges";
import { UserSearch } from "../../src/components/Challenge/UserSearch";
import { identityNameFor } from "../../mobile/src/lib/identity";
import type { DashboardData } from "../../mobile/src/contexts/AppDataContext";

routes.set("/api/friends", friendsGET);
routes.set("/api/friends/requests", friendRequestsGET);
routes.set("/api/challenge", challengesGET);
routes.set("/api/users/search", searchGET);

const ME = "me-1";
const WOLF = "wolfy-7";
const WOLF_USERNAME = "wolfy";
const WOLF_NAME = climberHandle(WOLF, "wolf");
const HASH_NAME = climberHandle(WOLF);

/** Upper bound for a list to render the row under test. */
const SETTLE_TIMEOUT_MS = 3000;

let root: Root | null = null;
let container: HTMLElement | null = null;

function unmount() {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
}

/** Type into the component's search box, as a player would. */
async function typeQuery(el: HTMLElement, q: string) {
  const input = el.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, q);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * Render `el`, optionally drive it, and wait until the player's row appears:
 * any handle ending in the pseudonym's number, whichever animal it shows, so a
 * surface that ignores the avatar still settles and then fails the assertion.
 */
async function render(el: ReactElement, drive?: (c: HTMLElement) => Promise<void>): Promise<string> {
  unmount();
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(MemoryRouter, null, el));
  });
  if (drive) await drive(container);
  const [adjective, , num] = WOLF_NAME.split(" ");
  const rowShown = () => new RegExp(`${adjective} \\w+ ${num}\\b`).test(container!.textContent ?? "");
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline && !rowShown()) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  expect(rowShown()).toBe(true);
  return container.textContent ?? "";
}

beforeEach(() => {
  resetDb();
  addUser({ id: ME, display_name: "Me" });
  addUser({ id: WOLF, avatar_id: "wolf", username: WOLF_USERNAME });
  befriend(ME, WOLF);
  befriend(WOLF, ME, "pending");
  challengeBetween(WOLF, ME);
  db.records.push(
    { userId: WOLF, category_slug: FREE_STACK_SLUG, peak_y: 900, wins: 0, updated_at: new Date(0) },
    { userId: ME, category_slug: FREE_STACK_SLUG, peak_y: 100, wins: 0, updated_at: new Date(0) }
  );
  vi.stubGlobal("fetch", (url: string) => routeFetch(url));
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("a pseudonymous Wolf gets one name everywhere", () => {
  it("is a Wolf name the hash alone would not produce", () => {
    expect(WOLF_NAME).toMatch(/ Wolf \d+$/);
    expect(HASH_NAME).not.toBe(WOLF_NAME);
  });

  it("agrees across both boards and the dashboard record", async () => {
    const global = (await topFreeClimbers(50)).find((c) => c.userId === WOLF)?.handle;
    const friends = (await friendsLeaderboard(ME)).climbers.find((c) => c.userId === WOLF)?.handle;
    const dashboard = (await getUserFreeClimbRecord(WOLF))?.handle;
    expect({ global, friends, dashboard }).toEqual({ global: WOLF_NAME, friends: WOLF_NAME, dashboard: WOLF_NAME });
  });

  const search = (c: HTMLElement) => typeQuery(c, WOLF_USERNAME);
  const surfaces: Array<[string, () => ReactElement, ((c: HTMLElement) => Promise<void>)?]> = [
    ["mobile friends list", () => createElement(FriendsListSection)],
    ["mobile friend requests", () => createElement(FriendRequestsSection)],
    ["mobile pending challenges", () => createElement(PendingChallengesSection)],
    ["mobile user search", () => createElement(UserSearchSection), search],
    ["web friends list", () => createElement(FriendsList, { onChallenge: async () => true })],
    ["web friend requests", () => createElement(FriendRequests)],
    ["web pending challenges", () => createElement(PendingChallenges)],
    ["web user search", () => createElement(UserSearch, { onSelect: async () => true }), search],
  ];

  it.each(surfaces)("the %s shows the Wolf name, never the hash one", async (_label, el, drive) => {
    const text = await render(el(), drive);
    expect(text).toContain(WOLF_NAME);
    expect(text).not.toContain(HASH_NAME);
  });

  // The web lists also hand the name to the /duel parent (challenge / add
  // confirmations), computed separately from the rendered row.
  const clickRow = async (label: string) => {
    const button = Array.from(container!.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
      await Promise.resolve();
    });
  };

  it("the web user search passes the Wolf name to onSelect", async () => {
    const onSelect = vi.fn(async () => true);
    await render(createElement(UserSearch, { onSelect }), search);
    await clickRow(WOLF_NAME);
    expect(onSelect).toHaveBeenCalledWith(WOLF, WOLF_NAME);
  });

  it("the web friends list passes the Wolf name to onChallenge", async () => {
    const onChallenge = vi.fn(async () => true);
    await render(createElement(FriendsList, { onChallenge }));
    await clickRow("Challenge");
    expect(onChallenge).toHaveBeenCalledWith(WOLF, WOLF_NAME);
  });
});

describe("identityNameFor (the player's own Profile header)", () => {
  const dashFor = (handle: string): DashboardData => ({
    user: { id: WOLF, email: "w@e.com", username: null },
    freeClimb: { peakY: 900, rank: 1, totalClimbers: 2, wins: 0, handle },
  });
  const settings = (avatarId: string | null, displayName: string | null = null) => ({
    displayName,
    username: null,
    social: null,
    leaderboardConsent: true,
    avatarId,
  });

  it("renames at once from the saved avatar, before the dashboard refetch lands", () => {
    // The cached dashboard still carries the pre-save name.
    expect(identityNameFor(settings("wolf"), dashFor(HASH_NAME))).toBe(WOLF_NAME);
  });

  it("returns to the hash animal when a non-animal avatar is saved", () => {
    expect(identityNameFor(settings("wraith"), dashFor(WOLF_NAME))).toBe(HASH_NAME);
  });

  it("keeps a custom display name whatever the avatar", () => {
    expect(identityNameFor(settings("wolf", "Aria"), dashFor("Aria"))).toBe("Aria");
  });

  it("uses the dashboard handle while settings are not loaded, and the email with no climb", () => {
    expect(identityNameFor(null, dashFor("Server Name 1"))).toBe("Server Name 1");
    expect(identityNameFor(settings("wolf"), { ...dashFor("x"), freeClimb: null })).toBe("w@e.com");
  });
});
