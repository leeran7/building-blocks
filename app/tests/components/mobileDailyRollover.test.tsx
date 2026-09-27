/**
 * RV-DC-3 (mobile): "Play again" after 00:00 UTC must not replay yesterday's
 * tower. ClimbScreen drops a daily answer once the server's reset has passed
 * since it was requested, refetches, shows the wait on the button, and starts
 * on today's seed as soon as it lands. A device clock a little ahead of the
 * server refetches once and then plays what the server says.
 *
 * Harness as in mobileClimbDaily.test.tsx; useClimb's start() records the
 * seed of the render it came from (the real hook's closure). Only Date is
 * faked.
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
  infoStatus: 200,
  holdInfo: false,
  heldInfo: [] as Array<() => void>,
  resultStatus: 200,
  resultBody: null as unknown,
  token: "replay-token" as string | null,
  holdResult: false,
  heldResult: [] as Array<() => void>,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const apiFetch = vi.fn(async (path: string, _init?: RequestInit): Promise<Response> => {
  if (path === "/api/climb/daily") {
    const answer = () => (net.info ? jsonResponse(net.info, net.infoStatus) : jsonResponse({}, 503));
    if (net.holdInfo) return new Promise<Response>((resolve) => net.heldInfo.push(() => resolve(answer())));
    return answer();
  }
  if (path === "/api/climb/daily/result") {
    const answer = () => jsonResponse(net.resultBody, net.resultStatus);
    if (net.holdResult) return new Promise<Response>((resolve) => net.heldResult.push(() => resolve(answer())));
    return answer();
  }
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

const climb = vi.hoisted(() => ({
  seeds: [] as Array<string | undefined>,
  starts: [] as Array<string | undefined>,
  phase: "results" as "results" | "lobby",
}));
vi.mock("../../src/game/useClimb", async () => {
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  return {
    useClimb: ({ seed }: { seed?: string }) => {
      climb.seeds.push(seed);
      const state = createMatch({ seed: seed ?? "solo", mode: "solo", tower: buildFreeTower(), playerIds: ["you"] });
      const lobby = climb.phase === "lobby";
      state.phase = lobby ? "lobby" : "results";
      state.players[0].peakY = 42;
      return {
        state,
        simRef: { current: state },
        renderFeed: {},
        // Like the real hook, start() locks the seed of the render it came from.
        start: () => {
          climb.starts.push(seed);
        },
        finished: !lobby,
        setTouch: () => {},
        runId: 1,
        inputLog: lobby ? [] : [{ moveX: 0, jump: false, climbY: 1, usePowerUp: false }],
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
  useTouchControlsInset: () => 0,
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

/** A server-shaped seed. The real one is an HMAC the client cannot compute. */
const SERVER_SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";
// `now` is the server clock at answer time (the device reads the same in beforeEach).
const OLD = { day: "2026-09-26", seed: SERVER_SEED, resetsAt: "2026-09-27T00:00:00.000Z", now: "2026-09-26T23:59:00.000Z" };
const NEW = { day: "2026-09-27", seed: "daily1-NewNewNewNewNewNewNewN", resetsAt: "2026-09-28T00:00:00.000Z", now: "2026-09-27T00:00:30.000Z" };
const todayInfo = () => OLD;

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

const buttonByText = (t: string) =>
  Array.from(container!.querySelectorAll("button")).find((b) => b.textContent?.trim().toLowerCase() === t.toLowerCase());
const saved = () => ({ saved: true, day: OLD.day, peakY: 42, improved: true, rank: 3, totalClimbers: 12, attempts: 1 });

