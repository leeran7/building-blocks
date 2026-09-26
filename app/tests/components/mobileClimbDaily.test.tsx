/**
 * Native ClimbScreen in daily mode (/climb?daily=1): the tower seed comes from
 * the server, a finished run goes to the VERIFIED daily route with its replay,
 * and the results card shows the server's verdict (F-1).
 *
 * The real screen renders inside the real AppDataProvider. The game loop
 * (useClimb) is stubbed to a finished run and records the seed it was given;
 * canvas / HUD / audio are stubbed; the network is mocked at apiFetch.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));

const net = vi.hoisted(() => ({
  info: null as unknown,
  resultStatus: 200,
  resultBody: null as unknown,
  token: "replay-token" as string | null,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, _init?: RequestInit): Promise<Response> => {
  if (path === "/api/climb/daily") return net.info ? jsonResponse(net.info) : jsonResponse({}, 503);
  if (path === "/api/climb/daily/result") return jsonResponse(net.resultBody, net.resultStatus);
  if (path === "/api/settings") return jsonResponse({ leaderboardConsent: true });
  return jsonResponse({}, 404);
});
const postClimbResult = vi.fn(async (_run: object) => ({ saved: true, improved: false, rank: 9, totalClimbers: 99 }));

vi.mock("../../mobile/src/lib/api", () => ({
  API_BASE: "https://example.test",
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  postClimbResult: (run: object) => postClimbResult(run),
}));
vi.mock("../../mobile/src/lib/useGameHaptics", () => ({ useGameHaptics: () => {} }));

const climb = vi.hoisted(() => ({ seeds: [] as Array<string | undefined> }));
vi.mock("../../src/game/useClimb", async () => {
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  return {
    useClimb: ({ seed }: { seed?: string }) => {
      climb.seeds.push(seed);
      const state = createMatch({ seed: seed ?? "solo", mode: "solo", tower: buildFreeTower(), playerIds: ["you"] });
      state.phase = "results";
      state.players[0].peakY = 42;
      return {
        state,
        simRef: { current: state },
        renderFeed: {},
        start: () => {},
        finished: true,
        setTouch: () => {},
        runId: 1,
        inputLog: [{ moveX: 0, jump: false, climbY: 1, usePowerUp: false }],
      };
    },
  };
});
vi.mock("../../src/game/runReplay", () => ({
  encodeRunReplay: async () => net.token,
  buildReplayUrl: (t: string) => `https://example.test/play?r=${t}`,
}));
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../src/components/Game/ExpeditionHud", () => ({ ExpeditionHud: () => null }));
vi.mock("../../src/components/Game/TouchControls", () => ({
  TouchControls: () => null,
  TOUCH_CONTROLS_INSET: 0,
  TOUCH_CONTROLS_MIN_BOTTOM: 0,
}));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: () => {}, announcement: null, unlockAudio: () => {} }),
}));
vi.mock("../../src/hooks/useCanvasSize", () => ({ useCanvasSize: () => ({ width: 390, height: 780 }) }));
vi.mock("../../src/hooks/useSafeAreaInsets", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";
import { ClimbScreen } from "../../mobile/src/screens/ClimbScreen";
import { setLeaderboardConsent } from "../../mobile/src/lib/consent";
import { dailySeedFor, nextUtcResetAt, utcDayKey } from "../../src/lib/dailyDay";

function LocationProbe() {
  const loc = useLocation();
  return createElement("output", { "data-testid": "path" }, `${loc.pathname}${loc.search}`);
}

let root: Root | null = null;
let container: HTMLElement | null = null;
const onSignIn = vi.fn();

const settle = () =>
  act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });

async function mountDaily(path = "/climb?daily=1") {
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
            createElement(Route, { path: "/climb", element: <ClimbScreen onSignIn={onSignIn} /> }),
            createElement(Route, { path: "/leaderboard", element: createElement("p", null, "ranks screen") }),
          ),
          createElement(LocationProbe),
        ),
      ),
    );
  });
  await settle();
  return container;
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const text = () => container!.textContent ?? "";
const buttonByText = (t: string) =>
  Array.from(container!.querySelectorAll("button")).find((b) => b.textContent?.trim().toLowerCase() === t.toLowerCase());
const rankLine = () => container!.querySelector('p[aria-live="polite"]')?.textContent ?? "";
const resultPosts = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/daily/result");
const saved = (over: Record<string, unknown> = {}) => ({
  saved: true,
  day: utcDayKey(new Date()),
  peakY: 42,
  improved: true,
  rank: 3,
  totalClimbers: 12,
  attempts: 1,
  ...over,
});

beforeEach(() => {
  auth.uid = "me";
  apiFetch.mockClear();
  postClimbResult.mockClear();
  onSignIn.mockClear();
  climb.seeds = [];
  net.info = null;
  net.resultStatus = 200;
  net.resultBody = saved();
  net.token = "replay-token";
  localStorage.clear();
  setLeaderboardConsent(true);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ClimbScreen daily mode", () => {
  it("locks the tower to the SERVER's daily seed, even when the device clock disagrees", async () => {
    const serverDay = "2031-01-02"; // not the device's UTC day
    net.info = { day: serverDay, seed: dailySeedFor(serverDay), resetsAt: "2031-01-03T00:00:00.000Z" };
    await mountDaily();
    expect(climb.seeds[0]).toBe(dailySeedFor(utcDayKey(new Date()))); // local fallback first
    expect(climb.seeds.at(-1)).toBe(dailySeedFor(serverDay));
  });

  it("ignores a self-inconsistent server answer and keeps the device's UTC seed", async () => {
    net.info = { day: "2031-01-02", seed: "daily-2031-01-03", resetsAt: nextUtcResetAt(new Date()).toISOString() };
    await mountDaily();
    expect(new Set(climb.seeds)).toEqual(new Set([dailySeedFor(utcDayKey(new Date()))]));
  });

  it("posts the run WITH its replay to the verified daily route, shows the server rank and 'See today's board'", async () => {
    await mountDaily();
    expect(resultPosts()).toHaveLength(1);
    const body = JSON.parse(String(resultPosts()[0][1]?.body)) as Record<string, unknown>;
    expect(body.replayToken).toBe("replay-token");
    expect(postClimbResult).not.toHaveBeenCalled();
    expect(rankLine()).toBe("#3 of 12 today");
    expect(text()).toContain("Today’s Best");
    await click(buttonByText("See today’s board"));
    expect(container!.querySelector('[data-testid="path"]')?.textContent).toBe("/leaderboard?board=today");
  });

  it("saved while hidden says so instead of a rank", async () => {
    net.resultBody = saved({ rank: null, improved: false });
    await mountDaily();
    expect(rankLine()).toBe("saved · you're hidden on today's board");
    expect(text()).not.toContain("Today’s Best");
  });

  it("offline / 5xx: 'couldn't reach today's board' with Try again, which re-sends the same payload", async () => {
    net.resultStatus = 503;
    net.resultBody = { error: "down" };
    await mountDaily();
    expect(rankLine()).toBe("couldn't reach today's board");
    const retry = buttonByText("Try again");
    expect(retry).toBeTruthy();

    net.resultStatus = 200;
    net.resultBody = saved({ rank: 7, totalClimbers: 20 });
    await click(retry);
    expect(resultPosts()).toHaveLength(2);
    expect(resultPosts()[1][1]?.body).toBe(resultPosts()[0][1]?.body);
    expect(rankLine()).toBe("#7 of 20 today");
    expect(buttonByText("Try again")).toBeUndefined();
  });

  it("a server rejection shows a plain reason and offers no retry", async () => {
    const cases: Array<[string, string]> = [
      ["DAY_CLOSED", "today's tower closed before this run was saved"],
      ["REPLAY_MISMATCH", "couldn't verify this run for today's board"],
      ["RUN_TOO_LONG", "run too long to verify for today's board"],
      ["__proto__", "couldn't verify this run for today's board"],
      ["SOMETHING_NEW", "couldn't verify this run for today's board"],
    ];
    let checked = 0;
    for (const [code, copy] of cases) {
      net.resultStatus = 400;
      net.resultBody = { error: "x", code };
      await mountDaily();
      expect(rankLine(), code).toBe(copy);
      expect(buttonByText("Try again")).toBeUndefined();
      act(() => root?.unmount());
      container?.remove();
      checked++;
    }
    expect(checked).toBe(cases.length);
    root = null;
    container = null;
  });

  it("a run too long to encode goes to the all-time route only and says why", async () => {
    net.token = null;
    await mountDaily();
    expect(resultPosts()).toHaveLength(0);
    expect(postClimbResult).toHaveBeenCalledTimes(1);
    expect(rankLine()).toBe("run too long to verify for today's board");
  });

  it("no consent: the consent sheet comes first; declining posts nothing and says 'not on today's board'", async () => {
    setLeaderboardConsent(false);
    await mountDaily();
    expect(resultPosts()).toHaveLength(0);
    expect(buttonByText("Save my score")).toBeTruthy();
    await click(buttonByText("Not now"));
    expect(resultPosts()).toHaveLength(0);
    expect(rankLine()).toBe("not on today's board");
  });

  it("no consent: accepting saves consent, then posts the daily run", async () => {
    setLeaderboardConsent(false);
    await mountDaily();
    await click(buttonByText("Save my score"));
    expect(apiFetch.mock.calls.some(([p, init]) => p === "/api/settings" && init?.method === "PUT")).toBe(true);
    expect(resultPosts()).toHaveLength(1);
    expect(rankLine()).toBe("#3 of 12 today");
  });

  it("guest: 'sign in to save your score', a Sign in CTA, and no board link", async () => {
    auth.uid = null;
    net.resultBody = { saved: false, reason: "anonymous" };
    await mountDaily();
    expect(rankLine()).toBe("sign in to save your score");
    expect(buttonByText("See today’s board")).toBeUndefined();
    await click(buttonByText("Sign in to save"));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(buttonByText("Try again")).toBeUndefined();
  });
});
