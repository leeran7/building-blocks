/**
 * /climb (Solo) and /duel/leaderboard (1v1) share one frame, so the Solo | 1v1
 * switch between them only swaps the words and the rows (Leeran, 2026-10-31:
 * "/climb & /duel/leaderboard should be more alike"; "going back & forth
 * should be more smooth").
 *
 * Driven through the real mounted boards with only fetch and auth faked:
 *  - both boards draw the same switch, search row and panel skeleton;
 *  - the 1v1 board keeps whole-board ranks through a search and marks the
 *    viewer's row;
 *  - the 1v1 record panel holds a record's shape in every signed-in state, so
 *    it never changes height (it sits above the board on a phone);
 *  - GET /api/duel/stats answering null is a 0-0 record, never a missing one.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClimberRank } from "../../src/db/climb";
import type { DuelStatsRow } from "../../src/db/duel";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ME = { uid: "me" };
const AUTH = {
  user: ME as { uid: string } | null,
  token: "tok" as string | null,
  loading: false,
  isAnonymous: false,
};
vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => AUTH }));

import { ClimbBoard } from "../../src/components/Climb/ClimbBoard";
import { DuelBoard } from "../../src/components/Duel/DuelBoard";
import { parseDuelStats } from "../../src/hooks/useDuelStats";
import { DailyBoard, parseDailyStanding } from "../../src/components/Daily/DailyBoard";
import type { DailyClimberRank } from "../../src/db/dailyClimb";

const CLIMBERS: ClimberRank[] = [
  { rank: 1, userId: "u1", handle: "apex", username: null, peakY: 900, wins: 2, avatarId: null },
  { rank: 2, userId: "me", handle: "mine", username: null, peakY: 700, wins: 0, avatarId: null },
];
const DUELISTS: DuelStatsRow[] = [
  { userId: "u1", displayName: "Blazing Gecko", wins: 30, losses: 0, winPct: 100 },
  { userId: "u2", displayName: "Golden Heron", wins: 27, losses: 2, winPct: 93.1 },
  { userId: "me", displayName: "Lenny Jenkins", wins: 24, losses: 4, winPct: 85.7 },
];

const DAY = "2026-10-31";
const DAILY: DailyClimberRank[] = [
  { rank: 1, userId: "u1", handle: "apex", username: null, peakY: 410, attempts: 3, avatarId: null },
  { rank: 2, userId: "me", handle: "mine", username: null, peakY: 260, attempts: 1, avatarId: null },
];
const DAILY_ROUTE = "/api/climb/daily/leaderboard";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** fetch by path; a `null` route never answers (a read still in flight). */
function fakeApi(routes: Record<string, unknown>) {
  const pending = new Map<string, (r: Response) => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const path = new URL(input, "http://x").pathname;
      if (!(path in routes)) return Promise.resolve(json({}, 404));
      const body = routes[path];
      if (body === null) return new Promise<Response>((ok) => pending.set(path, ok));
      return Promise.resolve(json(body));
    })
  );
  return {
    answer(path: string, body: unknown, status = 200) {
      const ok = pending.get(path);
      if (!ok) throw new Error(`no pending call to ${path}`);
      pending.delete(path);
      ok(json(body, status));
    },
  };
}

function mount(el: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

/** Tag + class skeleton of an element, text left out. */
function skeleton(el: Element | null): string {
  if (!el) return "(missing)";
  return [el, ...el.querySelectorAll("*")].map((e) => `${e.tagName}.${e.getAttribute("class") ?? ""}`).join("\n");
}

const panelOf = (c: HTMLElement) => c.querySelector("section[aria-label^='Your']");
const scopeNav = (c: HTMLElement) => c.querySelector('nav[aria-label="Leaderboards"]');
const searchRow = (c: HTMLElement) => c.querySelector('input[type="search"]')?.closest("div.mb-4") ?? null;

/** The panel's text minus aria-hidden subtrees (what a reader sees). */
function visibleText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return copy.textContent ?? "";
}

