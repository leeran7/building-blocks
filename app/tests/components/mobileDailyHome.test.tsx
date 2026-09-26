/**
 * The Home DailyCard's server rank (mobile/src/screens/HomeScreen) and the
 * day-keyed dailyLeaderboard AppData slice behind it, rendered for real inside
 * the real AppDataProvider. Only the network (apiFetch), auth and haptics are
 * mocked.
 *
 * Covers F-6 (DailyCard shows "#N today · H · Resets in …" once the server
 * knows the rank) and AC-11 / F-5 (at the UTC reset the day slice refetches
 * cold, so the card drops yesterday's rank instead of showing it under today).
 *
 * The Ranks screen's Today board is deliberately NOT covered here: its tab
 * structure is being redesigned (Global | Friends | Daily), and those checks
 * are deferred to the re-verify after the redesign.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
import { HomeScreen } from "../../mobile/src/screens/HomeScreen";
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

function LocationProbe() {
  const loc = useLocation();
  return createElement("output", { "data-testid": "path" }, `${loc.pathname}${loc.search}`);
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
            createElement(Route, { path: "/", element: el }),
            createElement(Route, { path: "/climb", element: createElement("p", null, "climb screen") }),
          ),
          createElement(LocationProbe),
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

describe("Home DailyCard (F-6)", () => {
  const card = () => $('button[aria-label="Play the daily climb"]');

  it("shows today's server rank and height once known", async () => {
    net.daily = dailyBoard([dailyRow(1, ME, 812)], { rank: 1, peakY: 812, attempts: 2 });
    await render("/", createElement(HomeScreen));
    expect(card()?.textContent).toMatch(/#1 today · 812/);
    expect(card()?.textContent).toMatch(/Resets in/);
  });

  it("falls back to the countdown when the player has no rank today (hidden or not played)", async () => {
    net.daily = dailyBoard([dailyRow(1, "a", 900)], { rank: null, peakY: 5, attempts: 1 });
    await render("/", createElement(HomeScreen));
    expect(card()?.textContent).not.toMatch(/today ·/);
    expect(card()?.textContent).toMatch(/Resets in/);
  });

  it("ignores a board for a different day than the device's UTC day", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    net.daily = dailyBoard([dailyRow(1, ME, 812)], { rank: 1, peakY: 812, attempts: 1 }, yesterday);
    await render("/", createElement(HomeScreen));
    expect(card()?.textContent).not.toMatch(/#1 today/);
  });

  it("tapping the card opens today's tower", async () => {
    await render("/", createElement(HomeScreen));
    await click(card());
    expect(path()).toBe("/climb?daily=1");
  });

  it("drops yesterday's rank at the UTC reset and refetches the new day's board cold (AC-11)", async () => {
    const beforeReset = new Date("2026-09-26T23:59:50.000Z");
    vi.useFakeTimers({ now: beforeReset, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    net.daily = dailyBoard([dailyRow(1, ME, 812)], { rank: 1, peakY: 812, attempts: 2 }, beforeReset);
    await render("/", createElement(HomeScreen));
    expect(card()?.textContent).toMatch(/#1 today · 812/);
    expect(dailyCalls()).toBe(1);

    net.hold = "/api/climb/daily/leaderboard";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    await settle();

    // New day: a fresh fetch is in flight and yesterday's rank is already gone.
    expect(dailyCalls()).toBe(2);
    expect(card()?.textContent).not.toMatch(/#1 today/);
    expect(card()?.textContent).toMatch(/Resets in 23h 59m/);

    const afterReset = new Date("2026-09-27T00:00:01.000Z");
    await act(async () =>
      net.held.shift()!(dailyBoard([dailyRow(1, "x", 50), dailyRow(2, ME, 7)], { rank: 2, peakY: 7, attempts: 1 }, afterReset))
    );
    await settle();
    expect(card()?.textContent).toMatch(/#2 today · 7/);
  });

  it("control: within the same day, the 30 s clock tick does not refetch or drop the rank", async () => {
    const midday = new Date("2026-09-26T12:00:00.000Z");
    vi.useFakeTimers({ now: midday, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    net.daily = dailyBoard([dailyRow(1, ME, 812)], { rank: 1, peakY: 812, attempts: 2 }, midday);
    await render("/", createElement(HomeScreen));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    await settle();
    expect(dailyCalls()).toBe(1);
    expect(card()?.textContent).toMatch(/#1 today · 812/);
  });
});
