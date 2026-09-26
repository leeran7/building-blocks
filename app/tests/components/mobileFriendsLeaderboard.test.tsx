/**
 * Friends tab on the native Ranks screen (mobile/src/screens/LeaderboardScreen)
 * and the friendsLeaderboard AppData slice behind it.
 *
 * Renders the real screen inside the real AppDataProvider; only the network
 * (apiFetch), auth and haptics are mocked. Guards: the friends board is fetched
 * only once the Friends tab is opened; "Race your friends" appears only when
 * nobody but the caller is on the board and no friend is hidden or unclimbed;
 * the footer accounts for hidden and unclimbed friends; accepting a friend
 * request marks the cached board stale so it refetches.
 *
 * @vitest-environment happy-dom
 */

import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ uid: "me" as string | null }));

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.uid ? { uid: auth.uid } : null, isAnonymous: false, loading: false }),
}));

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

interface Row {
  rank: number;
  userId: string;
  handle: string;
  username: string | null;
  peakY: number;
  wins: number;
}
interface Board {
  climbers: Row[];
  hiddenCount: number;
  notClimbedCount: number;
}

const net = vi.hoisted(() => ({
  friendsBoard: null as unknown,
  global: null as unknown[] | null,
  incoming: [] as unknown[],
  /** When set, matching requests stay pending until the test settles them. */
  hold: null as null | "/api/climb/leaderboard/friends" | "/api/settings",
  held: [] as Array<(body: unknown) => void>,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, _init?: RequestInit): Promise<Response> => {
  if (path === net.hold) {
    return new Promise<Response>((resolve) => net.held.push((body) => resolve(jsonResponse(body))));
  }
  if (path === "/api/climb/leaderboard/friends") return jsonResponse(net.friendsBoard);
  if (path === "/api/climb/leaderboard") return jsonResponse({ climbers: net.global ?? GLOBAL });
  if (path === "/api/dashboard") return jsonResponse({ freeClimb: null });
  if (path === "/api/settings") return jsonResponse({ leaderboardConsent: true });
  if (path === "/api/friends/requests") return jsonResponse({ incoming: net.incoming, outgoing: [] });
  if (/^\/api\/friends\/[^/]+\/accept$/.test(path)) return jsonResponse({ ok: true });
  return jsonResponse({}, 404);
});
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
}));

import {
  AppDataProvider,
  useClearAppData,
  useFriendsLeaderboard,
  useSettings,
} from "../../mobile/src/contexts/AppDataContext";
import { hasLeaderboardConsent, setLeaderboardConsent } from "../../mobile/src/lib/consent";
import { LeaderboardScreen } from "../../mobile/src/screens/LeaderboardScreen";
import { FriendRequestsSection } from "../../mobile/src/components/challenge/FriendRequestsSection";

const row = (rank: number, userId: string, peakY: number): Row => ({
  rank,
  userId,
  handle: `Climber ${userId}`,
  username: null,
  peakY,
  wins: 0,
});

const GLOBAL: Row[] = [row(1, "g1", 9000), row(2, "g2", 8000), row(3, "g3", 7000), row(4, "g4", 6000)];

const friendsCalls = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/leaderboard/friends").length;
const globalCalls = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/leaderboard").length;

function LocationProbe() {
  const loc = useLocation();
  return createElement("output", { "data-testid": "path" }, loc.pathname);
}

let mounted: { container: HTMLElement; rerender: () => Promise<void>; unmount: () => void } | null = null;

async function mount(el: ReactElement, path = "/leaderboard?board=alltime") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  const tree = () =>
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(AppDataProvider, null, el, createElement(LocationProbe)),
    );
  await act(async () => {
    root = createRoot(container);
    root.render(tree());
  });
  mounted = {
    container,
    async rerender() {
      await act(async () => root.render(tree()));
    },
    unmount() {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
  return container;
}

const screen = () =>
  createElement(
    Routes,
    null,
    createElement(Route, { path: "/leaderboard", element: createElement(LeaderboardScreen) }),
    createElement(Route, { path: "/challenge", element: createElement("p", null, "challenge screen") }),
  );

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

const friendsTab = (c: HTMLElement) => c.querySelector("#lb-tab-friends");
const buttonByText = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);

