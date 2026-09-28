/**
 * Web /daily (DailyClimbClient). The tower seed comes only from
 * GET /api/climb/daily, because it is an HMAC the browser cannot derive
 * (SEC-DC-3). Offline or unavailable, the daily does not start: the page says
 * so and offers a retry or an endless run. A live run posts DAILY_SIM_VERSION
 * (SEC-DC-4) and commits the local streak to the SERVER's day.
 *
 * ClimbScene is stubbed to record the props it gets; fetch is mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface SceneProps {
  seed?: string;
  resultPath?: string;
  resultFields?: Record<string, unknown>;
  shareAfterSave?: boolean;
  onFinish?: (peakY: number) => void;
}

const scene = vi.hoisted(() => ({ props: [] as SceneProps[] }));

vi.mock("../../src/components/Game/ClimbScene", () => ({
  ClimbScene: (props: SceneProps) => {
    scene.props.push(props);
    return createElement("div", { "data-testid": "scene" }, `seed:${props.seed}`);
  },
}));
vi.mock("../../src/components/Game/ClimbControlsGuide", () => ({ ClimbControlsGuide: () => null }));

const commits = vi.hoisted(() => ({ calls: [] as Array<[number, string | undefined]> }));
vi.mock("../../src/lib/daily", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/daily")>();
  return {
    ...actual,
    commitDailyRun: (peakY: number, day?: string) => {
      commits.calls.push([peakY, day]);
      return actual.commitDailyRun(peakY, day);
    },
  };
});

import { DailyClimbClient } from "../../src/components/Game/DailyClimbClient";
import { DAILY_SIM_VERSION } from "../../src/game/simVersion";

const SERVER_SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";
const SERVER_DAY = "2026-09-26";

const net = vi.hoisted(() => ({ body: null as unknown, status: 200, fail: false }));
const fetchMock = vi.fn(async (): Promise<Response> => {
  if (net.fail) throw new TypeError("offline");
  return { ok: net.status === 200, status: net.status, json: async () => net.body } as Response;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(DailyClimbClient));
  });
  await settle();
}

const $ = (sel: string) => container!.querySelector(sel);
const byText = (tag: string, t: string) =>
  [...container!.querySelectorAll(tag)].find((el) => el.textContent?.trim() === t) as HTMLElement | undefined;

beforeEach(() => {
  scene.props = [];
  commits.calls = [];
  net.body = { day: SERVER_DAY, seed: SERVER_SEED, resetsAt: "2026-09-27T00:00:00.000Z" };
  net.status = 200;
  net.fail = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("web Daily Climb seed (SEC-DC-3, SEC-DC-4)", () => {
  it("plays the server's seed, with no locally derived seed first, and posts simVersion", async () => {
    await mount();
    expect(fetchMock).toHaveBeenCalledWith("/api/climb/daily", { cache: "no-store" });
    expect(scene.props.length).toBeGreaterThan(0);
    expect(new Set(scene.props.map((p) => p.seed))).toEqual(new Set([SERVER_SEED]));
    const last = scene.props.at(-1)!;
    expect(last.resultPath).toBe("/api/climb/daily/result");
    expect(last.resultFields).toEqual({ simVersion: DAILY_SIM_VERSION });
    // SEC-DC-12: the replay link waits for the save (tests/components/webDailyShareGate.test.tsx).
    expect(last.shareAfterSave).toBe(true);
  });

  it("commits a finished run to the server's day", async () => {
    await mount();
    act(() => scene.props.at(-1)!.onFinish!(12));
    expect(commits.calls).toEqual([[12, SERVER_DAY]]);
  });

  it.each([
    ["offline", () => (net.fail = true)],
    ["503 unavailable", () => (net.status = 503)],
    ["a legacy date seed", () => (net.body = { day: SERVER_DAY, seed: `daily-${SERVER_DAY}`, resetsAt: "x" })],
  ])("%s: no daily starts; the page offers Try again and an endless run", async (_label, arrange) => {
    arrange();
    await mount();
    expect(scene.props).toEqual([]);
    expect($('[role="alert"]')?.textContent).toContain("Can’t load today’s tower");
    expect(byText("a", "Play endless instead")?.getAttribute("href")).toBe("/play");
    expect(byText("button", "Try again")).toBeTruthy();
  });

  it("Try again refetches and starts the daily once the server answers", async () => {
    net.fail = true;
    await mount();
    net.fail = false;
    await act(async () => byText("button", "Try again")!.click());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(scene.props.at(-1)?.seed).toBe(SERVER_SEED);
    expect($('[role="alert"]')).toBeNull();
  });
});
