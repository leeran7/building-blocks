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

import { CHEST_LID_MS, CHEST_SHAKE_MS, ChestReveal } from "../../mobile/src/components/levels/ChestOpening";
import { LevelResultCard } from "../../mobile/src/components/levels/LevelResultCard";
import type { LevelResult, OpenedChest } from "../../mobile/src/lib/levels/model";
import type { NextStart } from "../../mobile/src/lib/levels/boosterPick";
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

    advance(CHEST_SHAKE_MS - 1);
    expect(phase()).toBe("shaking");
    advance(1);
    expect(phase()).toBe("opening");
    expect(haptics.notifySuccess).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".lc-lid-fly")).not.toBeNull();
    expect(container.querySelectorAll(".lc-spark")).toHaveLength(8);
    expect(allCardLists()).toHaveLength(0);

    advance(CHEST_LID_MS);
    expect(phase()).toBe("open");
    expect(container.querySelector(".lc-lid-open")).not.toBeNull();
    expect(container.querySelectorAll(".lc-spark")).toHaveLength(0);
    expect(cards(1)).toEqual(["Giant", "Jetpack"]);
    const lis = [...container.querySelectorAll<HTMLLIElement>('ul[aria-label="Boosters from chest 1"] li')];
    expect(lis.map((li) => li.style.animationDelay)).toEqual(["0ms", "160ms"]);
    expect(lis[1]?.style.borderColor).toBe(POWER_UP_SPECS.jetpack.color);
    expect(status()).toBe("Chest opened: Giant, Jetpack");
    // Collect ends it; a Skip beside it would do the same, so there is none.
    expect(button("Collect")).toBeDefined();
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

    click("Collect");
    expect(phase()).toBeNull();
    expect(container.textContent).toContain("3 star chests opened!");
    expect(summary()).toEqual(["+2 Giant", "+1 Jetpack", "+1 Slow Lava", "+1 Rapid Climb"]);
    expect(container.textContent).toContain("Spend them from any level’s start card.");
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
    expect(container.querySelector(".lc-wobble, .lc-shake, .lc-lid-fly, .lc-spark, .lc-rays, .lc-card")).toBeNull();
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
    expect(first).toHaveLength(8);
    expect(new Set(first).size).toBe(8);
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

  it("starts a later clear's chests closed again, even on the same card", () => {
    renderCard(THREE);
    click("Open star chest 1 of 3");
    openFully();
    click("Open chest 2 of 3");
    openFully();
    click("Open chest 3 of 3");
    openFully();
    click("Collect");
    expect(summary()).toHaveLength(4);
    renderCard([{ chestNumber: 7, boosters: ["jetpack"] }]);
    expect(phase()).toBe("closed");
    expect(button("Open star chest")).toBeDefined();
    expect(summary()).toEqual([]);
  });
});

