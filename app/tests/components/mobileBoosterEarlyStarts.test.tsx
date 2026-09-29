/**
 * The early-level start filter (#205: no super jump or jetpack at GO through
 * EARLY_START_LAST_LEVEL) meets the booster pick (a chest pick carried into
 * the next level's start card, a free power-up AND a booster at GO). Each
 * seam is tested on a level whose raw allowed set DOES include the late
 * booster (L11+ allows super jump), so only startBoosterTypes keeps it out,
 * and against a positive control after level 45 where it is let through.
 *
 * Rendered for real on the device-local level store (mockClient).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("@app/components/Game/lava", () => ({ drawLava: vi.fn(), isLavaInProximity: () => false }));
// The run itself is not under test here: only what the start card hands it.
vi.mock("../../mobile/src/components/levels/LevelRun", () => ({ LevelRun: () => null }));

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import { nextStartAfter } from "../../mobile/src/lib/levels/boosterPick";
import type { BuyLivesResult, LevelResult, LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { LevelResultCard } from "../../mobile/src/components/levels/LevelResultCard";
import { EARLY_START_LAST_LEVEL } from "../../src/levels/engagement";
import { TICK_HZ } from "../../src/game/types";
import { POWER_UP_TYPES } from "../../src/game/powerups";
import { markTutorialsSeen } from "../../mobile/src/lib/levels/tutorialSeen";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  markTutorialsSeen(["basics", ...POWER_UP_TYPES]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A device store in memory with a clock that can refill lives. */
function memoryStore() {
  let stored: string | null = null;
  let t = Date.parse("2026-09-29T12:00:00Z");
  const opts = { load: () => stored, save: (raw: string) => void (stored = raw), now: () => t };
  return {
    client: createMockLevelsClient(opts),
    /** Opens the store again with a set inventory (a new session). */
    reopen(boosters: Record<string, number>): LevelsClient {
      stored = JSON.stringify({ ...(JSON.parse(stored ?? "{}") as object), boosters });
      return createMockLevelsClient(opts);
    },
    /** A day later: lives are full again. */
    later() {
      t += 24 * 60 * 60 * 1000;
    },
  };
}

/** First clears 1..upTo in a row, letting the clock refill lives as it goes. */
async function clearLevels(store: ReturnType<typeof memoryStore>, upTo: number) {
  for (let n = 1; n <= upTo; n++) {
    store.later();
    const s = await store.client.startLevel(n);
    if (!s.ok) throw new Error(`L${n} refused: ${s.code}`);
    await store.client.submitResult(s.ticket.id, {
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderMap(client: LevelsClient, state: unknown) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: "/", state }]}>
        <LevelsProvider client={client}>
          <Routes>
            <Route path="/" element={<LevelMapScreen />} />
            <Route path="/levels/:level/play" element={<p>playing</p>} />
          </Routes>
        </LevelsProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

const dialogTitle = () => container.querySelector('[role="dialog"] h2')?.textContent ?? null;
const chips = () => [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')];
const pressed = () => chips().filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("aria-label"));
const chipLabels = () => chips().map((b) => b.getAttribute("aria-label"));
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label);

