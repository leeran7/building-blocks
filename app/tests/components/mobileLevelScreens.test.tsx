/**
 * The mobile level map, level start card and result cards, rendered for real
 * on the device-local level store (mobile/src/lib/levels/mockClient). Auth and
 * haptics are mocked; the store runs on an in-memory clock and storage.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, useEffect, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

/**
 * The climb itself needs a canvas and a running sim. Stand it in with buttons
 * that end the run the way the real one does (through onEnd), so the screen's
 * submit, result, retry and Next level flow runs for real.
 */
const runs = vi.hoisted(() => ({
  mounted: [] as Array<{ seed: string; goalFt: number; bestFailFt: number | null; startPowerUp: unknown }>,
}));
vi.mock("../../mobile/src/components/levels/LevelRun", async () => {
  const { createElement: h, useEffect: useMountEffect } = await import("react");
  return {
    LevelRun: (props: {
      level: number;
      seed: string;
      goalFt: number;
      paused: boolean;
      bestFailFt?: number | null;
      startPowerUp?: unknown;
      onEnd: (r: LevelRunReport) => void;
    }) => {
      useMountEffect(() => {
        runs.mounted.push({
          seed: props.seed,
          goalFt: props.goalFt,
          bestFailFt: props.bestFailFt ?? null,
          startPowerUp: props.startPowerUp ?? null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one entry per mounted attempt
      }, []);
      return h(
        "div",
        null,
        h("button", { onClick: () => props.onEnd({ level: props.level, finished: true, finishedTick: 30, raceTicks: 30, peakFt: props.goalFt, replayToken: null, outOfTime: false }) }, "stub-clear"),
        h("button", { onClick: () => props.onEnd({ level: props.level, finished: false, finishedTick: null, raceTicks: 300, peakFt: props.goalFt / 2, replayToken: "r", outOfTime: false }) }, "stub-lose"),
        h("button", { onClick: () => props.onEnd({ level: props.level, finished: false, finishedTick: null, raceTicks: 300, peakFt: props.goalFt - 1, replayToken: "r", outOfTime: false }) }, "stub-near"),
      );
    },
  };
});

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { LevelResult, LevelRunReport, LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen, MAP_FADE, pinBottom } from "../../mobile/src/screens/LevelMapScreen";
import { LevelPlayScreen, ticketFromState } from "../../mobile/src/screens/LevelPlayScreen";
import { LevelResultCard } from "../../mobile/src/components/levels/LevelResultCard";
import { TICK_HZ } from "../../src/game/types";
import { POWER_UP_TYPES } from "../../src/game/powerups";
import { markTutorialsSeen } from "../../mobile/src/lib/levels/tutorialSeen";

let container: HTMLDivElement;
let root: Root;
let where: { pathname: string; state: unknown };

function Where() {
  const loc = useLocation();
  useEffect(() => {
    where = { pathname: loc.pathname, state: loc.state };
  }, [loc]);
  return null;
}

beforeEach(() => {
  runs.mounted = [];
  localStorage.clear();
  // The level tutorials have their own tests (mobileLevelTutorial.test.tsx).
  markTutorialsSeen(["basics", ...POWER_UP_TYPES]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  where = { pathname: "", state: null };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function memoryClient(): LevelsClient {
  let stored: string | null = null;
  return createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) });
}

async function clearLevels(client: LevelsClient, upTo: number) {
  for (let n = 1; n <= upTo; n++) {
    const s = await client.startLevel(n);
    if (!s.ok) throw new Error("refused");
    await client.submitResult(s.ticket.id, {
      finished: true,
      level: s.ticket.level,
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

async function renderMap(client: LevelsClient, initial: string | { pathname: string; state: unknown } = "/") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initial]}>
        <LevelsProvider client={client}>
          <Where />
          <Routes>
            <Route path="/" element={<LevelMapScreen />} />
            <Route path="/levels/:level/play" element={<LevelPlayScreen />} />
            <Route path="/climb" element={<p>practice</p>} />
          </Routes>
        </LevelsProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

const pin = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("ol button")].find((b) => b.getAttribute("aria-label") === label);
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label,
  );

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("level map", () => {
  it("marks cleared levels with stars, the frontier as next, and later levels locked", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);

    expect(pin("Level 3, 3 of 3 stars")).toBeTruthy();
    const next = pin("Level 4, next to play");
    expect(next?.getAttribute("aria-current")).toBe("step");
    expect(next?.disabled).toBe(false);
    const locked = pin("Level 5, locked");
    expect(locked?.disabled).toBe(true);
    // Only a lookahead of locked levels is drawn, not all 300.
    expect(pin("Level 20, locked")).toBeUndefined();
  });

  it("opens the start card and starts the level with the server's ticket", async () => {
    const client = memoryClient();
    await renderMap(client);
    await click(pin("Level 1, next to play"));

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Level 1");
    expect(dialog?.textContent).toContain("Tutorial level: free to play");

    await click(button("Play level 1"));
    expect(where.pathname).toBe("/levels/1/play");
    expect(ticketFromState(where.state, 1)?.seed).toBe("s1:level:1:0");
  });

  it("offers the wait, Practice this level and Practice when out of lives", async () => {
    const client = memoryClient();
    await clearLevels(client, 10);
    for (let i = 0; i < 5; i++) {
      const s = await client.startLevel(11);
      if (!s.ok) throw new Error("refused");
      await client.submitResult(s.ticket.id, { level: s.ticket.level, finished: false, finishedTick: null, raceTicks: 200, peakFt: 5, replayToken: null, outOfTime: false });
    }
    await renderMap(client);
    await click(pin("Level 11, next to play"));

    expect(button("Play level 11")).toBeUndefined();
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe("Out of lives.");
    expect(container.querySelector('[role="dialog"]')?.textContent).toMatch(/Out of lives\. Next life in \d+:\d\d/);

    await click(button("Practice this level"));
    expect(where.pathname).toBe("/levels/11/play");
  });

  it("opens the next level's card when a result's Next level lands on the map", async () => {
    const client = memoryClient();
    await clearLevels(client, 2);
    await renderMap(client, { pathname: "/", state: { openLevel: 3 } });
    expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe("Level 3");
  });

  it("leaves the Play bar clear so the lava shows behind it, fading the map out instead", async () => {
    await renderMap(memoryClient());
    const bar = container.querySelector<HTMLElement>("[data-play-bar]");
    expect(bar?.contains(button("Open level 1") ?? null)).toBe(true);
    // No scrim of its own: a dark fill here hid the lava crest above the tab bar.
    expect(bar?.className).not.toMatch(/\bbg-|\bfrom-|\bvia-/);
    const scroller = container.querySelector("ol")?.closest<HTMLElement>(".overflow-y-auto");
    expect(scroller?.style.getPropertyValue("mask-image")).toBe(MAP_FADE);
    // Level 1, the lowest pin, sits above the fade's solid stop.
    const solidFrom = Math.max(...[...MAP_FADE.matchAll(/(\d+)px/g)].map((m) => Number(m[1])));
    expect(pinBottom(1)).toBeGreaterThan(solidFrom);
  });

  it("sends Endless to the endless climb", async () => {
    await renderMap(memoryClient());
    await click(button("Endless, climb as high as you can"));
    expect(where.pathname).toBe("/climb");
  });
});

