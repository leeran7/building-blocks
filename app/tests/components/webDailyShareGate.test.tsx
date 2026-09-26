/**
 * SEC-DC-12 on the web: a daily replay belongs to whichever account submits
 * it first, so ClimbScene (with `shareAfterSave`, as DailyClimbClient sets it)
 * must not put the replay link in the page until the owner's own save returns
 * `saved: true`. A pending, failed or never-sent (signed-out) save shows no
 * link. The endless /play scene (no `shareAfterSave`) keeps sharing at once.
 *
 * The real ClimbScene and ShareRun render. useClimb is replaced by a finished
 * run on today's tower (real createMatch, real encoder); the canvas and audio
 * hooks are stubbed; fetch is held so the test controls when the save lands.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  user: { uid: "u1", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null,
  token: "id-token" as string | null,
}));
vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: vi.fn(), announcement: "", unlockAudio: vi.fn() }),
}));

const { SEED } = vi.hoisted(() => ({ SEED: "daily1-AbCdEfGhIjKlMnOpQrSt_-" }));

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
  const finishedRun = {
    state,
    simRef: { current: state },
    renderFeed: { current: { prev: state, next: state, at: 0 } },
    start: () => {},
    finished: true,
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
  return { ...actual, useClimb: () => finishedRun };
});

import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { buildFreeTower } from "../../src/game/freeStack";

type Held = (body: unknown, status?: number) => void;
const net = vi.hoisted(() => ({ held: [] as Held[], posts: [] as string[] }));
const fetchMock = vi.fn(
  (path: string) =>
    new Promise<Response>((resolve) => {
      net.posts.push(path);
      net.held.push((body, status = 200) =>
        resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response),
      );
    }),
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Flushes microtasks and macrotasks: the replay encoder runs a compression stream. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  });

async function mount(props: { shareAfterSave?: boolean; resultPath?: string }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(ClimbScene, { tower: buildFreeTower(), categoryLabel: "Daily", seed: SEED, ...props }));
  });
  await settle();
}

const html = () => container!.innerHTML;
const copyButton = () => container!.querySelector('[aria-label="Copy replay link"]');
const shareOnX = () => container!.querySelector('[aria-label="Share replay on X"]');
/** Any trace of the replay token in the page: a /play?r= link or the share buttons. */
const linkShown = () => Boolean(copyButton() || shareOnX() || /[?&]r=/.test(html()));

async function answerSave(body: unknown, status = 200) {
  await act(async () => net.held.shift()!(body, status));
  await settle();
}

beforeEach(() => {
  auth.user = { uid: "u1", isAnonymous: false };
  auth.token = "id-token";
  net.held = [];
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

describe("daily share link waits for the owner's save (SEC-DC-12)", () => {
  it("shows no link while the save is in flight, then offers it once the server says saved", async () => {
    await mount({ shareAfterSave: true, resultPath: "/api/climb/daily/result" });
    expect(net.posts).toEqual(["/api/climb/daily/result"]);
    // Precondition: the replay really was encoded (the run is shareable).
    expect(html()).not.toContain("too long to share");
    expect(linkShown()).toBe(false);
    expect(container!.textContent).toContain("the replay link appears once it's on the board");

    await answerSave({ saved: true, rank: 3, totalClimbers: 12, improved: true });
    expect(copyButton()).toBeTruthy();
    expect(shareOnX()?.getAttribute("href")).toContain(encodeURIComponent("/play?r="));
  });

  it.each([
    ["a 5xx", { saved: false, reason: "persist_error" }, 500],
    ["a 409 REPLAY_REUSED", { error: "x", code: "REPLAY_REUSED" }, 409],
    ["a 429", { error: "x", code: "RATE_LIMITED" }, 429],
    ["no consent (saved: false)", { saved: false, reason: "no_consent" }, 200],
  ])("never offers the link after %s", async (_label, body, status) => {
    await mount({ shareAfterSave: true, resultPath: "/api/climb/daily/result" });
    await answerSave(body, status);
    expect(linkShown()).toBe(false);
    expect(container!.textContent).toContain("Daily runs can be shared once they're saved");
  });

  it("never offers the link for a signed-out daily run (nothing was saved)", async () => {
    auth.user = null;
    auth.token = null;
    await mount({ shareAfterSave: true, resultPath: "/api/climb/daily/result" });
    expect(net.posts).toEqual([]);
    expect(linkShown()).toBe(false);
    expect(container!.textContent).toContain("Daily runs can be shared once they're saved");
  });

  it("control: the endless scene (no shareAfterSave) offers the link before its save lands", async () => {
    await mount({});
    expect(net.posts).toEqual(["/api/climb/result"]);
    expect(copyButton()).toBeTruthy();
    expect(linkShown()).toBe(true);
  });
});
