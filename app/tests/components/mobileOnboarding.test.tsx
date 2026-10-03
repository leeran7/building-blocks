/**
 * The first-run tutorial on mobile: a new player's first map opens the
 * training climb, the climb's goals advance on the player's own input, and
 * it ends on the map's tour, which ends on the next level's card. It is
 * offered once per device, never to a player who has cleared a level, and
 * replays from Profile.
 *
 * @vitest-environment happy-dom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/contexts/AppDataContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../mobile/src/contexts/AppDataContext")>();
  return { ...real, useSettings: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }) };
});
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
// The canvas painter needs a real 2D context; the training's engine still runs.
vi.mock("@app/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { TrainingScreen } from "../../mobile/src/screens/TrainingScreen";
import { BottomNav } from "../../mobile/src/components/BottomNav";
import { MAP_TOUR } from "../../mobile/src/components/onboarding/mapTour";
import {
  markOnboardingDone,
  needsOnboarding,
  onboardingDone,
  resetOnboardingForTests,
  wantsTour,
  TOUR_STATE,
} from "../../mobile/src/lib/onboarding";
import { unseenTutorials } from "../../mobile/src/lib/levels/tutorialSeen";
import { TICK_HZ } from "../../src/game/types";

let container: HTMLDivElement;
let root: Root;
let where = "";
const realRect = Element.prototype.getBoundingClientRect;

function Where() {
  const loc = useLocation();
  useEffect(() => {
    where = loc.pathname;
  }, [loc]);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  resetOnboardingForTests();
  where = "";
  // happy-dom lays nothing out: give tour targets a box so they can be spotlit.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.hasAttribute("data-tour")) return { top: 100, left: 20, width: 80, height: 40, right: 100, bottom: 140, x: 20, y: 100, toJSON: () => ({}) } as DOMRect;
    return realRect.call(this);
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Element.prototype.getBoundingClientRect = realRect;
  vi.useRealTimers();
});

function memoryClient(): LevelsClient {
  let stored: string | null = null;
  return createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(client: LevelsClient, path: string, { nav = true }: { nav?: boolean } = {}) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <LevelsProvider client={client}>
          <Where />
          <Routes>
            <Route path="/" element={<LevelMapScreen />} />
            <Route path="/tutorial" element={<TrainingScreen />} />
          </Routes>
          {nav && <BottomNav />}
        </LevelsProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
const tour = () => document.querySelector<HTMLElement>("[data-app-tour]");
const tourTitle = () => tour()?.querySelector("h2")?.textContent;

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("onboarding flag", () => {
  it("is needed on a fresh device at level 1 only, and once", () => {
    expect(onboardingDone()).toBe(false);
    expect(needsOnboarding(1)).toBe(true);
    expect(needsOnboarding(2)).toBe(false);
    markOnboardingDone();
    expect(onboardingDone()).toBe(true);
    expect(needsOnboarding(1)).toBe(false);
  });

  it("stays done for this launch when storage refuses the write", () => {
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      markOnboardingDone();
      expect(localStorage.getItem("doomstack:onboarding-done")).toBeNull();
      expect(needsOnboarding(1)).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it("reads the tour request from router state, and nothing else", () => {
    expect(wantsTour(TOUR_STATE)).toBe(true);
    expect(wantsTour({ tour: "yes" })).toBe(false);
    expect(wantsTour({ openLevel: 1 })).toBe(false);
    expect(wantsTour(null)).toBe(false);
    expect(wantsTour("tour")).toBe(false);
  });
});

describe("first launch", () => {
  it("opens the training from a new player's first map", async () => {
    await render(memoryClient(), "/");
    expect(where).toBe("/tutorial");
    expect(container.textContent).toContain("Outclimb the lava");
  });

  it("Back out of the training lands on the map, not straight back in", async () => {
    const client = memoryClient();
    await render(client, "/");
    expect(where).toBe("/tutorial");
    // Android back from a first entry replaces it with the map.
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(client, "/");
    expect(where).toBe("/");
    expect(onboardingDone()).toBe(false);
    // Next launch offers it again.
    resetOnboardingForTests();
    expect(needsOnboarding(1)).toBe(true);
  });

  it("stays on the map once the tutorial is done on this device", async () => {
    markOnboardingDone();
    await render(memoryClient(), "/");
    expect(where).toBe("/");
    expect(tour()).toBeNull();
  });

  it("never sends a player who has cleared a level to the training", async () => {
    const client = memoryClient();
    const s = await client.startLevel(1);
    if (!s.ok) throw new Error("refused");
    await client.submitResult(s.ticket.id, {
      finished: true,
      level: 1,
      finishedTick: 3 * TICK_HZ,
      raceTicks: 3 * TICK_HZ,
      peakFt: s.ticket.goalFt,
      replayToken: null,
      outOfTime: false,
    });
    await render(client, "/");
    expect(where).toBe("/");
    expect(onboardingDone()).toBe(false);
  });
});

describe("training climb", () => {
  it("moves to the next goal when the player does what it asks", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    await render(memoryClient(), "/tutorial");
    await click(button("Start training"));
    const goal = () => container.querySelector("[data-training-goal]")?.getAttribute("data-training-goal");
    expect(goal()).toBe("walk");

    const run = async (frames: number) => {
      for (let i = 0; i < frames; i++) {
        await act(async () => {
          vi.advanceTimersByTime(16);
        });
      }
    };
    // Standing still meets nothing.
    await run(60);
    expect(goal()).toBe("walk");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    await run(90);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    });
    expect(goal()).toBe("jump");
    expect(container.textContent).toContain("Walk.");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    await run(10);
    expect(goal()).toBe("climb");
  });

  it("Skip goes to the map tour, which ends on the next level's card", async () => {
    await render(memoryClient(), "/tutorial");
    await click(button("Skip tutorial"));
    expect(where).toBe("/");
    expect(onboardingDone()).toBe(true);
    expect(tourTitle()).toBe(MAP_TOUR[0].title);

    const seen: string[] = [];
    for (let i = 0; i < MAP_TOUR.length; i++) {
      seen.push(tourTitle() ?? "");
      const last = i === MAP_TOUR.length - 1;
      await click(button(last ? "Play level 1" : "Next"));
    }
    expect(seen).toEqual(MAP_TOUR.map((s) => s.title));
    expect(tour()).toBeNull();
    // The level 1 start card is open.
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Level 1");
    // The basics demo still plays before level 1: training was skipped.
    expect(unseenTutorials(["basics"])).toEqual(["basics"]);
  });

  it("the tour skips what is not on screen", async () => {
    markOnboardingDone();
    await render(memoryClient(), "/tutorial", { nav: false });
    await click(button("Skip tutorial"));
    const titles: string[] = [];
    for (let i = 0; tour() && i < MAP_TOUR.length; i++) {
      titles.push(tourTitle() ?? "");
      await click(button("Next") ?? button("Play level 1"));
    }
    expect(tour()).toBeNull();
    // No tab bar here: the tour stops after the map's own readouts.
    expect(titles).not.toContain("Shop");
    expect(titles).toContain("Endless");
    // It ran out on its own, so it opens nothing the player did not ask for.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves on when the spotlit element leaves the screen mid-step", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    await render(memoryClient(), "/tutorial");
    await click(button("Skip tutorial"));
    expect(tourTitle()).toBe(MAP_TOUR[0].title);
    // The first step's pin goes away (no box): the tour moves to the next step.
    document.querySelector(`[data-tour="${MAP_TOUR[0].target}"]`)?.removeAttribute("data-tour");
    await act(async () => {
      vi.advanceTimersByTime(32);
    });
    expect(tourTitle()).toBe(MAP_TOUR[1].title);
  });

  it("Skip tour closes it without opening a level", async () => {
    await render(memoryClient(), "/tutorial");
    await click(button("Skip tutorial"));
    await click(button("Skip tour"));
    expect(tour()).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(where).toBe("/");
  });
});