describe("friends board on the start card", () => {
  it("shows the player's own time, or invites friends before a clear", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);
    await click(pin("Level 2, 3 of 3 stars"));
    await flush();
    const list = container.querySelector('ol[aria-label="Friends\' best times on level 2"]');
    expect(list?.textContent).toContain("You");
    expect(list?.textContent).toContain("0:03");
    // Folded until tapped, so Play stays in reach.
    const toggle = list?.parentElement?.previousElementSibling;
    if (!(toggle instanceof HTMLButtonElement)) throw new Error("no Friends toggle");
    expect(toggle.textContent).toContain("You're #1 of 1");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list?.closest("[hidden]")).not.toBeNull();
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list?.closest("[hidden]")).toBeNull();
    await click(button("Close"));
    await click(pin("Level 4, next to play"));
    await flush();
    expect(container.textContent).toContain("Add friends to race their times here.");
  });
});

describe("win streak on the start card", () => {
  it("previews the streak's power-up on the frontier level only", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderMap(client);
    await click(pin("Level 4, next to play"));
    expect(container.textContent).toContain("Win streak 3");
    expect(container.textContent).toContain("You start with");
    expect(container.textContent).toContain("Rapid Climb");
    await click(button("Close"));
    await click(pin("Level 2, 3 of 3 stars"));
    expect(container.textContent).not.toContain("Win streak");
  });
});