beforeEach(() => {
  AUTH.user = ME;
  AUTH.token = "tok";
  AUTH.loading = false;
  AUTH.isAnonymous = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Solo and 1v1 boards share one frame", () => {
  it("draws the same switch, search row and panel skeleton on both pages", async () => {
    fakeApi({
      "/api/dashboard": { user: { id: "me" }, freeClimb: { peakY: 700, rank: 2, totalClimbers: 2 } },
      "/api/duel/stats": { wins: 24, losses: 4, current_streak: 2 },
    });
    const solo = mount(createElement(ClimbBoard, { climbers: CLIMBERS }));
    const duel = mount(createElement(DuelBoard, { entries: DUELISTS }));
    await settle();

    // The switch: same links in the same order, only the current one moves.
    const soloLinks = [...scopeNav(solo.container)!.querySelectorAll("a")];
    const duelLinks = [...scopeNav(duel.container)!.querySelectorAll("a")];
    const SWITCH = ["/climb", "/daily/leaderboard", "/duel/leaderboard"];
    expect(soloLinks.map((a) => a.getAttribute("href"))).toEqual(SWITCH);
    expect(duelLinks.map((a) => a.getAttribute("href"))).toEqual(SWITCH);
    expect(soloLinks.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null, null]);
    expect(duelLinks.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page"]);

    expect(skeleton(searchRow(duel.container))).toBe(skeleton(searchRow(solo.container)));
    // The board column under the switch: same grid, panel first.
    expect(skeleton(scopeNav(duel.container)!.nextElementSibling).split("\n")[0]).toBe(
      skeleton(scopeNav(solo.container)!.nextElementSibling).split("\n")[0]
    );
    expect(skeleton(panelOf(duel.container))).toBe(skeleton(panelOf(solo.container)));

    solo.unmount();
    duel.unmount();
  });
});

