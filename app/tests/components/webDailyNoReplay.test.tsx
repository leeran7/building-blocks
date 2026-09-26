/**
 * RV-DC-1: a signed-in web daily run with no replay token (too long to
 * encode, or no CompressionStream-free encoder) cannot be verified by the
 * daily route, which answers 400 REPLAY_REQUIRED. ClimbScene must post it to
 * the all-time route instead, without the daily fields, as mobile does.
 *
 * Verifier info #1: the results card's own "Sign in" link must keep the
 * replay-bearing stash instead of overwriting it with a token-less run.
 *
 * The real ClimbScene renders. useClimb is replaced by a run on a daily tower
 * (real createMatch, real encoder) whose `finished` flag the test controls;
 * canvas and audio hooks are stubbed; fetch records every POST and its body.
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

const { SEED, scene } = vi.hoisted(() => ({ SEED: "daily1-AbCdEfGhIjKlMnOpQrSt_-", scene: { finished: true } }));

const codec = vi.hoisted(() => ({ encodeNull: false }));
vi.mock("../../src/game/runReplay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/runReplay")>();
  return {
    ...actual,
    encodeRunReplay: async (...args: Parameters<typeof actual.encodeRunReplay>) =>
      codec.encodeNull ? null : actual.encodeRunReplay(...args),
  };
});

vi.mock("../../src/game/useClimb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/useClimb")>();
  const { createMatch } = await import("../../src/game/simulation");
  const { applyRunSeed } = await import("../../src/game/towers");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  const state = createMatch({ seed: SEED, mode: "solo", tower: applyRunSeed(buildFreeTower(), SEED), playerIds: ["you"] });
  state.phase = "results";
  state.players[0].peakY = 42;
  const idle = { moveX: 0, jump: false, climbY: 0, usePowerUp: false } as const;
  const inputLog = Array.from({ length: 30 }, () => ({ ...idle }));
  const run = {
    state,
    simRef: { current: state },
    renderFeed: { current: { prev: state, next: state, at: 0 } },
    start: () => {},
    setTouch: () => {},
    runId: 1,
    inputLog,
    replaying: false,
    transport: null,
    togglePlayPause: () => {},
    cycleSpeed: () => {},
    rewind: () => {},
    seekToTick: () => {},
    restartReplay: () => {},
  };
  return { ...actual, useClimb: () => ({ ...run, finished: scene.finished, inputLog: scene.finished ? inputLog : [] }) };
});

import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { buildFreeTower } from "../../src/game/freeStack";

const STASH_KEY = "doomstack:pending-climb";
const DAILY_PATH = "/api/climb/daily/result";
const ALL_TIME_PATH = "/api/climb/result";
const FALLBACK_NOTE = "Too long to verify for today\u2019s board \u00b7 saved to all-time";

interface Post {
  path: string;
  body: Record<string, unknown>;
}
const net = vi.hoisted(() => ({ posts: [] as Post[] }));
const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
  net.posts.push({ path, body: JSON.parse(String(init?.body)) });
  return { ok: true, status: 200, json: async () => ({ saved: true, rank: 7, totalClimbers: 90 }) } as Response;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  });

type SceneProps = {
  shareAfterSave?: boolean;
  resultPath?: string;
  resultFields?: Readonly<Record<string, string | number | boolean>>;
};
const DAILY_PROPS: SceneProps = { shareAfterSave: true, resultPath: DAILY_PATH, resultFields: { simVersion: 1 } };

async function render(props: SceneProps) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ClimbScene, { tower: buildFreeTower(), categoryLabel: "Daily", seed: SEED, ...props }));
  });
  await settle();
}

beforeEach(() => {
  auth.user = { uid: "u1", isAnonymous: false };
  auth.token = "id-token";
  scene.finished = true;
  codec.encodeNull = false;
  net.posts = [];
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

describe("web daily run with no replay token (RV-DC-1)", () => {
  it("posts once to the all-time route, never to the daily route, without the daily fields", async () => {
    codec.encodeNull = true;
    await render(DAILY_PROPS);
    expect(net.posts.map((p) => p.path)).toEqual([ALL_TIME_PATH]);
    const [post] = net.posts;
    expect(post.body).toMatchObject({ seed: SEED, peakY: 42 });
    expect(post.body).not.toHaveProperty("replayToken");
    expect(post.body).not.toHaveProperty("simVersion");
    expect(container!.textContent).toContain("#7");
    expect(container!.textContent).toContain(FALLBACK_NOTE);
    expect(container!.textContent).not.toContain("Couldn\u2019t save your run");
  });

  it("control: with a replay token the daily run goes to the daily route with its fields", async () => {
    await render(DAILY_PROPS);
    expect(net.posts.map((p) => p.path)).toEqual([DAILY_PATH]);
    expect(net.posts[0].body).toMatchObject({ simVersion: 1 });
    expect(typeof net.posts[0].body.replayToken).toBe("string");
    expect(container!.textContent).not.toContain(FALLBACK_NOTE);
  });

  it("control: an endless run with no token still posts to the all-time route and shows no daily note", async () => {
    codec.encodeNull = true;
    await render({});
    expect(net.posts.map((p) => p.path)).toEqual([ALL_TIME_PATH]);
    expect(container!.textContent).not.toContain(FALLBACK_NOTE);
  });
});

describe("the results card's Sign in link keeps the replay-bearing stash (verifier info #1)", () => {
  it("clicking Sign in after a signed-out daily run leaves the replayToken in the stash", async () => {
    auth.user = null;
    auth.token = null;
    await render(DAILY_PROPS);
    const before = JSON.parse(sessionStorage.getItem(STASH_KEY) ?? "null") as Record<string, unknown> | null;
    expect(typeof before?.replayToken).toBe("string");

    const link = [...container!.querySelectorAll("a")].find((a) => a.textContent === "Sign in");
    expect(link).toBeDefined();
    act(() => {
      link!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const after = JSON.parse(sessionStorage.getItem(STASH_KEY) ?? "null") as Record<string, unknown> | null;
    expect(after).toEqual(before);
    expect(net.posts).toEqual([]);
  });
});