describe("star chests and boosters", () => {
  /** Clears 1..7 with 3 stars each: 21 stars opens the first chest. */
  async function withChest() {
    const client = memoryClient();
    await clearLevels(client, 7);
    const season = await client.getSeason();
    const [type] = Object.keys(season.boosters);
    if (!type) throw new Error("the first chest held nothing");
    return { client, type, count: season.boosters[type as keyof typeof season.boosters] ?? 0 };
  }

  it("shows the stars toward the next chest on the map", async () => {
    const { client } = await withChest();
    await renderMap(client);
    const meter = container.querySelector('[role="group"][aria-label^="Star chest"]');
    expect(meter?.getAttribute("aria-label")).toMatch(/^Star chest: 1 of 20 stars, 19 to go\. \d+ boosters? owned\.$/);
  });

  it("equips an owned booster on a replay and starts the run with it", async () => {
    const { client, type, count } = await withChest();
    await renderMap(client);
    await click(pin("Level 7, 3 of 3 stars"));
    const chip = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')].find((b) =>
      b.getAttribute("aria-label")?.endsWith(`, ${count} owned`),
    );
    expect(chip?.getAttribute("aria-pressed")).toBe("false");
    await click(chip);
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("at GO");

    await click(button("Play level 7"));
    expect(where.pathname).toBe("/levels/7/play");
    expect(runs.mounted.at(-1)?.startPowerUp).toEqual({ type, source: "booster" });
    expect((await client.getSeason()).boosters[type as "giant"] ?? 0).toBe(count - 1);
  });

  it("starts without a booster unless one is tapped, and a tap again takes it off", async () => {
    const { client, type, count } = await withChest();
    await renderMap(client);
    await click(pin("Level 7, 3 of 3 stars"));
    const chip = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')].find((b) =>
      b.getAttribute("aria-label")?.endsWith(`, ${count} owned`),
    );
    await click(chip);
    await click(chip);
    expect(chip?.getAttribute("aria-pressed")).toBe("false");
    await click(button("Play level 7"));
    expect(runs.mounted.at(-1)?.startPowerUp).toBeNull();
    expect((await client.getSeason()).boosters[type as "giant"] ?? 0).toBe(count);
  });

  it("keeps the boosters when the frontier run already starts with a free power-up", async () => {
    const { client } = await withChest();
    await renderMap(client);
    await click(pin("Level 8, next to play"));
    expect(container.querySelector('[role="dialog"] button[aria-pressed]')).toBeNull();
    expect(container.textContent).toContain("your boosters are kept");
  });
});

