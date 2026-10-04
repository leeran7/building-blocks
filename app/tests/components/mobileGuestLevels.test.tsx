/**
 * Guest mode's levels taster (Leeran, 2026-10-04): guests play levels 1 to
 * GUEST_LEVEL_CAP on the device-local store, every level above it asks them
 * to sign in, and the guest LevelsProvider never builds the server client.
 * Guests get the training climb on their own flag, never the account's.
 * Guest home is the same level map as an account's Play screen.
 *
 * The real GuestShell, level map, start card, play screen and result card
 * run; only the climb itself (LevelRun) and Endless (ClimbScreen) are stubs.
 *
 * @vitest-environment happy-dom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
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
vi.mock("../../mobile/src/screens/ClimbScreen", () => ({ ClimbScreen: () => <p>practice climb</p> }));
vi.mock("../../mobile/src/components/AnimatedBackdrop", () => ({ AnimatedBackdrop: () => null }));
vi.mock("@app/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("@app/components/Game/lava", () => ({ drawLava: vi.fn(), isLavaInProximity: () => false }));

// Spy on the server client's constructor, keeping the real one.
const http = vi.hoisted(() => ({ created: 0 }));
vi.mock("../../mobile/src/lib/levels/httpClient", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../mobile/src/lib/levels/httpClient")>();
  return {
    ...real,
    createHttpLevelsClient: (...args: Parameters<typeof real.createHttpLevelsClient>) => {
      http.created += 1;
      return real.createHttpLevelsClient(...args);
    },
  };
});

/** The climb stands in as a button that ends the run cleared, through onEnd. */
vi.mock("../../mobile/src/components/levels/LevelRun", async () => {
  const { createElement: h } = await import("react");
  return {
    LevelRun: (props: { level: number; goalFt: number; onEnd: (r: LevelRunReport) => void }) =>
      h(
        "button",
        {
          onClick: () =>
            props.onEnd({ level: props.level, finished: true, finishedTick: 30, raceTicks: 30, peakFt: props.goalFt, replayToken: null, outOfTime: false }),
        },
        "stub-clear",
      ),
  };
});

import { GuestShell } from "../../mobile/src/components/GuestShell";
import { LevelsProvider, useLevels } from "../../mobile/src/contexts/LevelsContext";
import { createGuestLevelsClient, GUEST_LEVEL_CAP, isGuestLocked } from "../../mobile/src/lib/levels/guestClient";
import type { LevelRunReport } from "../../mobile/src/lib/levels/model";
import { markTutorialsSeen } from "../../mobile/src/lib/levels/tutorialSeen";
import {
  accountOnboarding,
  GUEST_ONBOARDING_KEY,
  guestOnboarding,
  ONBOARDING_KEY,
  resetOnboardingForTests,
} from "../../mobile/src/lib/onboarding";
import { GUEST_MAP_TOUR, MAP_TOUR } from "../../mobile/src/components/onboarding/mapTour";
import { POWER_UP_TYPES } from "../../src/game/powerups";
import { TICK_HZ } from "../../src/game/types";

let container: HTMLDivElement;
let root: Root;
let pathname = "";
const realRect = Element.prototype.getBoundingClientRect;

function Where() {
  const loc = useLocation();
  useEffect(() => {
    pathname = loc.pathname;
  }, [loc]);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  resetOnboardingForTests();
  http.created = 0;
  pathname = "";
  // The level tutorials have their own tests (mobileLevelTutorial.test.tsx).
  markTutorialsSeen(["basics", ...POWER_UP_TYPES]);
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
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
  });
}

async function renderGuest(path: string | { pathname: string; state: unknown }, onSignIn = vi.fn()) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <GuestShell onSignIn={onSignIn} />
      </MemoryRouter>,
    );
  });
  await flush();
  return onSignIn;
}

/** Clears levels 1..upTo in the guest's device store (the one GuestShell reads). */
async function clearGuestLevels(upTo: number) {
  const client = createGuestLevelsClient();
  for (let n = 1; n <= upTo; n++) {
    const s = await client.startLevel(n);
    if (!s.ok) throw new Error(`level ${n} refused: ${s.code}`);
    await client.submitResult(s.ticket.id, {
      finished: true,
      level: n,
      finishedTick: 3 * TICK_HZ,
      raceTicks: 3 * TICK_HZ,
      peakFt: s.ticket.goalFt,
      replayToken: null,
      outOfTime: false,
    });
  }
}

const byLabel = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );
const pin = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("ol button")].find((b) => b.getAttribute("aria-label") === label);
const signInSheet = () => document.body.querySelector<HTMLElement>("[data-guest-sign-in]");
const tour = () => document.querySelector<HTMLElement>("[data-app-tour]");