describe("the mock client honours the early-level start filter", () => {
  it("refuses a super jump booster on an early level that allows super jump, and plays it after level 45", async () => {
    const store = memoryStore();
    await clearLevels(store, 46);
    const client = store.reopen({ "super-jump": 2 });
    const season = await client.getSeason();
    // The fixture: L11 is early yet its raw allowed set has super jump.
    expect(season.levels[10].allowedPowerUps).toContain("super-jump");
    expect(11).toBeLessThanOrEqual(EARLY_START_LAST_LEVEL);

    store.later();
    expect(await client.startLevel(11, { booster: "super-jump" })).toEqual({ ok: false, code: "BOOSTER_UNAVAILABLE" });
    expect((await client.getSeason()).boosters["super-jump"]).toBe(2);

    store.later();
    const late = await client.startLevel(46, { booster: "super-jump" });
    if (!late.ok) throw new Error(`L46 refused: ${late.code}`);
    expect(late.ticket.startPowerUps).toEqual([{ type: "super-jump", source: "booster" }]);
    expect((await client.getSeason()).boosters["super-jump"]).toBe(1);
  });

  it("never starts an early frontier run with a free super jump, even on a long streak", async () => {
    const early = memoryStore();
    await clearLevels(early, 11);
    early.later();
    const s12 = await early.client.startLevel(12);
    if (!s12.ok) throw new Error("L12 refused");
    // Streak 11 would earn a super jump; the early filter leaves rapid climb.
    expect(s12.ticket.startPowerUps).toEqual([{ type: "rapid-climb", source: "streak" }]);

    const late = memoryStore();
    await clearLevels(late, 46);
    late.later();
    const s47 = await late.reopen({ "rapid-climb": 1 }).startLevel(47, { booster: "rapid-climb" });
    if (!s47.ok) throw new Error("L47 refused");
    // Positive control: past L45 the streak's super jump applies, and the booster joins it.
    expect(s47.ticket.startPowerUps).toEqual([
      { type: "super-jump", source: "streak" },
      { type: "rapid-climb", source: "booster" },
    ]);
    expect(s47.ticket.boosterKept).toBeNull();
  });
});

describe("the start card honours the early-level start filter", () => {
  it("drops a carried super jump on an early level and never offers it there, but equips it after level 45", async () => {
    const store = memoryStore();
    await clearLevels(store, 46);
    const inventory = { "rapid-climb": 1, "super-jump": 1 };

    // Positive control on the same early card: an allowed carried pick is equipped.
    await renderMap(store.reopen(inventory), { openLevel: 11, booster: "rapid-climb" });
    expect(dialogTitle()).toBe("Level 11");
    expect(pressed()).toEqual(["Rapid Climb, 1 owned"]);

    act(() => root.unmount());
    root = createRoot(container);
    const early = store.reopen(inventory);
    const startEarly = vi.spyOn(early, "startLevel");
    await renderMap(early, { openLevel: 11, booster: "super-jump" });
    expect(dialogTitle()).toBe("Level 11");
    expect(pressed()).toEqual([]);
    // Owned, and raw-allowed on L11, but not a chip on the picker.
    expect(chipLabels()).toEqual(["Rapid Climb, 1 owned"]);
    // No chip shows it, so what Play sends is the proof it was dropped (not
    // held unseen, to be refused by the server).
    store.later();
    await act(async () => {
      button("Play level 11")?.click();
    });
    await flush();
    expect(startEarly).toHaveBeenLastCalledWith(11, { booster: null });
    await expect(startEarly.mock.results.at(-1)?.value).resolves.toMatchObject({ ok: true });

    act(() => root.unmount());
    root = createRoot(container);
    await renderMap(store.reopen(inventory), { openLevel: 46, booster: "super-jump" });
    expect(dialogTitle()).toBe("Level 46");
    expect(pressed()).toEqual(["Super Jump, 1 owned"]);
  });

  it("starts the carried pick alongside an early frontier's free power-up", async () => {
    const store = memoryStore();
    await clearLevels(store, 11);
    const client = store.reopen({ "sprint-burst": 1, "super-jump": 1 });
    const startLevel = vi.spyOn(client, "startLevel");
    await renderMap(client, { openLevel: 12, booster: "sprint-burst" });
    expect(dialogTitle()).toBe("Level 12");
    expect(pressed()).toEqual(["Sprint Burst, 1 owned"]);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("You start with Rapid Climb and Sprint Burst");
    store.later();
    await act(async () => {
      button("Play level 12")?.click();
    });
    await flush();
    expect(startLevel).toHaveBeenLastCalledWith(12, { booster: "sprint-burst" });
    const res = await startLevel.mock.results.at(-1)?.value;
    expect(res).toMatchObject({
      ok: true,
      ticket: { startPowerUps: [{ type: "rapid-climb", source: "streak" }, { type: "sprint-burst", source: "booster" }], boosterKept: null },
    });
  });
});

