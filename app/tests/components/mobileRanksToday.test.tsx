/**
 * The native Ranks screen (mobile/src/screens/LeaderboardScreen) rendered for
 * real inside the real AppDataProvider. Only the network (apiFetch), auth and
 * haptics are mocked.
 *
 * Covers AC-9 as redesigned: Global | Friends pill first, then an All-time |
 * Today underline tablist; All-time is the default and Today opens from its
 * tab or `?board=today`. Also AC-10 (pinned own row outside the top 50),
 * AC-11 (UTC rollover refetches the day's board cold) and the F-2 / F-3 / F-4
 * Today states: loading, empty, error + retry, not played, hidden -> consent
 * sheet -> refetch, failed consent save, and Friends on Today.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ME = "me";

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: ME }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));
vi.mock("@app/components/Game/lava", () => ({ drawLava: vi.fn() }));

type Path =
  | "/api/climb/daily/leaderboard"
  | "/api/climb/daily/leaderboard/friends"
  | "/api/climb/leaderboard"
  | "/api/settings";

const net = vi.hoisted(() => ({
  daily: null as unknown,
  dailyStatus: 200,
  friendsDaily: null as unknown,
  consent: true,
  putStatus: 200,
  hold: null as null | string,
  held: [] as Array<(body: unknown, status?: number) => void>,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
  if (path === net.hold) {
    return new Promise<Response>((resolve) =>
      net.held.push((body, status = 200) => resolve(jsonResponse(body, status)))
    );
  }
  if (path === "/api/climb/daily/leaderboard") return jsonResponse(net.daily, net.dailyStatus);
  if (path === "/api/climb/daily/leaderboard/friends") return jsonResponse(net.friendsDaily);
  if (path === "/api/climb/leaderboard") return jsonResponse({ climbers: [allTimeRow(1, "alltime-top", 9000)] });
  if (path === "/api/dashboard") return jsonResponse({ freeClimb: null });
  if (path === "/api/settings") {
    if (init?.method === "PUT") {
      if (net.putStatus !== 200) return jsonResponse({ error: "no" }, net.putStatus);
      net.consent = true;
    }
    return jsonResponse({ displayName: null, username: null, social: {}, leaderboardConsent: net.consent, avatarId: null });
  }
  return jsonResponse({}, 404);
});
vi.mock("../../mobile/src/lib/api", () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  API_BASE: "https://example.test",
}));

import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";
import { LeaderboardScreen } from "../../mobile/src/screens/LeaderboardScreen";
import { utcDayKey, nextUtcResetAt } from "../../src/lib/dailyDay";

function allTimeRow(rank: number, userId: string, peakY: number) {
  return { rank, userId, handle: `Climber ${userId}`, username: null, peakY, wins: 0, avatarId: null };
}
function dailyRow(rank: number, userId: string, peakY: number, attempts = 1) {
  return { rank, userId, handle: `Climber ${userId}`, username: null, peakY, attempts, avatarId: null };
}
function dailyBoard(
  climbers: ReturnType<typeof dailyRow>[],
  me: { rank: number | null; peakY: number; attempts: number } | null,
  now = new Date()
) {
  return {
    day: utcDayKey(now),
    resetsAt: nextUtcResetAt(now).toISOString(),
    totalClimbers: climbers.length,
    climbers,
    me,
  };
}

const dailyCalls = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/daily/leaderboard").length;
const calls = (p: Path) => apiFetch.mock.calls.filter(([q]) => q === p).length;

function LocationProbe() {
  const loc = useLocation();
  return createElement("output", { "data-testid": "path" }, `${loc.pathname}${loc.search}`);
}

/** Navigates in-app while Ranks stays mounted (what the bottom nav or a CTA does). */
function NavProbe() {
  const navigate = useNavigate();
  return createElement(
    "div",
    { hidden: true },
    createElement("button", { type: "button", "data-go": "/leaderboard", onClick: () => navigate("/leaderboard") }),
    createElement("button", {
      type: "button",
      "data-go": "/leaderboard?board=today",
      onClick: () => navigate("/leaderboard?board=today"),
    }),
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(path: string, el: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          AppDataProvider,
          null,
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/leaderboard", element: el }),
            createElement(Route, { path: "/climb", element: createElement("p", null, "climb screen") }),
          ),
          createElement(LocationProbe),
          createElement(NavProbe),
        ),
      ),
    );
  });
  await settle();
  return container;
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const $ = (sel: string) => container!.querySelector(sel);
const text = () => container!.textContent ?? "";
const path = () => $('[data-testid="path"]')?.textContent;
const buttonByText = (t: string) =>
  Array.from(container!.querySelectorAll("button")).find((b) => b.textContent?.trim() === t);
