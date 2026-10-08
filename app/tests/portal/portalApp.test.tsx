/**
 * The portal shell (mobile/src/portal/PortalApp.tsx) against fake platform and
 * ads adapters. The real PortalApp, PortalRun, HUD and overlays render; only
 * the game loop is scripted, so each test can move the run through menu,
 * countdown, climb and death and check what the host is told.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchPhase } from "../../src/game/types";
import type { AdOutcome, AdsAdapter, PlatformAdapter } from "../../mobile/src/targets/types";
import { RESULTS_INPUT_GUARD_MS } from "../../mobile/src/portal/PortalRun";
import { BEST_HEIGHT_KEY } from "../../mobile/src/portal/bestHeight";
import { PortalApp } from "../../mobile/src/portal/PortalApp";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const climb = vi.hoisted(() => ({
  phase: "lobby" as MatchPhase,
  peakY: 0,
  runId: 0,
  pausedArgs: [] as boolean[],
  rerender: new Set<() => void>(),
  start: (() => {}) as () => void,
}));

vi.mock("../../src/game/useClimb", async () => {
  const React = await import("react");
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  const tower = buildFreeTower();
  return {
    NO_TOUCH: { left: false, right: false, up: false, down: false, jump: false },
    useClimb: ({ paused }: { paused?: boolean }) => {
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        climb.rerender.add(force);
        return () => {
          climb.rerender.delete(force);
        };
      }, []);
      climb.pausedArgs.push(Boolean(paused));
      const state = createMatch({ seed: "portal-test", mode: "solo", tower, playerIds: ["you"] });
      state.phase = climb.phase;
      state.players[0].peakY = climb.peakY;
      state.players[0].y = climb.peakY;
      return {
        state,
        simRef: { current: state },
        renderFeed: undefined,
        start: () => climb.start(),
        finished: climb.phase === "finished" || climb.phase === "results",
        setTouch: () => {},
        runId: climb.runId,
        inputLog: [],
      };
    },
  };
});

function fakePlatform(saved: Record<string, string> = {}) {
  const store = new Map(Object.entries(saved));
  let pauseCb: ((p: boolean) => void) | null = null;
  const platform = {
    init: vi.fn(async () => {}),
    loadingStart: vi.fn(),
    loadingStop: vi.fn(),
    gameplayStart: vi.fn(),
    gameplayStop: vi.fn(),
    happyMoment: vi.fn(),
    loadData: vi.fn(async (k: string) => store.get(k) ?? null),
    saveData: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    isAudioAllowed: vi.fn(() => true),
    onAudioAllowedChange: vi.fn(() => () => {}),
    onPauseChange: vi.fn((cb: (p: boolean) => void) => {
      pauseCb = cb;
      return () => {
        pauseCb = null;
      };
    }),
  } satisfies PlatformAdapter;
  return { platform, store, pause: (p: boolean) => pauseCb?.(p) };
}

function fakeAds(enabled: boolean) {
  let settle: ((o: AdOutcome) => void) | null = null;
  let onStart: (() => void) | undefined;
  const ads = {
    enabled,
    midgame: vi.fn(
      (cb?: { onStart?(): void }) =>
        new Promise<AdOutcome>((resolve) => {
          onStart = cb?.onStart;
          settle = resolve;
        }),
    ),
    rewarded: vi.fn(async () => "unavailable" as const),
  } satisfies AdsAdapter;
  return { ads, settle: (o: AdOutcome) => settle?.(o), adStarted: () => onStart?.() };
}

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function setClimb(patch: Partial<Pick<typeof climb, "phase" | "peakY" | "runId">>) {
  Object.assign(climb, patch);
  await act(async () => {
    climb.rerender.forEach((f) => f());
  });
}

async function mount(platform: PlatformAdapter, ads: AdsAdapter) {
  await act(async () => {
    root.render(<PortalApp config={{ platform, ads }} />);
  });
  await flush();
}

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`no button "${name}" in: ${buttonNames().join(", ")}`);
  return found;
}

function buttonNames(): string[] {
  return [...container.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "");
}

async function click(name: string) {
  await act(async () => {
    button(name).click();
  });
}

/** Start from the menu: the scripted loop moves to the countdown with a new run id. */
async function startRun() {
  await click("Start");
  await setClimb({ phase: "countdown", runId: climb.runId + 1, peakY: 0 });
  await setClimb({ phase: "climb" });
}

async function die(peakY: number) {
  await setClimb({ phase: "results", peakY });
  await act(async () => {
    await new Promise((r) => setTimeout(r, RESULTS_INPUT_GUARD_MS + 50));
  });
}

