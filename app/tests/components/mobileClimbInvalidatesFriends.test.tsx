/**
 * Native ClimbScreen (mobile/src/screens/ClimbScreen) marks the cached friends
 * board stale after a saved climb, so the Friends tab shows the new peak.
 *
 * The real screen renders inside the real AppDataProvider. The game loop
 * (useClimb) is stubbed to a finished run, the canvas/HUD/audio are stubbed, and
 * the network is mocked. Both save paths are covered: a direct save (consent
 * already given) and a save after the consent modal. A save the server did not
 * record must not invalidate.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const saveResult = vi.hoisted(() => ({ saved: true, improved: false }));

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false }),
}));

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

const apiFetch = vi.fn(async (path: string, _init?: RequestInit): Promise<Response> => {
  const body =
    path === "/api/climb/leaderboard/friends"
      ? { climbers: [], hiddenCount: 0, notClimbedCount: 0 }
      : { ok: true };
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
});
const postClimbResult = vi.fn(async (_run: object) => ({ ...saveResult }));

vi.mock("../../mobile/src/lib/api", () => ({
  API_BASE: "https://example.test",
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  postClimbResult: (run: object) => postClimbResult(run),
}));

vi.mock("../../mobile/src/lib/useGameHaptics", () => ({ useGameHaptics: () => {} }));

// A finished run with one recorded input, so the save effect fires on mount.
vi.mock("../../src/game/useClimb", async () => {
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  const state = createMatch({ seed: "s", mode: "solo", tower: buildFreeTower(), playerIds: ["p1"] });
  state.phase = "results";
  state.players[0].peakY = 42;
  return {
    useClimb: () => ({
      state,
      simRef: { current: state },
      renderFeed: {},
      start: () => {},
      finished: true,
      setTouch: () => {},
      runId: 1,
      inputLog: [{ tick: 0 }],
    }),
  };
});

vi.mock("../../src/game/runReplay", () => ({
  encodeRunReplay: async () => null,
  buildReplayUrl: () => "",
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

import { AppDataProvider, useFriendsLeaderboard } from "../../mobile/src/contexts/AppDataContext";
import { ClimbScreen } from "../../mobile/src/screens/ClimbScreen";
import { setLeaderboardConsent } from "../../mobile/src/lib/consent";

const friendsCalls = () => apiFetch.mock.calls.filter(([p]) => p === "/api/climb/leaderboard/friends").length;

/** Holds the friends slice open, as the Friends tab would. */
function FriendsBoardProbe() {
  useFriendsLeaderboard(true);
  return null;
}

let root: Root | null = null;
let container: HTMLElement | null = null;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

/**
 * Loads the friends board first, then mounts the finished climb — as in the
 * app, where the board was fetched on the Ranks tab before the player climbed.
 */
async function mountClimb() {
  container = document.createElement("div");
  document.body.appendChild(container);
  const tree = (climbing: boolean) =>
    createElement(
      MemoryRouter,
      { initialEntries: ["/climb"] },
      createElement(
        AppDataProvider,
        null,
        createElement(FriendsBoardProbe),
        climbing ? createElement(ClimbScreen) : null,
      ),
    );
  await act(async () => {
    root = createRoot(container!);
    root.render(tree(false));
  });
  await settle();
  expect(friendsCalls()).toBe(1);
  await act(async () => root!.render(tree(true)));
  // Let the async save effect resolve and the refetch it triggers settle.
  await settle();
  return container;
}

beforeEach(() => {
  apiFetch.mockClear();
  postClimbResult.mockClear();
  saveResult.saved = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

describe("ClimbScreen and the friends board", () => {
  it("refetches the friends board after a saved climb (consent already given)", async () => {
    setLeaderboardConsent(true);
    await mountClimb();

    expect(postClimbResult).toHaveBeenCalledTimes(1);
    expect(friendsCalls()).toBe(2);
  });

  it("refetches the friends board after a climb saved through the consent modal", async () => {
    setLeaderboardConsent(false);
    const c = await mountClimb();
    expect(postClimbResult).not.toHaveBeenCalled();
    expect(friendsCalls()).toBe(1);

    const accept = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Save my score");
    if (!accept) throw new Error("consent button not found");
    await act(async () => {
      accept.click();
    });
    await settle();

    expect(postClimbResult).toHaveBeenCalledTimes(1);
    expect(friendsCalls()).toBe(2);
  });

  it("keeps the cached friends board when the server did not save the climb", async () => {
    setLeaderboardConsent(true);
    saveResult.saved = false;
    await mountClimb();

    expect(postClimbResult).toHaveBeenCalledTimes(1);
    expect(friendsCalls()).toBe(1);
  });
});