async function click(el: HTMLElement | undefined | null) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("guest level client", () => {
  it("caps guests at level 3 with one exported constant", () => {
    expect(GUEST_LEVEL_CAP).toBe(3);
    expect(isGuestLocked(GUEST_LEVEL_CAP)).toBe(false);
    expect(isGuestLocked(GUEST_LEVEL_CAP + 1)).toBe(true);
  });

  it("refuses level 4 even once level 3 is cleared", async () => {
    await clearGuestLevels(GUEST_LEVEL_CAP);
    const client = createGuestLevelsClient();
    expect((await client.getSeason()).frontier).toBe(GUEST_LEVEL_CAP + 1);
    expect(await client.startLevel(GUEST_LEVEL_CAP + 1)).toEqual({ ok: false, code: "LOCKED" });
    // Practice level 3 again: still playable.
    expect((await client.startLevel(GUEST_LEVEL_CAP)).ok).toBe(true);
  });

  it("keeps progress in the device's anon store and sells no lives", async () => {
    await clearGuestLevels(1);
    expect(localStorage.getItem("doomstack:levels:mock:v1:anon")).not.toBeNull();
    expect(createGuestLevelsClient().buyLives).toBeUndefined();
  });
});

describe("guest levels provider", () => {
  function SeasonProbe() {
    const { season } = useLevels();
    return <output data-frontier>{season ? String(season.frontier) : "none"}</output>;
  }
  const frontier = () => document.body.querySelector("[data-frontier]")?.textContent;

  it("loads the guest's device season with no account and never builds the server client", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await act(async () => {
        root.render(
          <LevelsProvider guest>
            <SeasonProbe />
          </LevelsProvider>,
        );
      });
      await flush();
      expect(frontier()).toBe("1");
      expect(http.created).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("(control) the account provider builds the server client, and clears the season with no account", async () => {
    await act(async () => {
      root.render(
        <LevelsProvider>
          <SeasonProbe />
        </LevelsProvider>,
      );
    });
    await flush();
    expect(http.created).toBe(1);
    expect(frontier()).toBe("none");
  });

  it("the full guest shell never builds the server client either", async () => {
    guestOnboarding.markDone();
    await renderGuest("/");
    expect(pin("Level 1, next to play")).toBeTruthy();
    expect(http.created).toBe(0);
  });
});

describe("guest home", () => {
  it("is the Play screen: the level map with Play, Endless and Sign In", async () => {
    guestOnboarding.markDone();
    await renderGuest("/");
    expect(pin("Level 1, next to play")).toBeTruthy();
    expect(byLabel("Open level 1")).toBeTruthy();
    expect(document.body.querySelector('[data-tour="lives"]')).not.toBeNull();
    await click(byLabel("Endless, climb as high as you can"));
    expect(pathname).toBe("/climb");
    expect(document.body.textContent).toContain("practice climb");
  });

  it("leaves out what needs an account instead of showing it locked", async () => {
    guestOnboarding.markDone();
    await renderGuest("/");
    for (const target of ["chest", "gems", "modes"]) {
      expect(document.body.querySelector(`[data-tour="${target}"]`)).toBeNull();
    }
    expect(document.body.querySelector("[data-tour^=\"tab-\"]")).toBeNull();
    // The old landing page and its way back are gone.
    expect(document.body.textContent).not.toContain("guest mode");
    expect(byLabel("Back to guest home")).toBeUndefined();
  });

  it("Sign In on the map leaves guest mode", async () => {
    guestOnboarding.markDone();
    const onSignIn = await renderGuest("/");
    await click(byLabel("Sign In"));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("the old /levels taster path lands on home", async () => {
    guestOnboarding.markDone();
    await renderGuest("/levels");
    expect(pathname).toBe("/");
    expect(pin("Level 1, next to play")).toBeTruthy();
  });
});

describe("guest levels taster", () => {
  beforeEach(() => {
    guestOnboarding.markDone();
  });

  it("opens levels 1 to 3 and locks every level above them behind sign-in", async () => {
    await clearGuestLevels(2);
    const onSignIn = await renderGuest("/");

    // 1 and 2 cleared, 3 is next: each opens its start card.
    for (const label of ["Level 1, 3 of 3 stars", "Level 2, 3 of 3 stars", "Level 3, next to play"]) {
      await click(pin(label));
      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain(label.split(",")[0]);
      expect(signInSheet()).toBeNull();
      await click(byLabel("Close"));
    }
    // No friends board or star chest for a guest.
    expect(document.body.querySelector('[data-tour="chest"]')).toBeNull();
    await click(pin("Level 3, next to play"));
    expect(document.body.textContent).not.toContain("Friends");
    await click(byLabel("Close"));

    const locked = pin("Level 4, sign in to unlock");
    expect(locked?.disabled).toBe(false);
    await click(locked);
    expect(signInSheet()?.textContent).toContain("Unlock all 300 levels");
    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).not.toBe("Level 4");
    await click(byLabel("Sign in"));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("clearing level 3 and pressing Next level asks the guest to sign in", async () => {
    await clearGuestLevels(2);
    await renderGuest("/");
    await click(pin("Level 3, next to play"));
    await click(byLabel("Play level 3"));
    expect(pathname).toBe("/levels/3/play");
    await click(byLabel("stub-clear"));
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Level 3 cleared, 3 of 3 stars");

    await click(byLabel("Next level"));
    expect(pathname).toBe("/");
    expect(signInSheet()?.textContent).toContain("Unlock all 300 levels");
    // No level 4 start card behind it.
    expect(byLabel("Play level 4")).toBeUndefined();
    await click(byLabel("Not now"));
    expect(signInSheet()).toBeNull();
  });

  it("the Play bar at level 4 asks the guest to sign in", async () => {
    await clearGuestLevels(GUEST_LEVEL_CAP);
    await renderGuest("/");
    await click(byLabel("Sign in to play level 4"));
    expect(signInSheet()).not.toBeNull();
    expect(byLabel("Play level 4")).toBeUndefined();
    // Levels 1-3 really are done here, so the sheet may say so.
    expect(signInSheet()?.textContent).toContain(`Levels 1–${GUEST_LEVEL_CAP} done`);
  });

  it("a fresh guest tapping the level 4 pin is not told levels 1-3 are done", async () => {
    await renderGuest("/");
    await click(pin("Level 4, sign in to unlock"));
    const text = signInSheet()?.textContent ?? "";
    expect(text).toContain("Unlock all 300 levels");
    expect(text).toContain(`Levels 1–${GUEST_LEVEL_CAP} are free`);
    expect(text).not.toContain("done");
  });

  it("a level link above the cap lands on the taster map, not on the level", async () => {
    await renderGuest("/levels/4/play");
    expect(pathname).toBe("/");
    expect(byLabel("stub-clear")).toBeUndefined();
  });

  it("Practice above the cap does not play: it lands on the map's sign-in prompt", async () => {
    await clearGuestLevels(GUEST_LEVEL_CAP);
    await renderGuest("/levels/4/play?practice=1");
    expect(pathname).toBe("/");
    expect(byLabel("stub-clear")).toBeUndefined();
    expect(signInSheet()).not.toBeNull();
  });

  it("(control) Practice of level 3 still plays for a guest", async () => {
    await clearGuestLevels(GUEST_LEVEL_CAP);
    await renderGuest("/levels/3/play?practice=1");
    expect(pathname).toBe("/levels/3/play");
    expect(byLabel("stub-clear")).toBeTruthy();
    expect(signInSheet()).toBeNull();
  });
});

describe("guest training", () => {
  it("a new guest trains on the guest flag first, then tours the map without tabs", async () => {
    await renderGuest("/");
    expect(pathname).toBe("/tutorial");
    await click(byLabel("Skip tutorial"));

    expect(pathname).toBe("/");
    expect(localStorage.getItem(GUEST_ONBOARDING_KEY)).toBe("1");
    // The account's flag is untouched: signing in later still runs its tour.
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull();
    expect(accountOnboarding.needs(1)).toBe(true);

    const titles: string[] = [];
    for (let i = 0; tour() && i < MAP_TOUR.length; i++) {
      titles.push(tour()?.querySelector("h2")?.textContent ?? "");
      await click(byLabel("Next") ?? byLabel("Play level 1"));
    }
    expect(titles).toEqual(GUEST_MAP_TOUR.map((s) => s.title));
    expect(titles).not.toContain("Star chest");
    expect(titles).not.toContain("Gems");
    expect(titles).not.toContain("Shop");
    // The account tour has a Modes step for the map's mode rail; a guest has no rail.
    expect(MAP_TOUR.map((s) => s.title)).toContain("Modes");
    expect(titles).not.toContain("Modes");
    // The tour's last button opens level 1.
    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe("Level 1");
  });

  it("is offered once: the next visit opens on the map", async () => {
    await renderGuest("/");
    expect(pathname).toBe("/tutorial");
    await click(byLabel("Skip tutorial"));
    expect(guestOnboarding.done()).toBe(true);

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderGuest("/");
    expect(pathname).toBe("/");
    await click(byLabel("Endless, climb as high as you can"));
    expect(pathname).toBe("/climb");
  });

  it("(control) an account's training does set the account flag", async () => {
    // Positive fixture for the guard above: the same screen outside the
    // guest shell writes the account flag, so its absence means something.
    const { TrainingScreen } = await import("../../mobile/src/screens/TrainingScreen");
    const { Routes, Route } = await import("react-router-dom");
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/tutorial"]}>
          <Where />
          <Routes>
            <Route path="/tutorial" element={<TrainingScreen />} />
            <Route path="/" element={<p>map</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flush();
    await click(byLabel("Skip tutorial"));
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe("1");
    expect(localStorage.getItem(GUEST_ONBOARDING_KEY)).toBeNull();
  });
});
