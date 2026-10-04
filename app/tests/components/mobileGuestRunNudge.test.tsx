/**
 * The one-time sign-in nudge after a guest's third finished Endless run: a
 * sheet over the result card, shown once per device, on top of the card's
 * per-run "Sign in to save". Accounts and the Daily never count.
 *
 * The real ClimbScreen runs, inside the real AppDataProvider, with the game loop stubbed to a finished run
 * (as in mobileClimbDaily.test.tsx); each mount is one finished run.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ uid: null as string | null }));
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
vi.mock("../../mobile/src/lib/api", () => ({
  API_BASE: "https://example.test",
  apiFetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response,
  postClimbResult: async () => ({ saved: false }),
}));
vi.mock("../../mobile/src/lib/useGameHaptics", () => ({ useGameHaptics: () => {} }));
vi.mock("../../src/game/useClimb", async () => {
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  return {
    useClimb: ({ seed }: { seed?: string }) => {
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
  encodeRunReplay: async () => null,
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
import {
  GUEST_NUDGE_AFTER_RUNS,
  GUEST_NUDGE_KEY,
  GUEST_RUNS_KEY,
  recordGuestEndlessRun,
  resetGuestNudgeForTests,
} from "../../mobile/src/lib/guestMode";

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const onSignIn = vi.fn();

beforeEach(() => {
  localStorage.clear();
  resetGuestNudgeForTests();
  auth.uid = null;
  onSignIn.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Mounts the climb on a finished run: one run counted. */
async function finishRun(path = "/climb", withSignIn = true) {
  act(() => root?.unmount());
  container?.remove();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <AppDataProvider>
          <Routes>
            <Route path="/climb" element={<ClimbScreen onSignIn={withSignIn ? onSignIn : undefined} />} />
          </Routes>
        </AppDataProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

const nudge = () => document.body.querySelector<HTMLElement>("[data-guest-sign-in]");
const buttonByText = (t: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === t);

describe("guest run counter", () => {
  it("is true on the third run only, once per device", () => {
    expect(GUEST_NUDGE_AFTER_RUNS).toBe(3);
    expect([1, 2, 3, 4, 5].map(() => recordGuestEndlessRun())).toEqual([false, false, true, false, false]);
    expect(localStorage.getItem(GUEST_RUNS_KEY)).toBe("5");
    expect(localStorage.getItem(GUEST_NUDGE_KEY)).toBe("1");
  });

  it("stays shown after a relaunch (stored flag)", () => {
    for (let i = 0; i < GUEST_NUDGE_AFTER_RUNS; i++) recordGuestEndlessRun();
    resetGuestNudgeForTests();
    expect(recordGuestEndlessRun()).toBe(false);
  });

  it("reads a corrupt count as zero", () => {
    localStorage.setItem(GUEST_RUNS_KEY, "lots");
    expect(recordGuestEndlessRun()).toBe(false);
    expect(localStorage.getItem(GUEST_RUNS_KEY)).toBe("1");
  });
});

describe("third-run sign-in nudge", () => {
  it("shows after the third guest run, once, next to Sign in to save", async () => {
    await finishRun();
    expect(nudge()).toBeNull();
    expect(buttonByText("Sign in to save")).toBeTruthy();
    await finishRun();
    expect(nudge()).toBeNull();

    await finishRun();
    expect(nudge()?.textContent).toContain("Save your climbs");
    expect(buttonByText("Sign in to save")).toBeTruthy();
    await act(async () => buttonByText("Sign in")?.click());
    expect(onSignIn).toHaveBeenCalledTimes(1);

    await finishRun();
    expect(nudge()).toBeNull();
  });

  it("Not now closes it", async () => {
    for (let i = 0; i < GUEST_NUDGE_AFTER_RUNS; i++) await finishRun();
    expect(nudge()).not.toBeNull();
    await act(async () => buttonByText("Not now")?.click());
    expect(nudge()).toBeNull();
  });

  it("never counts an account's runs", async () => {
    auth.uid = "me";
    for (let i = 0; i < GUEST_NUDGE_AFTER_RUNS; i++) await finishRun();
    expect(nudge()).toBeNull();
    expect(localStorage.getItem(GUEST_RUNS_KEY)).toBeNull();
  });

  it("never counts a Daily run", async () => {
    for (let i = 0; i < GUEST_NUDGE_AFTER_RUNS; i++) await finishRun("/climb?daily=1");
    expect(nudge()).toBeNull();
    expect(localStorage.getItem(GUEST_RUNS_KEY)).toBeNull();
  });

  it("never counts outside the guest shell (no onSignIn)", async () => {
    for (let i = 0; i < GUEST_NUDGE_AFTER_RUNS; i++) await finishRun("/climb", false);
    expect(nudge()).toBeNull();
    expect(localStorage.getItem(GUEST_RUNS_KEY)).toBeNull();
  });
});