describe("level play route", () => {
  it("clears a level, then Next level lands on the map with the next level open", async () => {
    const client = memoryClient();
    await renderMap(client);
    await click(pin("Level 1, next to play"));
    await click(button("Play level 1"));
    await click(button("stub-clear"));

    const card = container.querySelector('[role="dialog"]');
    expect(card?.getAttribute("aria-label")).toBe("Level 1 cleared, 3 of 3 stars");
    expect(document.activeElement).toBe(card);

    await click(button("Next level"));
    expect(where.pathname).toBe("/");
    expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe("Level 2");
    expect(pin("Level 1, 3 of 3 stars")).toBeTruthy();
  });

  it("retries a lost level on a fresh ticket, spending another life", async () => {
    const client = memoryClient();
    await clearLevels(client, 10);
    await renderMap(client);
    await click(pin("Level 11, next to play"));
    await click(button("Play level 11"));
    await click(button("stub-lose"));
    expect(container.textContent).toContain("4 of 5 lives left");

    await click(button("Retry"));
    expect(runs.mounted).toHaveLength(2);
    await click(button("stub-lose"));
    expect(container.textContent).toContain("3 of 5 lives left");
  });

  it("leads a near miss with the floors left, and marks the next try with it", async () => {
    const client = memoryClient();
    await clearLevels(client, 10);
    await renderMap(client);
    await click(pin("Level 11, next to play"));
    await click(button("Play level 11"));
    await click(button("stub-lose"));
    expect(container.textContent).not.toContain("from the summit!");
    await click(button("Retry"));
    // Half way up is not close: no marker.
    expect(runs.mounted[1].bestFailFt).toBeNull();
    await click(button("stub-near"));
    expect(container.textContent).toContain("1 floor from the summit!");
    await click(button("Retry"));
    expect(runs.mounted[2].bestFailFt).toBe(runs.mounted[2].goalFt - 1);
  });

  it("retires the near-miss marker once the level is cleared", async () => {
    await renderMap(memoryClient(), "/levels/1/play?practice=1");
    await click(button("stub-near"));
    await click(button("Retry"));
    expect(runs.mounted[1].bestFailFt).toBe(runs.mounted[1].goalFt - 1);
    await click(button("stub-clear"));
    await click(button("Retry"));
    expect(runs.mounted[2].bestFailFt).toBeNull();
  });

  it("says why a retry could not start instead of doing nothing", async () => {
    const client = memoryClient();
    const failing: LevelsClient = {
      ...client,
      startLevel: async (n) => (runs.mounted.length === 0 ? client.startLevel(n) : Promise.reject(new Error("offline"))),
    };
    await renderMap(failing);
    await click(pin("Level 1, next to play"));
    await click(button("Play level 1"));
    await click(button("stub-lose"));
    await click(button("Retry"));
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("Couldn\u2019t reach the server");
  });

  it("plays Practice this level without a ticket and saves nothing", async () => {
    const client = memoryClient();
    const submit = vi.spyOn(client, "submitResult");
    await renderMap(client, "/levels/1/play?practice=1");
    await click(button("stub-clear"));
    expect(container.textContent).toContain("Practice runs earn no stars or XP.");
    expect(submit).not.toHaveBeenCalled();
    expect((await client.getSeason()).frontier).toBe(1);
  });

  it("goes back to the map when opened without a ticket", async () => {
    await renderMap(memoryClient(), "/levels/1/play");
    expect(where.pathname).toBe("/");
  });

  it("reads a ticket only for the level being played", () => {
    const ticket = {
      id: "t",
      level: 4,
      seed: "s1:level:4:0",
      goalFt: 150,
      pars: { twoStarMs: 1, threeStarMs: 1 },
      player: {},
    };
    expect(ticketFromState({ ticket }, 4)).toEqual({ ...ticket, startPowerUp: null });
    expect(ticketFromState({ ticket: { ...ticket, startPowerUp: { type: "rapid-climb", source: "streak" } } }, 4)).toMatchObject({
      startPowerUp: { type: "rapid-climb", source: "streak" },
    });
    expect(ticketFromState({ ticket: { ...ticket, startPowerUp: { type: "random", source: "streak" } } }, 4)).toBeNull();
    expect(ticketFromState({ ticket }, 5)).toBeNull();
    expect(ticketFromState({ ticket: { ...ticket, seed: 7 } }, 4)).toBeNull();
    expect(ticketFromState(null, 4)).toBeNull();
  });
});

