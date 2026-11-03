/**
 * Ads placement A on the native ClimbScreen: the interstitial before Endless
 * "Play again" is asked for on every third press once the session is past
 * its first 3 minutes, input waits for it, and the run starts whatever the
 * ad did. The real ClimbScreen runs with the game loop stubbed to a finished
 * run (as in mobileGuestRunNudge.test.tsx).
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
  touchControlsInset: () => 0,
}));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: () => {}, announcement: null, unlockAudio: () => {} }),
}));
vi.mock("../../src/hooks/useCanvasSize", () => ({ useCanvasSize: () => ({ width: 390, height: 780 }) }));
vi.mock("../../src/hooks/useSafeAreaInsets", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { AppDataProvider } from "../../mobile/src/contexts/AppDataContext";
import { AdsProvider } from "../../mobile/src/contexts/AdsContext";
import { ClimbScreen } from "../../mobile/src/screens/ClimbScreen";
import { INTERSTITIAL_GRACE_MS } from "../../src/lib/adPacing";
import type { AdOutcome, AdsAdapter } from "../../mobile/src/targets/types";

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const T0 = 1_800_000_000_000;

beforeEach(() => {
  localStorage.clear();
  auth.uid = null;
  vi.spyOn(Date, "now").mockReturnValue(T0);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

async function mount(ads: AdsAdapter) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/climb"]}>
        <AppDataProvider>
          <AdsProvider ads={ads}>
            <Routes>
              <Route path="/climb" element={<ClimbScreen />} />
            </Routes>
          </AdsProvider>
        </AppDataProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

const playAgain = () =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Play again");

async function press() {
  await act(async () => {
    playAgain()!.click();
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

function fakeAds(outcome: AdOutcome = "finished"): AdsAdapter & { midgame: ReturnType<typeof vi.fn> } {
  return { enabled: true, midgame: vi.fn(async () => outcome), rewarded: vi.fn(async () => "unavailable" as const) };
}

describe("interstitial before Endless Play again", () => {
  it("asks for one ad on the third press after the first 3 minutes", async () => {
    const ads = fakeAds();
    await mount(ads);
    vi.mocked(Date.now).mockReturnValue(T0 + INTERSTITIAL_GRACE_MS);
    await press();
    await press();
    expect(ads.midgame).not.toHaveBeenCalled();
    await press();
    expect(ads.midgame).toHaveBeenCalledTimes(1);
    // The count starts again after an ad played.
    await press();
    await press();
    expect(ads.midgame).toHaveBeenCalledTimes(1);
  });

  it("shows nothing in the session's first 3 minutes", async () => {
    const ads = fakeAds();
    await mount(ads);
    for (let i = 0; i < 6; i++) await press();
    expect(ads.midgame).not.toHaveBeenCalled();
  });

  it("blocks Play again while the ad is up, then lets the run start", async () => {
    let finish: (o: AdOutcome) => void = () => {};
    const ads = fakeAds();
    ads.midgame.mockImplementationOnce(() => new Promise<AdOutcome>((r) => (finish = r)));
    await mount(ads);
    vi.mocked(Date.now).mockReturnValue(T0 + INTERSTITIAL_GRACE_MS);
    await press();
    await press();
    await press();
    const busy = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Ad break\u2026");
    expect(busy?.disabled).toBe(true);
    await act(async () => {
      finish("error");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(playAgain()?.disabled).toBe(false);
  });

  it("never asks when the target serves no ads", async () => {
    const ads = { ...fakeAds(), enabled: false };
    await mount(ads);
    vi.mocked(Date.now).mockReturnValue(T0 + INTERSTITIAL_GRACE_MS);
    for (let i = 0; i < 6; i++) await press();
    expect(ads.midgame).not.toHaveBeenCalled();
  });
});
