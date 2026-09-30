/**
 * The result card's star chest opening (ChestOpening.tsx), rendered for real.
 * Haptics and the reduced-motion query are mocked; the shake and lid timers
 * run on fake timers so each phase can be checked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const haptics = vi.hoisted(() => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/lib/haptics", () => haptics);
const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduce }));

import { CHEST_CARD_STAGGER_MS, CHEST_LID_MS, CHEST_SHAKE_MS, CHEST_SPARKS, ChestReveal } from "../../mobile/src/components/levels/ChestOpening";
import { LevelResultCard } from "../../mobile/src/components/levels/LevelResultCard";
import type { LevelResult, OpenedChest } from "../../mobile/src/lib/levels/model";
import { POWER_UP_SPECS } from "../../src/game/powerups";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  motion.reduce = false;
  for (const f of Object.values(haptics)) f.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const THREE: OpenedChest[] = [
  { chestNumber: 4, boosters: ["giant", "jetpack"] },
  { chestNumber: 5, boosters: ["slow-lava"] },
  { chestNumber: 6, boosters: ["giant", "rapid-climb"] },
];

function render(chests: readonly OpenedChest[]) {
  act(() => root.render(createElement(ChestReveal, { chests })));
}

const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label,
  );

function click(label: string) {
  const el = button(label);
  if (!el) throw new Error(`no button "${label}"`);
  act(() => el.click());
}

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

/** The shake and the lid, start to finish (each phase schedules the next). */
const OPEN_MS = CHEST_SHAKE_MS + CHEST_LID_MS;
function openFully() {
  advance(CHEST_SHAKE_MS);
  advance(CHEST_LID_MS);
}

const phase = () => container.querySelector("[data-chest-phase]")?.getAttribute("data-chest-phase") ?? null;
const cards = (chest: number) =>
  [...container.querySelectorAll(`ul[aria-label="Boosters from chest ${chest}"] li`)].map((li) => li.textContent);
const allCardLists = () => container.querySelectorAll('ul[aria-label^="Boosters from chest "]');
const summary = () => [...container.querySelectorAll('ul[aria-label="Boosters from the chest"] li')].map((li) => li.textContent);
const status = () => container.querySelector('[role="status"]')?.textContent ?? null;

