/**
 * Signed-out web daily run, then sign-in: the stashed run is saved to the
 * ALL-TIME route (ClimbScene's retroactive save), never to the daily board.
 * Pinned because nothing else would catch its removal (SE iteration 4 flag,
 * ClimbScene.tsx:360). The same retro-save must not open the daily share link:
 * the run was never ranked on the daily board (SEC-DC-12 / SEC-DC-16).
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
import { decodeRunReplay } from "../../src/game/runReplay";

const STASH_KEY = "doomstack:pending-climb";
const DAILY_PATH = "/api/climb/daily/result";
const ALL_TIME_PATH = "/api/climb/result";

interface Post {
  path: string;
  body: Record<string, unknown>;
  auth: string | null;
}
const net = vi.hoisted(() => ({ posts: [] as Post[], reply: { saved: true, rank: 5, totalClimbers: 40 } as unknown }));
const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  net.posts.push({ path, body: JSON.parse(String(init?.body)), auth: headers.Authorization ?? null });
  return { ok: true, status: 200, json: async () => net.reply } as Response;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  });

type SceneProps = { shareAfterSave?: boolean; resultPath?: string; categoryLabel?: string };
const DAILY_PROPS: SceneProps = { shareAfterSave: true, resultPath: DAILY_PATH, categoryLabel: "Daily" };

async function render(props: SceneProps) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(createElement(ClimbScene, { tower: buildFreeTower(), categoryLabel: "Free climb", seed: SEED, ...props }));
  });
  await settle();
}

function signIn() {
  auth.user = { uid: "u1", isAnonymous: false };
  auth.token = "id-token";
}

const linkShown = () =>
  Boolean(
    container!.querySelector('[aria-label="Copy replay link"]') ||
      container!.querySelector('[aria-label="Share replay on X"]') ||
      /[?&]r=/.test(container!.innerHTML),
  );

beforeEach(() => {
  auth.user = null;
  auth.token = null;
  scene.finished = true;
  net.posts = [];
  net.reply = { saved: true, rank: 5, totalClimbers: 40 };
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

async function playSignedOutDaily(): Promise<Record<string, unknown>> {
  await render(DAILY_PROPS);
  expect(net.posts).toEqual([]);
  const raw = sessionStorage.getItem(STASH_KEY);
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, unknown>;
}

describe("signed-out web daily run is saved to the all-time board after sign-in", () => {
  it("signing in on the same scene posts the stash once, to the all-time route, with the daily seed and replay", async () => {
    const stash = await playSignedOutDaily();
    expect(stash.seed).toBe(SEED);
    expect(typeof stash.replayToken).toBe("string");

    signIn();
    await render(DAILY_PROPS);

    expect(net.posts.map((p) => p.path)).toEqual([ALL_TIME_PATH]);
    const [post] = net.posts;
    expect(post.auth).toBe("Bearer id-token");
    expect(post.body).toMatchObject({ seed: SEED, peakY: 42, replayToken: stash.replayToken });
    // The token is the real run: it decodes to the daily seed and its 30-tick log.
    const replay = await decodeRunReplay(String(post.body.replayToken));
    expect(replay?.seed).toBe(SEED);
    expect(replay?.inputs).toHaveLength(30);
    expect(sessionStorage.getItem(STASH_KEY)).toBeNull();
    expect(container!.textContent).toContain("Record saved · #5 of 40");
  });

  it("the retro-save never opens the daily share link, even when it succeeds", async () => {
    await playSignedOutDaily();
    expect(linkShown()).toBe(false);
    signIn();
    await render(DAILY_PROPS);
    // Positive control: the retro-save really happened and succeeded.
    expect(net.posts).toHaveLength(1);
    expect(container!.textContent).toContain("Record saved");
    expect(linkShown()).toBe(false);
    expect(container!.textContent).toContain("Daily runs can be shared once they're saved");
  });

  it("re-rendering after the retro-save does not post the run again", async () => {
    await playSignedOutDaily();
    signIn();
    await render(DAILY_PROPS);
    await render(DAILY_PROPS);
    expect(net.posts.map((p) => p.path)).toEqual([ALL_TIME_PATH]);
  });

  it("a fresh scene on another page (the post-sign-in /play redirect) saves the daily stash to the all-time route", async () => {
    await playSignedOutDaily();
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;

    signIn();
    scene.finished = false; // the /play scene has not been played yet
    await render({});
    expect(net.posts.map((p) => p.path)).toEqual([ALL_TIME_PATH]);
    expect(net.posts[0].body).toMatchObject({ seed: SEED, peakY: 42 });
    expect(typeof net.posts[0].body.replayToken).toBe("string");
  });

  it("an anonymous (guest) session does not retro-save", async () => {
    await playSignedOutDaily();
    auth.user = { uid: "anon", isAnonymous: true };
    auth.token = "anon-token";
    await render(DAILY_PROPS);
    expect(net.posts).toEqual([]);
    expect(sessionStorage.getItem(STASH_KEY)).not.toBeNull();
  });
});