const bannerEndingWith = (t: string) =>
  Array.from(container!.querySelectorAll("button")).find((b) => b.getAttribute("aria-label")?.endsWith(t));
const skeleton = () => $('[aria-label="Loading leaderboard"]');

beforeEach(() => {
  apiFetch.mockClear();
  net.daily = dailyBoard([dailyRow(1, "a", 900), dailyRow(2, "b", 800)], null);
  net.dailyStatus = 200;
  net.friendsDaily = null;
  net.consent = true;
  net.putStatus = 200;
  net.hold = null;
  net.held = [];
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

const TODAY = "/leaderboard?board=today";

const tab = (id: string) => $(`#${id}`) as HTMLButtonElement | null;
const tablistOf = (id: string) => tab(id)?.closest('[role="tablist"]') ?? null;
const tabIds = (list: Element | null) => [...(list?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.id);
/** The accent underline bar rendered inside a period tab. */
const underline = (id: string) => tab(id)?.querySelector("span[aria-hidden]") ?? null;
const subtitle = () => $("header")?.textContent ?? "";

async function key(list: Element, k: string) {
  await act(async () => {
    list.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
  await settle();
}

describe("Ranks: Global | Friends pill, then All-time | Today underline tabs (AC-9)", () => {
  it("opens on All-time by default and never fetches today's board", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    expect(tab("lb-period-alltime")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("false");
    expect(text()).toContain("Climber alltime-top");
    expect(text()).not.toContain("Climber b");
    expect(dailyCalls()).toBe(0);
    expect(subtitle()).toContain("Global");
    expect(subtitle()).toContain("All time");
    expect(subtitle()).not.toMatch(/Resets in/);
  });

  it("renders the scope pill first, then a separate period tablist with its own name, All-time before Today", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    const lists = [...container!.querySelectorAll('[role="tablist"]')];
    expect(lists.map((l) => l.getAttribute("aria-label"))).toEqual(["Leaderboard scope", "Leaderboard period"]);
    expect(tabIds(lists[0])).toEqual(["lb-tab-global", "lb-tab-friends"]);
    expect(tabIds(lists[1])).toEqual(["lb-period-alltime", "lb-period-today"]);

    // Each tab controls its own panel; the period panel sits inside the scope panel.
    expect(tab("lb-tab-global")?.getAttribute("aria-controls")).toBe("lb-panel");
    expect(tab("lb-period-today")?.getAttribute("aria-controls")).toBe("lb-period-panel");
    const scopePanel = $("#lb-panel");
    const periodPanel = $("#lb-period-panel");
    expect(scopePanel?.getAttribute("role")).toBe("tabpanel");
    expect(scopePanel?.getAttribute("aria-labelledby")).toBe("lb-tab-global");
    expect(periodPanel?.getAttribute("role")).toBe("tabpanel");
    expect(periodPanel?.getAttribute("aria-labelledby")).toBe("lb-period-alltime");
    expect(scopePanel?.contains(lists[1])).toBe(true);
    expect(scopePanel?.contains(periodPanel)).toBe(true);
  });

  it("roving tabindex and the accent underline follow the selected period only", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    expect(tab("lb-period-alltime")?.tabIndex).toBe(0);
    expect(tab("lb-period-today")?.tabIndex).toBe(-1);
    expect(underline("lb-period-alltime")?.className).toContain("bg-accent");
    expect(underline("lb-period-today")?.className).not.toContain("bg-accent");
    expect(tab("lb-period-alltime")?.className).toContain("text-accent");
    expect(tab("lb-period-today")?.className).toContain("text-text-secondary");

    await click(tab("lb-period-today"));
    expect(tab("lb-period-today")?.tabIndex).toBe(0);
    expect(tab("lb-period-alltime")?.tabIndex).toBe(-1);
    expect(underline("lb-period-today")?.className).toContain("bg-accent");
    expect(underline("lb-period-alltime")?.className).not.toContain("bg-accent");
    expect(tab("lb-period-today")?.className).toContain("text-accent");
  });

  it("the Today tab opens today's board and the header follows: Today's tower · Resets in", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    await click(tab("lb-period-today"));
    expect(dailyCalls()).toBe(1);
    expect($("#lb-period-panel")?.getAttribute("aria-labelledby")).toBe("lb-period-today");
    expect(text()).toContain("Climber b");
    expect(text()).not.toContain("Climber alltime-top");
    expect(subtitle()).toContain("Today's tower");
    expect(subtitle()).toMatch(/Resets in (\d+h \d+m|\d+m|<1m)/);

    await click(tab("lb-period-alltime"));
    expect(text()).toContain("Climber alltime-top");
    expect(subtitle()).toContain("All time");
    expect(subtitle()).not.toMatch(/Resets in/);
  });

  it("the header names the scope on both periods (Friends · All time, Friends · Today's tower)", async () => {
    net.friendsDaily = {
      day: utcDayKey(new Date()),
      resetsAt: nextUtcResetAt(new Date()).toISOString(),
      climbers: [dailyRow(1, "f1", 50)],
      hiddenCount: 0,
      notClimbedCount: 0,
    };
    await render("/leaderboard", createElement(LeaderboardScreen));
    await click(tab("lb-tab-friends"));
    expect(subtitle()).toContain("Friends");
    expect(subtitle()).toContain("All time");
    await click(tab("lb-period-today"));
    expect(subtitle()).toContain("Friends");
    expect(subtitle()).toContain("Today's tower");
  });

  it("arrow keys move selection and focus in the period row (wrapping); Home/End jump to the ends", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    const list = tablistOf("lb-period-alltime")!;

    await key(list, "ArrowRight");
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.id).toBe("lb-period-today");
    expect($("#lb-period-panel")?.getAttribute("aria-labelledby")).toBe("lb-period-today");
    expect(text()).toContain("Climber b");

    await key(list, "ArrowRight"); // wraps back to All-time
    expect(tab("lb-period-alltime")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.id).toBe("lb-period-alltime");

    await key(list, "ArrowLeft"); // wraps to Today
    expect(document.activeElement?.id).toBe("lb-period-today");

    await key(list, "Home");
    expect(document.activeElement?.id).toBe("lb-period-alltime");
    await key(list, "End");
    expect(document.activeElement?.id).toBe("lb-period-today");

    // Other keys leave the selection alone.
    await key(list, "ArrowDown");
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");
  });

  it("arrow keys in the period row never change the scope, and vice versa", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    await key(tablistOf("lb-period-alltime")!, "ArrowRight");
    expect(tab("lb-tab-global")?.getAttribute("aria-selected")).toBe("true");
    await key(tablistOf("lb-tab-global")!, "ArrowRight");
    expect(tab("lb-tab-friends")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.id).toBe("lb-tab-friends");
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");
  });

  it("?board=today opens Today", async () => {
    await render(TODAY, createElement(LeaderboardScreen));
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");
    expect(dailyCalls()).toBe(1);
    expect(text()).toContain("Climber b");
  });

  it.each(["alltime", "Today", "__proto__", "", "today "])("?board=%j opens the All-time default", async (value) => {
    await render(`/leaderboard?board=${encodeURIComponent(value)}`, createElement(LeaderboardScreen));
    expect(tab("lb-period-alltime")?.getAttribute("aria-selected")).toBe("true");
    expect(dailyCalls()).toBe(0);
  });

  it("a new deep link while Ranks is mounted re-selects the period", async () => {
    await render("/leaderboard", createElement(LeaderboardScreen));
    await click($('[data-go="/leaderboard?board=today"]'));
    expect(path()).toBe("/leaderboard?board=today");
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");

    await click($('[data-go="/leaderboard"]'));
    expect(path()).toBe("/leaderboard");
    expect(tab("lb-period-alltime")?.getAttribute("aria-selected")).toBe("true");
  });

  it("a tab choice survives re-renders on the same URL", async () => {
    await render(TODAY, createElement(LeaderboardScreen));
    await click(tab("lb-period-alltime"));
    await click(tab("lb-tab-friends"));
    await click(tab("lb-tab-global"));
    expect(tab("lb-period-alltime")?.getAttribute("aria-selected")).toBe("true");
  });
});

