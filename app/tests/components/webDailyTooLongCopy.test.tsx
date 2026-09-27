/**
 * QA-DC-1 re-check through the real ClimbScene and the REAL replay encoder:
 * a web daily run whose input log is longer than MAX_SHARE_TICKS gets no
 * replay token, so it falls back to the all-time route. The results card may
 * only say "saved to your all-time best" once that route acknowledged it.
 *
 * Unlike webDailyNoReplay (which forces the encoder to return null), the
 * too-long state here comes from the log length alone, and the one fetch is
 * held open so the same card is observed Saving… and then after its answer.
 * A run of exactly MAX_SHARE_TICKS is the boundary control: it still goes to
 * the daily route with a replay.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  user: null as { uid: string; isAnonymous: boolean } | null,
  token: null as string | null,
}));
vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: vi.fn(), announcement: "", unlockAudio: vi.fn() }),
}));

const { SEED, scene } = vi.hoisted(() => ({ SEED: "daily1-AbCdEfGhIjKlMnOpQrSt_-", scene: { finished: true, ticks: 30 } }));

vi.mock("../../src/game/useClimb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/useClimb")>();
  const { createMatch } = await import("../../src/game/simulation");
  const { applyRunSeed } = await import("../../src/game/towers");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  const state = createMatch({ seed: SEED, mode: "solo", tower: applyRunSeed(buildFreeTower(), SEED), playerIds: ["you"] });
  state.phase = "results";
  state.players[0].peakY = 42;
  const idle = { moveX: 0, jump: false, climbY: 0, usePowerUp: false } as const;
  const logs = new Map<number, unknown[]>();
  const logOf = (n: number) => {
    if (!logs.has(n)) logs.set(n, Array.from({ length: n }, () => ({ ...idle })));
    return logs.get(n)!;
  };
  const run = {
    state,
    simRef: { current: state },
    renderFeed: { current: { prev: state, next: state, at: 0 } },
    start: () => {},
    setTouch: () => {},
    runId: 1,
    inputLog: [] as unknown[],
    replaying: false,
    transport: null,
    togglePlayPause: () => {},
    cycleSpeed: () => {},
    rewind: () => {},
    seekToTick: () => {},
    restartReplay: () => {},
  };
  return { ...actual, useClimb: () => ({ ...run, finished: scene.finished, inputLog: scene.finished ? logOf(scene.ticks) : [] }) };
});


import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { buildFreeTower } from "../../src/game/freeStack";
import { MAX_SHARE_TICKS } from "../../src/game/runReplay";

const DAILY_PATH = "/api/climb/daily/result";
const ALL_TIME_PATH = "/api/climb/result";
const TOO_LONG = "Too long to verify for the Daily board";
const SAVED_NOTE = `${TOO_LONG} · saved to your all-time best`;
const SAVED_CLAIM = "saved to your all-time best";
const COULDNT = "Couldn’t save your run";

type Reply = { ok: boolean; status: number; body: unknown };
const net = { posts: [] as { path: string; body: Record<string, unknown> }[], answer: null as ((r: Reply) => void) | null };
const fetchMock = vi.fn((path: string, init?: RequestInit) => {
  net.posts.push({ path, body: JSON.parse(String(init?.body)) });
  return new Promise<Response>((resolve) => {
    net.answer = (r) => resolve({ ok: r.ok, status: r.status, json: async () => r.body } as Response);
  });
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  });
const text = () => container!.textContent ?? "";
const count = (s: string) => text().split(s).length - 1;

async function renderDaily() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(ClimbScene, {
        tower: buildFreeTower(),
        categoryLabel: "Daily",
        seed: SEED,
        shareAfterSave: true,
        resultPath: DAILY_PATH,
        resultFields: { simVersion: 1 },
      })
    );
  });
  await settle();
}

async function answer(r: Reply) {
  expect(net.answer).not.toBeNull();
  await act(async () => net.answer!(r));
  await settle();
}

beforeEach(() => {
  auth.user = { uid: "u1", isAnonymous: false };
  auth.token = "id-token";
  scene.finished = true;
  scene.ticks = MAX_SHARE_TICKS + 1;
  net.posts = [];
  net.answer = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("too-long web daily run, real encoder (QA-DC-1 re-check)", () => {
  it("Saving… then a 503: only the too-long line, never a saved claim", async () => {
    await renderDaily();
    expect(net.posts.map((p) => p.path)).toEqual([ALL_TIME_PATH]);
    expect(net.posts[0].body).not.toHaveProperty("replayToken");
    expect(net.posts[0].body).not.toHaveProperty("simVersion");

    expect(text()).toContain("Saving…");
    expect(count(TOO_LONG)).toBe(1);
    expect(text()).not.toContain(SAVED_CLAIM);

    await answer({ ok: false, status: 503, body: { error: { code: "UNAVAILABLE" } } });
    expect(text()).toContain(COULDNT);
    expect(text()).not.toContain("Saving…");
    expect(count(TOO_LONG)).toBe(1);
    expect(text()).not.toContain(SAVED_CLAIM);
    expect(net.posts).toHaveLength(1);
  });

  it("a 200 that did not save (no consent) is not a saved claim either", async () => {
    await renderDaily();
    await answer({ ok: true, status: 200, body: { saved: false, reason: "no_consent" } });
    expect(text()).toContain(COULDNT);
    expect(count(TOO_LONG)).toBe(1);
    expect(text()).not.toContain(SAVED_CLAIM);
  });

  it("Saving… then saved with a rank: the full note once, with the all-time rank", async () => {
    await renderDaily();
    expect(text()).not.toContain(SAVED_CLAIM);
    await answer({ ok: true, status: 200, body: { saved: true, rank: 7, totalClimbers: 90 } });
    expect(text()).toContain("#7");
    expect(count(SAVED_NOTE)).toBe(1);
    expect(count(TOO_LONG)).toBe(1);
    expect(text()).not.toContain(COULDNT);
    expect(text()).not.toContain("Saving…");
  });

  it("boundary control: exactly MAX_SHARE_TICKS still carries a replay to the daily route, no too-long line", async () => {
    scene.ticks = MAX_SHARE_TICKS;
    await renderDaily();
    expect(net.posts.map((p) => p.path)).toEqual([DAILY_PATH]);
    expect(typeof net.posts[0].body.replayToken).toBe("string");
    expect(net.posts[0].body).toMatchObject({ simVersion: 1 });
    await answer({ ok: true, status: 200, body: { saved: true, rank: 3, totalClimbers: 40 } });
    expect(text()).toContain("#3");
    expect(text()).not.toContain(TOO_LONG);
  });
});