describe("star chest opening", () => {
  it("renders nothing when the clear opened no chest", () => {
    render([]);
    expect(container.innerHTML).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits closed and wobbling for a tap, with nothing revealed yet", () => {
    render([THREE[0]!]);
    expect(phase()).toBe("closed");
    expect(container.querySelector(".lc-wobble")).not.toBeNull();
    const chest = button("Open star chest");
    expect(chest?.textContent).toContain("Star chest!");
    expect(chest?.textContent).toContain("Tap to open");
    expect(allCardLists()).toHaveLength(0);
    expect(summary()).toEqual([]);
    expect(status()).toBe("");
    // A lone chest has no "1 of N" and never waits on a timer while closed.
    expect(container.textContent).not.toContain("1 of");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shakes, flies the lid open with sparks, then deals out that chest's boosters", () => {
    render([THREE[0]!]);
    click("Open star chest");
    expect(haptics.tapMedium).toHaveBeenCalledTimes(1);
    expect(phase()).toBe("shaking");
    expect(container.querySelector(".lc-shake")).not.toBeNull();
    expect(allCardLists()).toHaveLength(0);

    // The build-up: three beats, each shaking harder with a stronger haptic.
    const beat = () => container.querySelector("[data-chest-beat]")?.getAttribute("data-chest-beat");
    expect(beat()).toBe("1");
    expect(container.textContent).toContain("Something's inside…");
    advance(CHEST_SHAKE_MS / 3);
    expect(beat()).toBe("2");
    expect(haptics.tapMedium).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("It's waking up…");
    advance(CHEST_SHAKE_MS / 3);
    expect(beat()).toBe("3");
    expect(haptics.tapHeavy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Here it comes!");
    expect(haptics.notifySuccess).not.toHaveBeenCalled();

    advance(CHEST_SHAKE_MS / 3 - 1);
    expect(phase()).toBe("shaking");
    advance(1);
    expect(phase()).toBe("opening");
    expect(haptics.notifySuccess).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".lc-lid-fly")).not.toBeNull();
    expect(container.querySelectorAll(".lc-spark")).toHaveLength(CHEST_SPARKS);
    expect(container.querySelector(".lc-flash")).not.toBeNull();
    expect(container.querySelector(".lc-ring")).not.toBeNull();
    expect(allCardLists()).toHaveLength(0);

    advance(CHEST_LID_MS);
    expect(phase()).toBe("open");
    expect(container.querySelector(".lc-lid-open")).not.toBeNull();
    expect(container.querySelectorAll(".lc-spark, .lc-flash, .lc-ring")).toHaveLength(0);
    expect(cards(1)).toEqual(["Giant", "Jetpack"]);
    const lis = [...container.querySelectorAll<HTMLLIElement>('ul[aria-label="Boosters from chest 1"] li')];
    // Dealt face down and flipped one after another.
    expect(lis.map((li) => li.style.animationDelay)).toEqual(["0ms", `${CHEST_CARD_STAGGER_MS}ms`]);
    expect(lis.every((li) => li.querySelector(".lc-back"))).toBe(true);
    expect(lis[1]?.style.borderColor).toBe(POWER_UP_SPECS.jetpack.color);
    expect(status()).toBe("Chest opened: Giant, Jetpack");
    // See rewards ends it; a Skip beside it would do the same, so there is none.
    expect(button("See rewards")).toBeDefined();
    expect(button("Skip")).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens only the first of several chests on the first tap", () => {
    render(THREE);
    expect(container.textContent).toContain("1 of 3");
    click("Open star chest 1 of 3");
    openFully();
    expect(allCardLists()).toHaveLength(1);
    expect(cards(1)).toEqual(["Giant", "Jetpack"]);
    expect(container.textContent).not.toContain("Slow Lava");
    expect(container.textContent).not.toContain("Rapid Climb");
    expect(status()).toBe("Chest 1 of 3: Giant, Jetpack");
  });

  it("plays several chests in their order, then ends on the added-up summary", () => {
    render(THREE);
    click("Open star chest 1 of 3");
    openFully();

    click("Open chest 2 of 3");
    expect(phase()).toBe("shaking");
    expect(allCardLists()).toHaveLength(0);
    expect(container.textContent).toContain("2 of 3");
    openFully();
    expect(cards(2)).toEqual(["Slow Lava"]);
    expect(status()).toBe("Chest 2 of 3: Slow Lava");
    expect(button("Skip all")).toBeDefined();

    click("Open chest 3 of 3");
    openFully();
    expect(cards(3)).toEqual(["Giant", "Rapid Climb"]);
    expect(button("Open chest 4 of 3")).toBeUndefined();
    expect(button("Skip all")).toBeUndefined();

    click("See rewards");
    expect(phase()).toBeNull();
    expect(container.textContent).toContain("3 star chests opened!");
    expect(summary()).toEqual(["+2 Giant", "+1 Jetpack", "+1 Slow Lava", "+1 Rapid Climb"]);
    expect(container.textContent).toContain("Use these from a level’s start screen.");
    expect(status()).toBe("3 star chests opened! +2 Giant, +1 Jetpack, +1 Slow Lava, +1 Rapid Climb");
  });

  it("skips from a closed chest straight to the summary with every chest counted", () => {
    render(THREE);
    click("Skip all");
    expect(haptics.tapLight).toHaveBeenCalledTimes(1);
    expect(phase()).toBeNull();
    expect(allCardLists()).toHaveLength(0);
    expect(summary()).toEqual(["+2 Giant", "+1 Jetpack", "+1 Slow Lava", "+1 Rapid Climb"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips after some chests are open and still counts every chest, opened or not", () => {
    render(THREE);
    click("Open star chest 1 of 3");
    openFully();
    click("Open chest 2 of 3");
    openFully();
    expect(cards(2)).toEqual(["Slow Lava"]);
    click("Skip all");
    expect(phase()).toBeNull();
    expect(allCardLists()).toHaveLength(0);
    expect(summary()).toEqual(["+2 Giant", "+1 Jetpack", "+1 Slow Lava", "+1 Rapid Climb"]);
    expect(status()).toBe("3 star chests opened! +2 Giant, +1 Jetpack, +1 Slow Lava, +1 Rapid Climb");
  });

  it("skips mid-shake without the lid timer firing afterwards", () => {
    render(THREE);
    click("Open star chest 1 of 3");
    click("Skip all");
    expect(vi.getTimerCount()).toBe(0);
    advance(OPEN_MS);
    expect(phase()).toBeNull();
    expect(haptics.notifySuccess).not.toHaveBeenCalled();
    expect(summary()).toEqual(["+2 Giant", "+1 Jetpack", "+1 Slow Lava", "+1 Rapid Climb"]);
  });

  it("with reduced motion shows the opened chests and boosters at once, with nothing animating", () => {
    motion.reduce = true;
    render(THREE);
    expect(phase()).toBeNull();
    expect(button("Open star chest 1 of 3")).toBeUndefined();
    expect(container.querySelector(".lc-wobble, .lc-shake, .lc-lid-fly, .lc-spark, .lc-rays, .lc-card, .lc-mote, .lc-flash")).toBeNull();
    expect(summary()).toEqual(["+2 Giant", "+1 Jetpack", "+1 Slow Lava", "+1 Rapid Climb"]);
    expect(status()).toBe("3 star chests opened! +2 Giant, +1 Jetpack, +1 Slow Lava, +1 Rapid Climb");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fills the live region after it mounts, so the reduced-motion summary is announced", () => {
    motion.reduce = true;
    const seen = new MutationObserver(() => {});
    seen.observe(container, { childList: true, characterData: true, subtree: true });
    render(THREE);
    const records = seen.takeRecords();
    seen.disconnect();
    const live = container.querySelector('[role="status"]');
    expect(live?.textContent).toBe("3 star chests opened! +2 Giant, +1 Jetpack, +1 Slow Lava, +1 Rapid Climb");
    // A region inserted already holding its text is a single insert of the
    // whole reveal; the announcement must arrive as a change inside it.
    const inside = records.filter((r) => live !== null && (r.target === live || live.contains(r.target)));
    expect(records.length).toBeGreaterThan(0);
    expect(inside.length).toBeGreaterThan(0);
  });

  it("throws its sparks the same way every time, without Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const sparks = () =>
      [...container.querySelectorAll<HTMLElement>(".lc-spark")].map((s) => `${s.style.getPropertyValue("--dx")},${s.style.getPropertyValue("--dy")}`);
    render([THREE[1]!]);
    click("Open star chest");
    advance(CHEST_SHAKE_MS);
    const first = sparks();
    expect(first).toHaveLength(CHEST_SPARKS);
    expect(new Set(first).size).toBe(CHEST_SPARKS);
    act(() => root.unmount());
    root = createRoot(container);
    render([THREE[1]!]);
    click("Open star chest");
    advance(CHEST_SHAKE_MS);
    expect(sparks()).toEqual(first);
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps focus in the reveal when the tapped button goes away", () => {
    render(THREE);
    const chest = button("Open star chest 1 of 3");
    act(() => chest?.focus());
    click("Open star chest 1 of 3");
    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
  });
});