describe("1v1 board rows", () => {
  it("keeps each player's whole-board rank through a search", async () => {
    fakeApi({ "/api/duel/stats": null });
    const view = mount(createElement(DuelBoard, { entries: DUELISTS }));
    const input = view.container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setValue.call(input, "lenny");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const rows = [...view.container.querySelectorAll('ol[aria-label="Free 1v1 leaderboard"] > li')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Lenny Jenkins");
    expect(rows[0].querySelector('[aria-label^="Rank"]')?.textContent).toBe("3");
    view.unmount();
  });

  it("marks the signed-in viewer's own row", () => {
    fakeApi({ "/api/duel/stats": null });
    const view = mount(createElement(DuelBoard, { entries: DUELISTS }));
    const mine = view.container.querySelector("#your-duel-row");
    expect(mine?.textContent).toContain("Lenny Jenkins");
    expect(mine?.textContent).toContain("You");
    expect(view.container.querySelectorAll("#your-duel-row")).toHaveLength(1);
    view.unmount();
  });
});

describe("1v1 record panel: one height in every signed-in state", () => {
  const recordShape = (panel: Element) =>
    [...panel.querySelectorAll("p, dl, dt, dd")].map((e) => e.tagName).join(",");

  it("holds the record's layout with dashes, then fills it in", async () => {
    const api = fakeApi({ "/api/duel/stats": null });
    const view = mount(createElement(DuelBoard, { entries: DUELISTS }));
    const pending = panelOf(view.container)!;
    expect(pending.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(visibleText(pending)).toContain("—");
    const before = recordShape(pending);

    await act(async () => api.answer("/api/duel/stats", { wins: 24, losses: 4, current_streak: 2 }));
    await settle();
    const ready = panelOf(view.container)!;
    expect(visibleText(ready)).toContain("24");
    expect(visibleText(ready)).toContain("+2");
    expect(visibleText(ready)).toContain("86%");
    expect(ready.querySelector("[aria-busy=true]")).toBeNull();
    expect(recordShape(ready)).toBe(before);
    view.unmount();
  });

  it("keeps that layout (hidden) under the message when the read fails", async () => {
    const api = fakeApi({ "/api/duel/stats": null });
    const view = mount(createElement(DuelBoard, { entries: DUELISTS }));
    const before = recordShape(panelOf(view.container)!);

    await act(async () => api.answer("/api/duel/stats", { error: "boom" }, 500));
    await settle();
    const failed = panelOf(view.container)!;
    expect(visibleText(failed)).toContain("couldn’t be loaded");
    expect(visibleText(failed)).not.toContain("Losses");
    expect(recordShape(failed).replace(/^P,/, "")).toContain(before.replace(/^P,/, ""));
    view.unmount();
  });

  it("shows a player with no 1v1 yet as 0 wins, not as an empty panel", async () => {
    const api = fakeApi({ "/api/duel/stats": null });
    const view = mount(createElement(DuelBoard, { entries: DUELISTS }));
    await act(async () => api.answer("/api/duel/stats", null));
    await settle();
    const panel = panelOf(view.container)!;
    expect(visibleText(panel)).toMatch(/0\s*wins/);
    expect(panel.querySelector("[aria-busy=true]")).toBeNull();
    view.unmount();
  });

  it("asks a signed-out visitor to sign in, with the same primary action", () => {
    AUTH.user = null;
    AUTH.token = null;
    fakeApi({});
    const view = mount(createElement(DuelBoard, { entries: DUELISTS }));
    const panel = panelOf(view.container)!;
    expect(visibleText(panel)).toContain("Sign in");
    expect(panel.querySelector('a[href="/duel"]')?.textContent).toBe("Play a 1v1");
    expect(panel.querySelector("dl")).toBeNull();
    view.unmount();
  });
});

describe("parseDuelStats", () => {
  it("reads the endpoint's null (never played) as a 0-0 record", () => {
    expect(parseDuelStats(null)).toEqual({ wins: 0, losses: 0, current_streak: 0 });
  });

  it("passes a real record through", () => {
    expect(parseDuelStats({ wins: 3, losses: 1, current_streak: -1 })).toEqual({
      wins: 3,
      losses: 1,
      current_streak: -1,
    });
  });

  it("rejects anything that isn't three whole counts", () => {
    expect(parseDuelStats({ wins: "3", losses: 1, current_streak: 0 })).toBeNull();
    expect(parseDuelStats({ wins: 3, losses: 1 })).toBeNull();
    expect(parseDuelStats({ wins: 1.5, losses: 1, current_streak: 0 })).toBeNull();
    expect(parseDuelStats("3-1")).toBeNull();
    expect(parseDuelStats({ error: "boom" })).toBeNull();
  });
});

describe("Daily board (/daily/leaderboard) on the same frame", () => {
  it("draws the same switch, search row and panel skeleton as the Endless board", async () => {
    fakeApi({
      "/api/dashboard": { user: { id: "me" }, freeClimb: { peakY: 700, rank: 2, totalClimbers: 2 } },
      [DAILY_ROUTE]: { day: DAY, totalClimbers: 2, climbers: DAILY, me: { rank: 2, peakY: 260, attempts: 1 } },
    });
    const solo = mount(createElement(ClimbBoard, { climbers: CLIMBERS }));
    const daily = mount(createElement(DailyBoard, { day: DAY, climbers: DAILY }));
    await settle();

    const links = [...scopeNav(daily.container)!.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/climb", "/daily/leaderboard", "/duel/leaderboard"]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    expect(skeleton(searchRow(daily.container))).toBe(skeleton(searchRow(solo.container)));
    expect(skeleton(panelOf(daily.container))).toBe(skeleton(panelOf(solo.container)));

    solo.unmount();
    daily.unmount();
  });

  it("asks the daily route for this day and shows the viewer's standing and row", async () => {
    const api = fakeApi({ [DAILY_ROUTE]: null });
    const view = mount(createElement(DailyBoard, { day: DAY, climbers: DAILY }));
    const asked = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => c[0]);
    expect(asked).toEqual([`${DAILY_ROUTE}?day=${DAY}`]);
    expect(panelOf(view.container)!.querySelector("[aria-busy=true]")).not.toBeNull();

    await act(async () =>
      api.answer(DAILY_ROUTE, { day: DAY, totalClimbers: 2, climbers: DAILY, me: { rank: 2, peakY: 260, attempts: 1 } })
    );
    await settle();
    const panel = panelOf(view.container)!;
    expect(visibleText(panel)).toContain("260");
    expect(visibleText(panel)).toContain("#2");
    expect(view.container.querySelector("#your-climb-row")?.textContent).toContain("mine");
    expect(panel.querySelector('a[href="/daily"]')?.textContent).toMatch(/climb today.s tower/i);
    view.unmount();
  });

  it("says so when the viewer has no run today, and marks no row", async () => {
    fakeApi({ [DAILY_ROUTE]: { day: DAY, totalClimbers: 2, climbers: DAILY, me: null } });
    const view = mount(createElement(DailyBoard, { day: DAY, climbers: DAILY }));
    await settle();
    expect(visibleText(panelOf(view.container)!)).toMatch(/no climb on today.s tower yet/i);
    expect(view.container.querySelector("#your-climb-row")).toBeNull();
    view.unmount();
  });

  it("shows a hidden rank for a viewer who opted out of leaderboards", async () => {
    fakeApi({ [DAILY_ROUTE]: { day: DAY, totalClimbers: 1, climbers: [DAILY[0]], me: { rank: null, peakY: 120, attempts: 2 } } });
    const view = mount(createElement(DailyBoard, { day: DAY, climbers: [DAILY[0]] }));
    await settle();
    const panel = panelOf(view.container)!;
    expect(visibleText(panel)).toContain("120");
    expect(visibleText(panel)).toContain("Hidden");
    // No rank to pin, so no "Your standing" row under the board.
    expect(view.container.textContent).not.toContain("Your standing");
    view.unmount();
  });

  it("treats a failed or malformed read as unavailable, keeping the rows", async () => {
    fakeApi({ [DAILY_ROUTE]: { day: DAY, totalClimbers: 2, climbers: DAILY, me: { rank: "2", peakY: 260, attempts: 1 } } });
    const view = mount(createElement(DailyBoard, { day: DAY, climbers: DAILY }));
    await settle();
    expect(visibleText(panelOf(view.container)!)).toContain("couldn’t be loaded");
    expect(view.container.querySelectorAll('ol[aria-label="Today\'s Daily Climb leaderboard"] > li')).toHaveLength(2);
    view.unmount();
  });

  it("asks a signed-out visitor to sign in and back to the daily board", () => {
    AUTH.user = null;
    AUTH.token = null;
    fakeApi({});
    const view = mount(createElement(DailyBoard, { day: DAY, climbers: DAILY }));
    const panel = panelOf(view.container)!;
    expect(panel.querySelector('a[href^="/auth/signin"]')?.getAttribute("href")).toBe(
      "/auth/signin?redirect=%2Fdaily%2Fleaderboard"
    );
    expect(fetch).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("parseDailyStanding", () => {
  it("reads a standing, an opted-out standing and no run", () => {
    expect(parseDailyStanding({ totalClimbers: 4, me: { rank: 3, peakY: 50, attempts: 2 } })).toEqual({
      me: { rank: 3, peakY: 50, attempts: 2 },
      totalClimbers: 4,
    });
    expect(parseDailyStanding({ totalClimbers: 4, me: { rank: null, peakY: 50, attempts: 2 } })?.me?.rank).toBeNull();
    expect(parseDailyStanding({ totalClimbers: 4, me: null })).toEqual({ me: null, totalClimbers: 4 });
  });

  it("rejects anything that is not a board response", () => {
    for (const bad of [
      undefined,
      null,
      "x",
      { me: null },
      { totalClimbers: "4", me: null },
      { totalClimbers: 4 },
      { totalClimbers: 4, me: { rank: "3", peakY: 50, attempts: 2 } },
      { totalClimbers: 4, me: { rank: 3, peakY: NaN, attempts: 2 } },
      { totalClimbers: 4, me: { rank: 3, peakY: 50 } },
    ]) {
      expect(parseDailyStanding(bad)).toBeUndefined();
    }
  });
});