describe("Ranks: Today board states (F-2)", () => {
  it("shows the skeleton while loading, then the board", async () => {
    net.hold = "/api/climb/daily/leaderboard";
    await render(TODAY, createElement(LeaderboardScreen));
    expect(skeleton()).toBeTruthy();
    expect(text()).not.toContain("Not on today's board");
    await act(async () => net.held.shift()!(net.daily));
    await settle();
    expect(skeleton()).toBeNull();
    expect(text()).toContain("Climber b");
  });

  it("empty: invites the first climb and Play goes to today's tower", async () => {
    net.daily = dailyBoard([], null);
    await render(TODAY, createElement(LeaderboardScreen));
    expect(text()).toContain("No one's climbed today's tower yet. Be first.");
    await click(buttonByText("Play today's tower"));
    expect(path()).toBe("/climb?daily=1");
  });

  it("error: a failed load shows Try again (not an empty board), and retry recovers", async () => {
    net.dailyStatus = 500;
    await render(TODAY, createElement(LeaderboardScreen));
    expect($('[role="alert"]')?.textContent).toContain("Couldn't load the leaderboard");
    expect(text()).not.toContain("No one's climbed today's tower yet");
    net.dailyStatus = 200;
    await click(buttonByText("Try again"));
    expect($('[role="alert"]')).toBeNull();
    expect(text()).toContain("Climber b");
  });

  it("a malformed body is treated as an error, not rendered", async () => {
    net.daily = { ...dailyBoard([dailyRow(1, "a", 900)], null), day: "2026-02-30" };
    await render(TODAY, createElement(LeaderboardScreen));
    expect($('[role="alert"]')).toBeTruthy();
    expect(text()).not.toContain("Climber a");
  });

  it("not played today: 'Not on today's board' with Play to today's tower", async () => {
    await render(TODAY, createElement(LeaderboardScreen));
    const banner = bannerEndingWith("Play");
    expect(banner?.getAttribute("aria-label")).toContain("Not on today's board");
    await click(banner);
    expect(path()).toBe("/climb?daily=1");
  });

  it("ranked inside the list: banner shows the rank and there is no pinned row", async () => {
    net.daily = dailyBoard(
      [dailyRow(1, "a", 900), dailyRow(2, "b", 800), dailyRow(3, "c", 700), dailyRow(4, ME, 600, 2)],
      { rank: 4, peakY: 600, attempts: 2 }
    );
    await render(TODAY, createElement(LeaderboardScreen));
    expect(text()).toContain("You're #4");
    expect($("#lb-me")).toBeTruthy();
    expect($("#lb-me-pinned")).toBeNull();
  });
});