/** A real pull-to-refresh gesture on the real PullToRefresh (80px damped pull, over the 60px threshold). */
async function pullToRefresh(c: HTMLElement) {
  const target = c.querySelector("header");
  if (!target) throw new Error("header not found");
  const touch = (type: string, clientY: number) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "touches", { value: [{ clientY }] });
    target.dispatchEvent(e);
  };
  await act(async () => {
    touch("touchstart", 100);
    touch("touchmove", 300);
  });
  await act(async () => {
    touch("touchend", 300);
  });
}

beforeEach(() => {
  auth.uid = "me";
  apiFetch.mockClear();
  net.friendsBoard = null;
  net.global = null;
  net.incoming = [];
  net.hold = null;
  net.held = [];
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("Ranks screen Friends tab", () => {
  it("does not request the friends board until the Friends tab is opened", async () => {
    const board: Board = { climbers: [row(1, "aria", 500), row(2, "me", 100)], hiddenCount: 0, notClimbedCount: 0 };
    net.friendsBoard = board;
    const c = await mount(screen());

    expect(apiFetch.mock.calls.some(([p]) => p === "/api/climb/leaderboard")).toBe(true);
    expect(friendsCalls()).toBe(0);
    expect(c.textContent).toContain("Climber g1");

    await click(friendsTab(c));

    expect(friendsCalls()).toBe(1);
    expect(friendsTab(c)?.getAttribute("aria-selected")).toBe("true");
    expect(c.textContent).toContain("Climber aria");
    expect(c.textContent).not.toContain("Climber g1");
    expect(c.textContent).toContain("You're #2");
  });

  it("shows 'Race your friends' when only the caller is on the board, and its button opens /challenge", async () => {
    net.friendsBoard = { climbers: [row(1, "me", 250)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    const c = await mount(screen());
    await click(friendsTab(c));

    expect(c.textContent).toContain("Race your friends");
    await click(buttonByText(c, "Find friends"));
    expect(c.querySelector("[data-testid=path]")?.textContent).toBe("/challenge");
  });

  it("shows the unranked banner and the footer, not the empty state, when friends are hidden or unclimbed", async () => {
    net.friendsBoard = { climbers: [], hiddenCount: 1, notClimbedCount: 2 } satisfies Board;
    const c = await mount(screen());
    await click(friendsTab(c));

    expect(c.textContent).not.toContain("Race your friends");
    expect(c.textContent).toContain("Not ranked yet");
    expect(c.textContent).toContain("2 friends haven't climbed yet · 1 hidden");
    // No one to put on it, so no podium of empty "Open" pedestals either.
    expect(c.querySelector('[aria-label="Top three climbers"]')).toBeNull();
  });

  it.each([
    { hiddenCount: 2, notClimbedCount: 0, footer: "2 friends are hidden" },
    { hiddenCount: 0, notClimbedCount: 1, footer: "1 friend hasn't climbed yet" },
  ])(
    "keeps the caller's board, not the empty state, when the only other friends are $footer",
    async ({ hiddenCount, notClimbedCount, footer }) => {
      net.friendsBoard = { climbers: [row(1, "me", 250)], hiddenCount, notClimbedCount } satisfies Board;
      const c = await mount(screen());
      await click(friendsTab(c));

      expect(c.textContent).not.toContain("Race your friends");
      expect(c.textContent).toContain("You're #1");
      expect(c.textContent).toContain(footer);
    },
  );

  it("shows the footer under a ranked board and drops it again on Global", async () => {
    net.friendsBoard = {
      climbers: [row(1, "me", 900), row(2, "aria", 400)],
      hiddenCount: 3,
      notClimbedCount: 0,
    } satisfies Board;
    const c = await mount(screen());
    await click(friendsTab(c));

    expect(c.textContent).toContain("You're #1");
    expect(c.textContent).toContain("3 friends are hidden");

    await click(c.querySelector("#lb-tab-global"));
    expect(c.textContent).not.toContain("friends are hidden");
    expect(c.textContent).toContain("Climber g1");
  });

  it("shows the error state rather than a board for a malformed friends response", async () => {
    net.friendsBoard = { climbers: [row(1, "me", 900)], hiddenCount: "3" };
    const c = await mount(screen());
    await click(friendsTab(c));

    expect(c.textContent).toContain("Couldn't load the leaderboard");
    expect(c.textContent).not.toContain("Race your friends");
  });
});

/** Icons sitting in a hex-clipped rim inside a hex-clipped fill (the shared .hex rule). */
const hexBadgeIcons = (el: Element | null | undefined) =>
  Array.from(el?.querySelectorAll("svg") ?? []).filter(
    (svg) => svg.parentElement?.classList.contains("hex") && svg.parentElement.parentElement?.classList.contains("hex"),
  );

describe("hex icon badge", () => {
  it("clips the ranked banner's badge and the 'Race your friends' badge with the shared hex shape", async () => {
    net.friendsBoard = { climbers: [row(1, "me", 250)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    net.global = [row(1, "g1", 9000), row(2, "me", 100)];
    const c = await mount(screen());

    // On the podium, so the banner has no "Show my row" action and is a live region.
    const banner = Array.from(c.querySelectorAll('[aria-live="polite"]')).find((el) =>
      el.textContent?.includes("You're #2"),
    );
    expect(banner).toBeDefined();
    expect(hexBadgeIcons(banner)).toHaveLength(1);

    await click(friendsTab(c));
    const card = Array.from(c.querySelectorAll("section")).find((el) => el.textContent?.includes("Race your friends"));
    expect(hexBadgeIcons(card)).toHaveLength(1);
  });
});

describe("Ranks screen Global tab", () => {
  it("shows the no-climbs message, not a banner or podium, when nobody has climbed", async () => {
    net.global = [];
    const c = await mount(screen());

    expect(c.textContent).toContain("No climbs yet. Be the first to the top.");
    expect(c.textContent).not.toContain("Not ranked yet");
    expect(c.querySelector('[aria-label="Top three climbers"]')).toBeNull();
  });
});

describe("pull-to-refresh on the Ranks screen", () => {
  it("refreshes only the board on the active tab", async () => {
    net.friendsBoard = { climbers: [row(1, "me", 100)], hiddenCount: 0, notClimbedCount: 1 } satisfies Board;
    const c = await mount(screen());
    await click(friendsTab(c));
    const global0 = globalCalls();
    expect(friendsCalls()).toBe(1);

    net.friendsBoard = { climbers: [row(1, "aria", 700), row(2, "me", 100)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    await pullToRefresh(c);
    expect(friendsCalls()).toBe(2);
    expect(globalCalls()).toBe(global0);
    expect(c.textContent).toContain("Climber aria");

    await click(c.querySelector("#lb-tab-global"));
    await pullToRefresh(c);
    expect(globalCalls()).toBe(global0 + 1);
    expect(friendsCalls()).toBe(2);
  });
});

function FriendsBoardProbe() {
  const { data, refreshFriendsLeaderboard } = useFriendsLeaderboard(true);
  const clearAll = useClearAppData();
  return createElement(
    "div",
    null,
    createElement("output", { "data-testid": "friends" }, data ? data.climbers.map((c) => c.userId).join(",") : ""),
    createElement("button", { type: "button", onClick: clearAll }, "Clear cache"),
    createElement("button", { type: "button", onClick: () => void refreshFriendsLeaderboard() }, "Refresh"),
  );
}

const probeText = (c: HTMLElement) => c.querySelector("[data-testid=friends]")?.textContent;

function SettingsProbe() {
  const { data } = useSettings();
  return createElement("output", { "data-testid": "settings" }, data?.displayName ?? "");
}

/** Resolve the i-th held request with `body` and let React commit the result. */
async function settle(i: number, body: unknown) {
  await act(async () => {
    net.held[i](body);
  });
}

describe("friends board cache and the signed-in account", () => {
  it("drops the previous account's friends board on an account switch and fetches the new one", async () => {
    net.friendsBoard = { climbers: [row(1, "aria", 400), row(2, "me", 100)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    const c = await mount(createElement(FriendsBoardProbe));
    expect(probeText(c)).toBe("aria,me");
    expect(friendsCalls()).toBe(1);

    auth.uid = "other";
    net.friendsBoard = { climbers: [row(1, "other", 50)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    await mounted!.rerender();

    expect(friendsCalls()).toBe(2);
    expect(probeText(c)).toBe("other");
  });

  it("clearAll (sign-out / delete) empties the friends board so it is refetched", async () => {
    net.friendsBoard = { climbers: [row(1, "me", 100)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    const c = await mount(createElement(FriendsBoardProbe));
    expect(friendsCalls()).toBe(1);

    await click(buttonByText(c, "Clear cache"));
    expect(friendsCalls()).toBe(2);
  });

  it("discards a friends board that lands after the account switched, and keeps one fetch per slice", async () => {
    net.hold = "/api/climb/leaderboard/friends";
    const c = await mount(createElement(FriendsBoardProbe));
    expect(net.held).toHaveLength(1);

    auth.uid = "other";
    await mounted!.rerender();
    expect(net.held).toHaveLength(2);

    // The first account's response arrives while the second account's is still pending.
    await settle(0, { climbers: [row(1, "aria", 400), row(2, "me", 100)], hiddenCount: 0, notClimbedCount: 0 });
    expect(probeText(c)).toBe("");
    // The stale response must not free the slot the new account's fetch holds.
    await click(buttonByText(c, "Refresh"));
    expect(friendsCalls()).toBe(2);

    await settle(1, { climbers: [row(1, "other", 50)], hiddenCount: 0, notClimbedCount: 0 });
    expect(probeText(c)).toBe("other");
  });

  it("a late friends board from the previous account does not stop the new account fetching its own", async () => {
    net.hold = "/api/climb/leaderboard/friends";
    const c = await mount(screen());
    await click(friendsTab(c));
    expect(friendsCalls()).toBe(1);
    await click(c.querySelector("#lb-tab-global"));

    // The new account never opened Friends, so nothing of its own is in flight.
    auth.uid = "other";
    await mounted!.rerender();
    await settle(0, { climbers: [row(1, "aria", 400), row(2, "me", 100)], hiddenCount: 0, notClimbedCount: 0 });
    expect(friendsCalls()).toBe(1);

    await click(friendsTab(c));
    expect(friendsCalls()).toBe(2);
    await settle(1, { climbers: [row(1, "zed", 90), row(2, "other", 50)], hiddenCount: 0, notClimbedCount: 0 });
    expect(c.textContent).toContain("Climber zed");
    expect(c.textContent).not.toContain("Climber aria");
  });

  it("discards a friends board that lands after clearAll (sign-out / delete)", async () => {
    net.hold = "/api/climb/leaderboard/friends";
    const c = await mount(createElement(FriendsBoardProbe));
    await click(buttonByText(c, "Clear cache"));
    expect(net.held).toHaveLength(2);

    await settle(0, { climbers: [row(1, "stale", 999)], hiddenCount: 0, notClimbedCount: 0 });
    expect(probeText(c)).toBe("");

    await settle(1, { climbers: [row(1, "me", 100)], hiddenCount: 0, notClimbedCount: 0 });
    expect(probeText(c)).toBe("me");
  });

  it("does not apply the previous account's leaderboard consent from a late settings response", async () => {
    setLeaderboardConsent(false);
    net.hold = "/api/settings";
    const c = await mount(createElement(SettingsProbe));
    expect(net.held).toHaveLength(1);

    auth.uid = "other";
    await mounted!.rerender();
    await settle(0, { displayName: "Previous", username: null, social: null, leaderboardConsent: true });

    expect(hasLeaderboardConsent()).toBe(false);
    expect(c.querySelector("[data-testid=settings]")?.textContent).toBe("");

    await settle(1, { displayName: "Current", username: null, social: null, leaderboardConsent: true });
    expect(hasLeaderboardConsent()).toBe(true);
    expect(c.querySelector("[data-testid=settings]")?.textContent).toBe("Current");
  });
});

describe("accepting a friend request", () => {
  it("marks the cached friends board stale so it refetches with the new friend", async () => {
    net.friendsBoard = { climbers: [row(1, "me", 100)], hiddenCount: 0, notClimbedCount: 0 } satisfies Board;
    net.incoming = [
      { id: "req-1", sender: { id: "aria", displayName: "Aria", username: "aria" }, createdAt: "2026-09-01T00:00:00Z" },
    ];
    const c = await mount(
      createElement("div", null, createElement(FriendsBoardProbe), createElement(FriendRequestsSection)),
      "/challenge",
    );
    expect(friendsCalls()).toBe(1);
    expect(c.querySelector("[data-testid=friends]")?.textContent).toBe("me");

    net.friendsBoard = {
      climbers: [row(1, "aria", 400), row(2, "me", 100)],
      hiddenCount: 0,
      notClimbedCount: 0,
    } satisfies Board;
    await click(buttonByText(c, "Accept"));

    expect(apiFetch.mock.calls.some(([p]) => p === "/api/friends/req-1/accept")).toBe(true);
    expect(friendsCalls()).toBe(2);
    expect(c.querySelector("[data-testid=friends]")?.textContent).toBe("aria,me");
  });
});