beforeEach(() => {
  auth.uid = "me";
  apiFetch.mockClear();
  postClimbResult.mockClear();
  onSignIn.mockClear();
  climb.seeds = [];
  climb.starts = [];
  climb.phase = "results";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T23:59:00Z"));
  net.info = todayInfo();
  net.infoStatus = 200;
  net.holdInfo = false;
  net.heldInfo = [];
  net.resultStatus = 200;
  net.resultBody = saved();
  net.token = "replay-token";
  net.holdResult = false;
  net.heldResult = [];
  localStorage.clear();
  setLeaderboardConsent(true);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const infoFetches = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/daily").length;
const playAgain = () =>
  Array.from(container!.querySelectorAll("button")).find((b) =>
    /play again|today.s tower/i.test(b.textContent ?? ""),
  ) as HTMLButtonElement | undefined;

describe("ClimbScreen daily across 00:00 UTC (RV-DC-3)", () => {
  it("control: before the reset Play again starts on the fetched seed with no refetch", async () => {
    await mountDaily();
    await click(playAgain());
    expect(climb.starts).toEqual([OLD.seed]);
    expect(infoFetches()).toBe(1);
  });

  it("after the reset Play again refetches and starts on today's seed, never yesterday's", async () => {
    await mountDaily();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.info = NEW;
    net.holdInfo = true;
    await click(playAgain());
    expect(infoFetches()).toBe(2);
    expect(climb.starts).toEqual([]);
    expect(playAgain()?.textContent).toBe("Loading today\u2019s tower\u2026");
    expect(playAgain()?.disabled).toBe(true);
    await act(async () => net.heldInfo.splice(0).forEach((go) => go()));
    await settle();
    expect(climb.starts).toEqual([NEW.seed]);
  });

  it("in the lobby, Start daily after the reset also refetches first", async () => {
    climb.phase = "lobby";
    await mountDaily();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.info = NEW;
    await click(buttonByText("Start daily"));
    expect(climb.starts).toEqual([NEW.seed]);
    expect(infoFetches()).toBe(2);
  });

  it("a device clock ahead of the server refetches once, then plays the server's answer", async () => {
    await mountDaily();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    // The server has not reset yet: it still names the old tower.
    await click(playAgain());
    expect(climb.starts).toEqual([OLD.seed]);
    expect(infoFetches()).toBe(2);
  });

  it("a device clock 2 min fast that refetched just before the real reset still gets today's tower 3 h later (V-DC-2)", async () => {
    await mountDaily();
    // Device 00:00:30, server 23:58:30: the refetch still names yesterday.
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.info = { ...OLD, now: "2026-09-26T23:58:30.000Z" };
    await click(playAgain());
    expect(climb.starts).toEqual([OLD.seed]);
    expect(infoFetches()).toBe(2);
    // Three hours later the server has reset: Play again refetches today's tower.
    vi.setSystemTime(new Date("2026-09-27T03:00:30Z"));
    net.info = { ...NEW, now: "2026-09-27T02:58:30.000Z" };
    await click(playAgain());
    expect(infoFetches()).toBe(3);
    expect(climb.starts).toEqual([OLD.seed, NEW.seed]);
  });

  it("if the refetch fails nothing starts, and the button offers a retry", async () => {
    await mountDaily();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.info = null; // 503
    await click(playAgain());
    expect(climb.starts).toEqual([]);
    expect(playAgain()?.textContent).toBe("Can\u2019t reach today\u2019s tower \u00b7 retry");
    net.info = NEW;
    await click(playAgain());
    expect(climb.starts).toEqual([NEW.seed]);
  });
});

describe("ClimbScreen daily: a failed refetch cancels the pending start (verifier)", () => {
  it("lobby: Start daily after the reset, the refetch fails, then Try again loads today's tower WITHOUT starting a run", async () => {
    climb.phase = "lobby";
    await mountDaily();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.info = null; // 503
    await click(buttonByText("Start daily"));
    expect(climb.starts).toEqual([]);
    const retry = buttonByText("Try again");
    expect(retry).toBeDefined();

    net.info = NEW;
    await click(retry);
    // The player asked to load the tower, not to start the lava: back to the lobby.
    expect(climb.starts).toEqual([]);
    expect(buttonByText("Start daily")).toBeDefined();
    await click(buttonByText("Start daily"));
    expect(climb.starts).toEqual([NEW.seed]);
  });
});

describe("ClimbScreen daily: network time counts as elapsed (V-DC-2, verifier)", () => {
  it("a slow answer is timed from the request, so Play again refetches at the server's reset, not 90 s after it", async () => {
    // Requested at 23:58:00 with the server saying 2 min are left; the answer takes 90 s to arrive.
    vi.setSystemTime(new Date("2026-09-26T23:58:00Z"));
    net.info = { ...OLD, now: "2026-09-26T23:58:00.000Z" };
    net.holdInfo = true;
    await mountDaily();
    vi.setSystemTime(new Date("2026-09-26T23:59:30Z"));
    await act(async () => net.heldInfo.splice(0).forEach((go) => go()));
    await settle();
    net.holdInfo = false;
    // Positive control: 1 ms before the server's reset Play again starts with no refetch.
    vi.setSystemTime(new Date("2026-09-26T23:59:59.999Z"));
    await click(playAgain());
    expect(climb.starts).toEqual([OLD.seed]);
    expect(infoFetches()).toBe(1);
    // At the reset the 2 min have passed since the request: refetch, then today's tower.
    vi.setSystemTime(new Date("2026-09-27T00:00:00.000Z"));
    net.info = NEW;
    await click(playAgain());
    expect(infoFetches()).toBe(2);
    expect(climb.starts).toEqual([OLD.seed, NEW.seed]);
  });
});

describe("ClimbScreen daily lobby: 'Resets in' on the server's clock (RV-DCF-6, verifier)", () => {
  // Device 2 min fast: it reads 00:01:00 on the 27th while the server says
  // 23:59:00 on the 26th. The device clock alone would say "23h 59m".
  // performance is frozen too: the countdown reads both clocks, and real
  // milliseconds on the monotonic clock would floor "1m" to "<1m".
  const resetsIn = () =>
    Array.from(container!.querySelectorAll("p"))
      .map((p) => p.textContent ?? "")
      .find((t) => t.startsWith("Resets in")) ?? null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(new Date("2026-09-27T00:01:00Z"));
    climb.phase = "lobby";
    net.info = OLD; // now: 23:59:00, resetsAt: 00:00:00
  });

  it("device 2 min fast, server at 23:59:00: the lobby reads 1m", async () => {
    await mountDaily();
    expect(infoFetches()).toBe(1);
    expect(buttonByText("Start daily")).toBeDefined();
    expect(resetsIn()).toBe("Resets in 1m");
  });

  it("before the first answer it falls back to the device clock, then switches when the answer lands", async () => {
    net.holdInfo = true;
    await mountDaily();
    expect(buttonByText("Start daily")).toBeUndefined();
    expect(resetsIn()).toBe("Resets in 23h 59m");
    await act(async () => net.heldInfo.splice(0).forEach((go) => go()));
    await settle();
    expect(buttonByText("Start daily")).toBeDefined();
    expect(resetsIn()).toBe("Resets in 1m");
  });

  it("the lobby names the Daily board with a capital D, like the web lobby (RV-DCF-5)", async () => {
    await mountDaily();
    expect(container!.textContent).toContain("One seed, one shot at the top of the Daily board.");
    expect(container!.textContent).not.toContain("daily board");
  });
});