describe("the chest pick honours the early-level start filter", () => {
  const cleared = (level: number, boosters: LevelResult["chestsOpened"][number]["boosters"]): LevelResult => ({
    level,
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
    chestsOpened: [{ chestNumber: 1, boosters }],
    boosters: null,
    goalFt: 267,
    peakFt: 267,
    xpGained: 160,
    newPlayerLevel: null,
    player: { lives: 5, maxLives: 5, nextLifeAt: null, xp: 200, playerLevel: 2, xpIntoLevel: 140, xpForNext: 153 },
  });

  async function renderCard(level: number, onNext: (b: unknown) => void) {
    const season = { ...(await memoryStore().client.getSeason()), frontier: 60, nextStartPowerUp: null };
    act(() =>
      root.render(
        createElement(LevelResultCard, {
          result: cleared(level, ["super-jump", "sprint-burst"]),
          costsLife: true,
          hasNextLevel: true,
          nextStart: nextStartAfter(season, level),
          retryBusy: false,
          onNext,
          onRetry: () => {},
          onMap: () => {},
          onPractice: () => {},
          onPracticeLevel: () => {},
        }),
      ),
    );
    act(() => button("Skip")?.click());
  }
  const toggle = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('ul[aria-label="Boosters from the chest"] button[aria-pressed]')].find((b) =>
      b.textContent?.includes(label),
    );

  it("disables a received super jump for an early next level, and allows it for level 46", async () => {
    const onNext = vi.fn();
    await renderCard(10, onNext);
    const early = toggle("Super Jump");
    expect(early?.disabled).toBe(true);
    expect(early?.getAttribute("aria-label")).toBe("+1 Super Jump, unlocks on a later level");
    expect(toggle("Sprint Burst")?.disabled).toBe(false);
    act(() => early?.click());
    act(() => button("Next level")?.click());
    expect(onNext).toHaveBeenLastCalledWith(null);

    const onNextLate = vi.fn();
    await renderCard(45, onNextLate);
    const late = toggle("Super Jump");
    expect(late?.disabled).toBe(false);
    act(() => late?.click());
    act(() => button("Next level")?.click());
    expect(onNextLate).toHaveBeenLastCalledWith("super-jump");
  });
});

describe("the paid refill and the chest pick on one result card", () => {
  const player = { lives: 0, maxLives: 5, nextLifeAt: Date.now() + 60_000, xp: 200, playerLevel: 2, xpIntoLevel: 140, xpForNext: 153 };
  const base: LevelResult = {
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
    chestsOpened: [{ chestNumber: 1, boosters: ["sprint-burst"] }],
    boosters: null,
    goalFt: 267,
    peakFt: 267,
    xpGained: 160,
    newPlayerLevel: null,
    player,
  };
  const next = { level: 8, allowed: ["rapid-climb", "sprint-burst"], freeType: null } as const;

  function render(result: LevelResult, onNext: (b: unknown) => void, buy: () => Promise<BuyLivesResult>) {
    act(() =>
      root.render(
        createElement(LevelResultCard, {
          result,
          costsLife: true,
          hasNextLevel: true,
          nextStart: next,
          refill: { gems: 80, cost: 50, buy },
          retryBusy: false,
          onNext,
          onRetry: () => {},
          onMap: () => {},
          onPractice: () => {},
          onPracticeLevel: () => {},
        }),
      ),
    );
  }

  it("offers the refill on a loss with no pick, and the pick on a clear with no refill", async () => {
    const buy = vi.fn(async (): Promise<BuyLivesResult> => ({ ok: false, code: "LIVES_FULL" }));
    const onNext = vi.fn();
    render({ ...base, cleared: false, stars: 0, timeMs: null, peakFt: 100, xpGained: 0, chestsOpened: [] }, onNext, buy);
    expect(button("Refill lives for 50 gems")).toBeDefined();
    expect(container.querySelector("button[aria-pressed]")).toBeNull();
    await act(async () => {
      button("Refill lives for 50 gems")?.click();
    });
    expect(buy).toHaveBeenCalledTimes(1);

    render(base, onNext, buy);
    expect(button("Refill lives for 50 gems")).toBeUndefined();
    act(() => button("Skip")?.click());
    const pick = [...container.querySelectorAll<HTMLButtonElement>('ul[aria-label="Boosters from the chest"] button[aria-pressed]')][0];
    act(() => pick?.click());
    act(() => button("Next level")?.click());
    expect(onNext).toHaveBeenLastCalledWith("sprint-burst");
  });
});