describe("Ranks: pinned own row (AC-10)", () => {
  it("pins rank · height · tries under the table when the player is outside the rows shown", async () => {
    const top = Array.from({ length: 50 }, (_, i) => dailyRow(i + 1, `p${i}`, 1000 - i));
    net.daily = { ...dailyBoard(top, { rank: 73, peakY: 412.5, attempts: 3 }), totalClimbers: 120 };
    await render(TODAY, createElement(LeaderboardScreen));
    const pinned = $("#lb-me-pinned");
    expect(pinned).toBeTruthy();
    const label = pinned!.getAttribute("aria-label") ?? "";
    expect(label).toContain("number 73");
    expect(label).toContain("3 tries");
    expect(label).toMatch(/412/);
    expect(pinned!.textContent).toContain("73");
    expect(pinned!.textContent).toContain("you · today");
    // The pinned row sits after the rankings table.
    const table = $('section[aria-label="Rankings"]')!;
    expect(table.compareDocumentPosition(pinned!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The banner's "Show my row" targets it.
    const show = bannerEndingWith("Show my row");
    expect(show).toBeTruthy();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await click(show);
    expect(scroll.mock.instances[0]).toBe(pinned);
    scroll.mockRestore();
  });

  it("says '1 try' for a single attempt", async () => {
    net.daily = dailyBoard([dailyRow(1, "a", 900)], { rank: 2, peakY: 10, attempts: 1 });
    await render(TODAY, createElement(LeaderboardScreen));
    expect($("#lb-me-pinned")?.getAttribute("aria-label")).toContain("1 try");
  });

  it("is not pinned for a hidden player (rank null)", async () => {
    net.daily = dailyBoard([dailyRow(1, "a", 900)], { rank: null, peakY: 10, attempts: 1 });
    await render(TODAY, createElement(LeaderboardScreen));
    expect($("#lb-me-pinned")).toBeNull();
    expect(text()).toContain("You're hidden");
  });
});

describe("Ranks: opt in from the Today board (F-4)", () => {
  it("hidden -> 'Show me on the board' -> consent sheet -> PUT -> board refetched", async () => {
    net.consent = false;
    net.daily = dailyBoard([dailyRow(1, "a", 900)], { rank: null, peakY: 10, attempts: 1 });
    await render(TODAY, createElement(LeaderboardScreen));
    const banner = bannerEndingWith("Show me on the board");
    expect(banner?.getAttribute("aria-label")).toContain("You're hidden");
    const before = dailyCalls();

    await click(banner);
    expect(buttonByText("Save my score")).toBeTruthy();

    net.daily = dailyBoard([dailyRow(1, "a", 900), dailyRow(2, ME, 10)], { rank: 2, peakY: 10, attempts: 1 });
    await click(buttonByText("Save my score"));
    const put = apiFetch.mock.calls.find(([p, init]) => p === "/api/settings" && init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ leaderboardConsent: true });
    expect(buttonByText("Save my score")).toBeUndefined();
    expect(dailyCalls()).toBeGreaterThan(before);
    expect(text()).toContain("You're #2");
  });

  it("a failed consent save closes the sheet and leaves the banner hidden (retryable)", async () => {
    net.consent = false;
    net.putStatus = 500;
    net.daily = dailyBoard([dailyRow(1, "a", 900)], { rank: null, peakY: 10, attempts: 1 });
    await render(TODAY, createElement(LeaderboardScreen));
    await click(bannerEndingWith("Show me on the board"));
    await click(buttonByText("Save my score"));
    expect(buttonByText("Save my score")).toBeUndefined();
    expect(bannerEndingWith("Show me on the board")).toBeTruthy();
  });
});

describe("Ranks: Friends on Today (F-3)", () => {
  it("fetches today's friends board only when Friends is opened, with its footer", async () => {
    net.friendsDaily = {
      day: utcDayKey(new Date()),
      resetsAt: nextUtcResetAt(new Date()).toISOString(),
      climbers: [dailyRow(1, "f1", 50), dailyRow(2, ME, 20)],
      hiddenCount: 1,
      notClimbedCount: 2,
    };
    await render(TODAY, createElement(LeaderboardScreen));
    expect(calls("/api/climb/daily/leaderboard/friends")).toBe(0);
    await click($("#lb-tab-friends"));
    expect(calls("/api/climb/daily/leaderboard/friends")).toBe(1);
    expect(text()).toContain("Climber f1");
    expect(text()).toMatch(/hidden/i);
  });

  it("no friends yet: 'Race your friends' -> /challenge", async () => {
    net.friendsDaily = {
      day: utcDayKey(new Date()),
      resetsAt: nextUtcResetAt(new Date()).toISOString(),
      climbers: [],
      hiddenCount: 0,
      notClimbedCount: 0,
    };
    await render(TODAY, createElement(LeaderboardScreen));
    await click($("#lb-tab-friends"));
    expect(text()).toContain("Race your friends");
    await click(buttonByText("Find friends"));
    expect(path()).toBe("/challenge");
  });
});

describe("Ranks: UTC midnight rollover (AC-11)", () => {
  it("refetches the day's board COLD at the reset: skeleton, never yesterday's rows under today's header", async () => {
    const beforeReset = new Date("2026-09-26T23:59:50.000Z");
    vi.useFakeTimers({ now: beforeReset, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    net.daily = dailyBoard([dailyRow(1, "yesterday-champ", 900)], null, beforeReset);
    await render(TODAY, createElement(LeaderboardScreen));
    expect(text()).toContain("Climber yesterday-champ");
    expect(text()).toContain("Resets in <1m");
    expect(dailyCalls()).toBe(1);

    net.hold = "/api/climb/daily/leaderboard";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    await settle();

    // Refetch started for the new day, and the old day's rows are gone.
    expect(dailyCalls()).toBe(2);
    expect(skeleton()).toBeTruthy();
    expect(text()).not.toContain("Climber yesterday-champ");
    expect(text()).toContain("Resets in 23h 59m");

    const afterReset = new Date("2026-09-27T00:00:01.000Z");
    await act(async () => net.held.shift()!(dailyBoard([dailyRow(1, "new-day", 5)], null, afterReset)));
    await settle();
    expect(skeleton()).toBeNull();
    expect(text()).toContain("Climber new-day");
  });

  it("control: a TTL refresh on the SAME day is warm (rows stay up, no skeleton)", async () => {
    const midday = new Date("2026-09-26T12:00:00.000Z");
    vi.useFakeTimers({ now: midday, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    net.daily = dailyBoard([dailyRow(1, "a", 900)], null, midday);
    await render(TODAY, createElement(LeaderboardScreen));
    net.hold = "/api/climb/daily/leaderboard";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000); // past the 30 s TTL
    });
    // Leaving and returning to Today re-runs ensure (TTL expired).
    await click(tab("lb-period-alltime"));
    await click(tab("lb-period-today"));
    expect(dailyCalls()).toBe(2);
    expect(skeleton()).toBeNull();
    expect(text()).toContain("Climber a");
  });
});

describe("Ranks: scope row keyboard + Friends on Today (verifier)", () => {
  it("the scope row has its own roving tabindex, wraps on ArrowLeft, and Home/End move focus there only", async () => {
    await render(TODAY, createElement(LeaderboardScreen));
    const scope = tablistOf("lb-tab-global")!;
    expect(tab("lb-tab-global")?.tabIndex).toBe(0);
    expect(tab("lb-tab-friends")?.tabIndex).toBe(-1);
    expect(tab("lb-tab-global")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("lb-tab-friends")?.getAttribute("aria-selected")).toBe("false");

    await key(scope, "ArrowLeft"); // wraps from the first tab to the last
    expect(tab("lb-tab-friends")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("lb-tab-friends")?.tabIndex).toBe(0);
    expect(tab("lb-tab-global")?.tabIndex).toBe(-1);
    expect(document.activeElement?.id).toBe("lb-tab-friends");
    expect($("#lb-panel")?.getAttribute("aria-labelledby")).toBe("lb-tab-friends");

    await key(scope, "Home");
    expect(document.activeElement?.id).toBe("lb-tab-global");
    expect(tab("lb-tab-global")?.getAttribute("aria-selected")).toBe("true");
    await key(scope, "End");
    expect(document.activeElement?.id).toBe("lb-tab-friends");

    // The period row keeps its own selection and tab stop throughout.
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("lb-period-today")?.tabIndex).toBe(0);
    expect(tab("lb-period-alltime")?.tabIndex).toBe(-1);
    // Exactly one tab stop per row.
    const stops = [...container!.querySelectorAll('[role="tab"]')].filter((t) => (t as HTMLElement).tabIndex === 0);
    expect(stops.map((t) => t.id)).toEqual(["lb-tab-friends", "lb-period-today"]);
  });

  it("Friends on Today never pins the Global board's own row, and shows the exact friends footer", async () => {
    const top = Array.from({ length: 50 }, (_, i) => dailyRow(i + 1, `p${i}`, 1000 - i));
    net.daily = { ...dailyBoard(top, { rank: 73, peakY: 412.5, attempts: 3 }), totalClimbers: 120 };
    net.friendsDaily = {
      day: utcDayKey(new Date()),
      resetsAt: nextUtcResetAt(new Date()).toISOString(),
      climbers: [dailyRow(1, "f1", 50), dailyRow(2, "f2", 40), dailyRow(3, "f3", 30), dailyRow(4, "f4", 25)],
      hiddenCount: 1,
      notClimbedCount: 2,
    };
    await render(TODAY, createElement(LeaderboardScreen));
    // Precondition: on Global the own row IS pinned (rank 73 is outside the list).
    expect($("#lb-me-pinned")).toBeTruthy();

    await click($("#lb-tab-friends"));
    expect(text()).toContain("Climber f4");
    expect($("#lb-me-pinned")).toBeNull();
    expect(text()).toContain("2 friends haven't climbed yet · 1 hidden");
    expect(subtitle()).toContain("Friends");
    expect(subtitle()).toContain("Today's tower");
  });

  it("a 'See today's board' deep link (TODAY_BOARD_PATH) opens Today", async () => {
    const { TODAY_BOARD_PATH } = await import("../../mobile/src/lib/dailyBoard");
    await render(TODAY_BOARD_PATH, createElement(LeaderboardScreen));
    expect(tab("lb-period-today")?.getAttribute("aria-selected")).toBe("true");
    expect(dailyCalls()).toBe(1);
  });
});