beforeEach(() => {
  Object.assign(climb, { phase: "lobby", peakY: 0, runId: 0, pausedArgs: [] });
  climb.start = vi.fn();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("menu", () => {
  it("opens on one Start button (plus sound), no account prompts, and no gameplay yet", async () => {
    const { platform } = fakePlatform();
    await mount(platform, fakeAds(false).ads);
    expect(buttonNames()).toEqual(["Sound", "Start"]);
    expect(container.textContent).not.toMatch(/sign in|log in|guest|account/i);
    expect(platform.loadingStart).toHaveBeenCalledTimes(1);
    expect(platform.gameplayStart).not.toHaveBeenCalled();
    expect(platform.gameplayStop).not.toHaveBeenCalled();
  });

  it("shows the saved best", async () => {
    const { platform } = fakePlatform({ [BEST_HEIGHT_KEY]: "123.4" });
    await mount(platform, fakeAds(false).ads);
    expect(container.textContent).toContain("Best 123 ft");
  });
});

describe("gameplay signals", () => {
  it("Start begins a run: gameplayStart once; death: gameplayStop once", async () => {
    const { platform } = fakePlatform();
    await mount(platform, fakeAds(false).ads);
    await startRun();
    expect(climb.start).toHaveBeenCalledTimes(1);
    expect(platform.gameplayStart).toHaveBeenCalledTimes(1);
    expect(platform.gameplayStop).not.toHaveBeenCalled();
    await die(12);
    expect(platform.gameplayStop).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("12ft");
  });

  it("a host pause mid-run stops gameplay and the sim; resuming needs the player", async () => {
    const { platform, pause } = fakePlatform();
    await mount(platform, fakeAds(false).ads);
    await startRun();
    await act(async () => pause(true));
    expect(platform.gameplayStop).toHaveBeenCalledTimes(1);
    expect(climb.pausedArgs.at(-1)).toBe(true);
    // The player cannot resume over the host's own pause.
    expect(button("Resume").disabled).toBe(true);
    await click("Resume");
    expect(climb.pausedArgs.at(-1)).toBe(true);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", cancelable: true }));
    });
    expect(climb.pausedArgs.at(-1)).toBe(true);
    // P during the host's pause is ignored, so it cannot queue a resume for when the host lets go.
    await act(async () => pause(false));
    expect(climb.pausedArgs.at(-1)).toBe(true);
    expect(platform.gameplayStart).toHaveBeenCalledTimes(1);
    await click("Resume");
    expect(climb.pausedArgs.at(-1)).toBe(false);
    expect(platform.gameplayStart).toHaveBeenCalledTimes(2);
  });

  it("the Pause button gives up focus, so game keys work again after resuming", async () => {
    const { platform } = fakePlatform();
    await mount(platform, fakeAds(false).ads);
    await startRun();
    const pauseButton = button("Pause");
    await act(async () => {
      pauseButton.focus();
      pauseButton.click();
    });
    expect(climb.pausedArgs.at(-1)).toBe(true);
    expect(document.activeElement).not.toBe(pauseButton);
  });

  it("Escape is not bound: the settings panel stays open", async () => {
    const { platform } = fakePlatform();
    await mount(platform, fakeAds(false).ads);
    await startRun();
    await click("Game settings");
    expect(container.querySelector('[role="group"][aria-label="Game settings"]')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[role="group"][aria-label="Game settings"]')).not.toBeNull();
  });
});

describe("best height and happytime", () => {
  it("happyMoment only when a run beats the saved best", async () => {
    const { platform, store } = fakePlatform({ [BEST_HEIGHT_KEY]: "40" });
    await mount(platform, fakeAds(false).ads);
    await startRun();
    await die(52);
    expect(platform.happyMoment).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("New best");
    await flush();
    expect(store.get(BEST_HEIGHT_KEY)).toBe("52");

    await click("Play again");
    await setClimb({ phase: "countdown", runId: climb.runId + 1, peakY: 0 });
    await setClimb({ phase: "climb" });
    await die(30);
    expect(platform.happyMoment).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Best 52 ft");
  });

  it("no happyMoment on a device's first run", async () => {
    const { platform, store } = fakePlatform();
    await mount(platform, fakeAds(false).ads);
    await startRun();
    await die(52);
    expect(platform.happyMoment).not.toHaveBeenCalled();
    await flush();
    expect(store.get(BEST_HEIGHT_KEY)).toBe("52");
  });
});

describe("midgame ad break", () => {
  it("Play again requests a midgame, blocks input until it settles, then starts even on adError", async () => {
    const { platform } = fakePlatform();
    const { ads, settle, adStarted } = fakeAds(true);
    await mount(platform, ads);
    await startRun();
    await die(10);
    expect(ads.midgame).not.toHaveBeenCalled();
    await click("Play again");
    expect(ads.midgame).toHaveBeenCalledTimes(1);
    expect(climb.start).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-ad-break]")).not.toBeNull();
    expect(button("Play again").disabled).toBe(true);
    // A second press while the ad is up asks for nothing more.
    await click("Play again");
    expect(ads.midgame).toHaveBeenCalledTimes(1);
    await act(async () => adStarted());
    await act(async () => settle("error"));
    await flush();
    expect(climb.start).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-ad-break]")).toBeNull();
  });

  it("never requests an ad on Start or mid-run", async () => {
    const { platform } = fakePlatform();
    const { ads } = fakeAds(true);
    await mount(platform, ads);
    await startRun();
    await click("Pause");
    await click("Resume");
    expect(ads.midgame).not.toHaveBeenCalled();
  });

  it("a target without ads restarts straight away", async () => {
    const { platform } = fakePlatform();
    const { ads } = fakeAds(false);
    await mount(platform, ads);
    await startRun();
    await die(10);
    await click("Play again");
    await flush();
    expect(ads.midgame).not.toHaveBeenCalled();
    expect(climb.start).toHaveBeenCalledTimes(2);
  });
});