describe("on the result card", () => {
  const cardResult = (chestsOpened: OpenedChest[]): LevelResult => ({
    level: 7,
    cleared: true,
    stars: 3,
    previousStars: 0,
    timeMs: 20_000,
    outOfTime: false,
    pars: { twoStarMs: 36_000, threeStarMs: 28_000, oneStarMs: null },
    streak: null,
    atFrontier: false,
    failsAtLevel: 0,
    routeGhostAvailable: false,
    chestsOpened,
    boosters: null,
    goalFt: 267,
    peakFt: 267,
    xpGained: 160,
    newPlayerLevel: null,
    player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 200, playerLevel: 2, xpIntoLevel: 140, xpForNext: 153 },
  });
  const renderCard = (chestsOpened: OpenedChest[], onMap = () => {}) =>
    act(() =>
      root.render(
        createElement(LevelResultCard, {
          result: cardResult(chestsOpened),
          costsLife: true,
          hasNextLevel: true,
          retryBusy: false,
          onNext: () => {},
          onRetry: () => {},
          onMap,
          onPractice: () => {},
          onPracticeLevel: () => {},
        }),
      ),
    );

  it("never blocks the card's own buttons while a chest waits to be opened", () => {
    const onMap = vi.fn();
    renderCard([THREE[1]!], onMap);
    expect(phase()).toBe("closed");
    click("Map");
    expect(onMap).toHaveBeenCalledTimes(1);
    expect(button("Open star chest")).toBeDefined();
  });

  it("leads with Collect rewards, then folds the chest and puts Next level first", () => {
    const next = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Next level");
    renderCard([THREE[0]!]);
    click("Open star chest");
    openFully();
    click("See rewards");
    expect(summary()).toHaveLength(2);
    // Next level waits as a link under Collect rewards.
    expect(next()?.className).not.toContain("rounded-full");
    click("Collect rewards");
    expect(summary()).toEqual([]);
    expect(container.textContent).toContain("Added to your boosters:");
    expect(button("Collect rewards")).toBeUndefined();
    expect(next()?.className).toContain("rounded-full");
  });

  it("starts a later clear's chests closed again, even on the same card", () => {
    renderCard(THREE);
    click("Open star chest 1 of 3");
    openFully();
    click("Open chest 2 of 3");
    openFully();
    click("Open chest 3 of 3");
    openFully();
    click("See rewards");
    expect(summary()).toHaveLength(4);
    renderCard([{ chestNumber: 7, boosters: ["jetpack"] }]);
    expect(phase()).toBe("closed");
    expect(button("Open star chest")).toBeDefined();
    expect(summary()).toEqual([]);
  });
});