describe("picking a received booster for the next level", () => {
  const result = (chestsOpened: OpenedChest[], cleared = true): LevelResult => ({
    level: 7,
    cleared,
    stars: cleared ? 3 : 0,
    previousStars: 0,
    timeMs: cleared ? 20_000 : null,
    outOfTime: false,
    pars: { twoStarMs: 36_000, threeStarMs: 28_000, oneStarMs: null },
    streak: null,
    atFrontier: false,
    failsAtLevel: 0,
    routeGhostAvailable: false,
    chestsOpened,
    boosters: null,
    goalFt: 267,
    peakFt: cleared ? 267 : 100,
    xpGained: cleared ? 160 : 0,
    newPlayerLevel: null,
    player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 200, playerLevel: 2, xpIntoLevel: 140, xpForNext: 153 },
  });
  // Level 8 allows rapid climb and sprint burst, not the giant or the jetpack.
  const L8: NextStart = { level: 8, allowed: ["rapid-climb", "sprint-burst"], freeType: null };
  const CHEST: OpenedChest[] = [{ chestNumber: 1, boosters: ["rapid-climb", "sprint-burst", "giant"] }];

  function renderCard(opts: { chests?: OpenedChest[]; nextStart?: NextStart | null; hasNextLevel?: boolean; onNext?: (b: unknown) => void; cleared?: boolean } = {}) {
    act(() =>
      root.render(
        createElement(LevelResultCard, {
          result: result(opts.chests ?? CHEST, opts.cleared ?? true),
          costsLife: true,
          hasNextLevel: opts.hasNextLevel ?? true,
          nextStart: opts.nextStart === undefined ? L8 : opts.nextStart,
          retryBusy: false,
          onNext: opts.onNext ?? (() => {}),
          onRetry: () => {},
          onMap: () => {},
          onPractice: () => {},
          onPracticeLevel: () => {},
        }),
      ),
    );
  }

  /** The summary's toggles by power-up label, and the pick line. */
  const toggle = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('ul[aria-label="Boosters from the chest"] button[aria-pressed]')].find((b) =>
      b.textContent?.includes(label),
    );
  const pressed = () =>
    [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed='true']")].map((b) => b.textContent);
  const pickLine = () => container.querySelector("[aria-live='polite']")?.textContent ?? null;

  it("equips one received booster at a time: tap to equip, tap another to switch, tap again to clear", () => {
    renderCard();
    click("Skip");
    const rapid = toggle("Rapid Climb");
    const sprint = toggle("Sprint Burst");
    expect(rapid?.getAttribute("aria-pressed")).toBe("false");
    expect(pickLine()).toBe("Use one on your next level: tap it to equip for level 8.");

    act(() => rapid?.click());
    expect(pressed()).toEqual(["+1 Rapid Climb"]);
    expect(pickLine()).toBe("Rapid Climb ready for level 8. Tap it again to save it for later.");
    // The tapped button stays put: focus is not lost.
    expect(toggle("Rapid Climb")).toBe(rapid);

    act(() => sprint?.click());
    expect(pressed()).toEqual(["+1 Sprint Burst"]);
    act(() => sprint?.click());
    expect(pressed()).toEqual([]);
    expect(pickLine()).toBe("Use one on your next level: tap it to equip for level 8.");
    for (const b of [rapid, sprint]) expect(b?.className).toContain("min-h-[44px]");
  });

  it("shows a booster the next level does not allow, disabled with the reason", () => {
    renderCard();
    click("Skip");
    const giant = toggle("Giant");
    expect(giant?.disabled).toBe(true);
    expect(giant?.getAttribute("aria-pressed")).toBe("false");
    expect(giant?.textContent).toContain("Unlocks on a later level");
    expect(giant?.getAttribute("aria-label")).toBe("+1 Giant, unlocks on a later level");
    act(() => giant?.click());
    expect(pressed()).toEqual([]);
  });

  it("disables the type the next level already starts with free", () => {
    renderCard({ nextStart: { ...L8, freeType: "rapid-climb" } });
    click("Skip");
    expect(toggle("Rapid Climb")?.disabled).toBe(true);
    expect(toggle("Rapid Climb")?.textContent).toContain("Free on level 8");
    expect(toggle("Sprint Burst")?.disabled).toBe(false);
  });

  it("hands the pick to Next level, and null when none is equipped", () => {
    const onNext = vi.fn();
    renderCard({ onNext });
    click("Skip");
    act(() => toggle("Sprint Burst")?.click());
    click("Next level");
    expect(onNext).toHaveBeenLastCalledWith("sprint-burst");
    act(() => toggle("Sprint Burst")?.click());
    click("Next level");
    expect(onNext).toHaveBeenLastCalledWith(null);
  });

  it("can equip straight from an opened chest's cards, the same pick as the summary", () => {
    renderCard();
    click("Open star chest");
    openFully();
    const card = [...container.querySelectorAll<HTMLButtonElement>('ul[aria-label="Boosters from chest 1"] button[aria-pressed]')];
    expect(card.map((b) => b.disabled)).toEqual([false, false, true]);
    act(() => card[0]?.click());
    expect(card[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(pickLine()).toBe("Rapid Climb ready for level 8. Tap it again to save it for later.");
    click("Collect");
    expect(toggle("Rapid Climb")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("offers no choice when there is no next level", () => {
    for (const opts of [{ nextStart: null }, { hasNextLevel: false }]) {
      renderCard(opts);
      click("Skip");
      expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
      expect(summary()).toEqual(["+1 Rapid Climb", "+1 Sprint Burst", "+1 Giant"]);
      expect(container.textContent).toContain("Spend them from any level’s start card.");
      act(() => root.unmount());
      root = createRoot(container);
    }
  });

  it("with reduced motion the summary's pick works at once", () => {
    motion.reduce = true;
    renderCard();
    act(() => toggle("Rapid Climb")?.click());
    expect(pressed()).toEqual(["+1 Rapid Climb"]);
  });
});