describe("level result card", () => {
  const player = { lives: 3, maxLives: 5, nextLifeAt: Date.now() + 60_000, xp: 200, playerLevel: 2, xpIntoLevel: 140, xpForNext: 153 };
  const base: LevelResult = {
    level: 12,
    cleared: true,
    stars: 2,
    previousStars: 0,
    timeMs: 31_000,
    outOfTime: false,
    pars: { twoStarMs: 36_000, threeStarMs: 28_000, oneStarMs: null },
    streak: null,
    atFrontier: false,
    failsAtLevel: 0,
    routeGhostAvailable: false,
    chestsOpened: [],
    boosters: null,
    goalFt: 267,
    peakFt: 267,
    xpGained: 160,
    newPlayerLevel: null,
    player,
  };
  const noop = () => {};

  async function renderCard(result: LevelResult, costsLife = true) {
    const el: ReactElement = createElement(LevelResultCard, {
      result,
      costsLife,
      hasNextLevel: true,
      retryBusy: false,
      onNext: noop,
      onRetry: noop,
      onMap: noop,
      onPractice: noop,
      onPracticeLevel: noop,
    });
    await act(async () => {
      root.render(el);
    });
  }

  it("shows the stars won, the time against the star times, XP and Next level on a clear", async () => {
    await renderCard(base);
    const text = container.textContent ?? "";
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("2 of 3 stars");
    expect(text).toContain("Level 12 cleared");
    expect(text).toContain("0:31");
    expect(text).toContain("3★ at 0:28 · 2★ at 0:36");
    expect(text).toContain("+160 XP");
    expect(button("Next level")).toBeTruthy();
  });

  it("says a run lost to the level's clock ran out of time, with the 1-star time", async () => {
    const clocked = { ...base.pars, oneStarMs: 45_000 };
    await renderCard({ ...base, pars: clocked, cleared: false, stars: 0, timeMs: null, peakFt: 200, xpGained: 0, outOfTime: true });
    expect(container.textContent).toContain("Out of time");
    expect(container.textContent).not.toContain("Caught by the lava");
    await renderCard({ ...base, pars: clocked });
    expect(container.textContent).toContain("3★ at 0:28 · 2★ at 0:36 · 1★ at 0:45");
  });

  it("leads a loss with the distance to the summit and a retry that shows the lives left", async () => {
    await renderCard({ ...base, cleared: false, stars: 0, timeMs: null, peakFt: 233.4, xpGained: 0 });
    const text = container.textContent ?? "";
    expect(text).toContain("Caught by the lava");
    expect(text).toContain("34ft");
    expect(text).toContain("from the summit");
    expect(button("Retry")).toBeTruthy();
    expect(text).toContain("3 of 5 lives left");
  });

  it("replaces Retry with the out-of-lives choices at zero lives, except on a tutorial level", async () => {
    const lost = { ...base, cleared: false, stars: 0 as const, timeMs: null, peakFt: 100, xpGained: 0, player: { ...player, lives: 0 } };
    await renderCard(lost);
    expect(button("Retry")).toBeUndefined();
    expect(button("Practice this level")).toBeTruthy();

    await renderCard(lost, false);
    expect(button("Retry")).toBeTruthy();
    expect(container.textContent).toContain("Tutorial level: free to retry");
  });

  it("announces a character the run unlocked, and nothing when none", async () => {
    await renderCard({ ...base, unlockedAvatars: ["ibex"] });
    const note = container.querySelector("[data-new-avatar]");
    expect(note?.getAttribute("role")).toBe("status");
    expect(note?.textContent).toBe("New character unlocked: Ibex");

    await renderCard({ ...base, unlockedAvatars: ["ibex", "falcon"] });
    expect(container.querySelector("[data-new-avatar]")?.textContent).toBe("New characters unlocked: Ibex, Falcon");

    await renderCard({ ...base, unlockedAvatars: [] });
    expect(container.querySelector("[data-new-avatar]")).toBeNull();
    await renderCard(base);
    expect(container.querySelector("[data-new-avatar]")).toBeNull();
  });

  it("promises free help on the next try from the 3rd fail", async () => {
    const lost = { ...base, cleared: false, stars: 0 as const, timeMs: null, peakFt: 100, xpGained: 0, atFrontier: true, streak: 0 };
    await renderCard({ ...lost, failsAtLevel: 2 });
    expect(container.textContent).not.toContain("free power-up");
    await renderCard({ ...lost, failsAtLevel: 3 });
    expect(container.textContent).toContain("Your next try starts with a free power-up.");
  });

  it("reveals the boosters a clear's star chest held, and nothing on other runs", async () => {
    await renderCard({ ...base, chestsOpened: [{ chestNumber: 1, boosters: ["giant", "giant"] }, { chestNumber: 2, boosters: ["slow-lava"] }] });
    const reveal = container.querySelector('ul[aria-label="Boosters from the chest"]');
    expect(container.textContent).toContain("2 star chests opened!");
    expect([...(reveal?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["+2 Giant", "+1 Slow Lava"]);
    await renderCard(base);
    expect(container.textContent).not.toContain("star chest");
    expect(container.textContent).not.toContain("Star chest");
  });

  it("shows the win streak after a frontier run, and nothing after a replay", async () => {
    await renderCard({ ...base, atFrontier: true, streak: 4 });
    expect(container.textContent).toContain("Win streak 4");
    await renderCard({ ...base, cleared: false, stars: 0, timeMs: null, peakFt: 100, xpGained: 0, atFrontier: true, streak: 0 });
    expect(container.textContent).toContain("Win streak reset");
    await renderCard({ ...base, atFrontier: false, streak: 4 });
    expect(container.textContent).not.toContain("Win streak");
  });
});
