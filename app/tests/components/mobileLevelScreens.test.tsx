/**
 * The mobile level map, level start card and result cards, rendered for real
 * on the device-local level store (mobile/src/lib/levels/mockClient). Auth and
 * haptics are mocked; the store runs on an in-memory clock and storage.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactElement } from "react";
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

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { LevelResult, LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { LevelPlayScreen, ticketFromState } from "../../mobile/src/screens/LevelPlayScreen";
import { LevelResultCard } from "../../mobile/src/components/levels/LevelResultCard";
import { TICK_HZ } from "../../src/game/types";

let container: HTMLDivElement;
let root: Root;
let where: { pathname: string; state: unknown };

function Where() {
  const loc = useLocation();
  where = { pathname: loc.pathname, state: loc.state };
  return null;
}

beforeEach(() => {
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
      finishedTick: 3 * TICK_HZ,
      peakFt: s.ticket.goalFt,
      replayToken: null,
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
      createElement(
        MemoryRouter,
        { initialEntries: [initial] },
        createElement(
          LevelsProvider,
          { client },
          createElement(Where),
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/", element: createElement(LevelMapScreen) }),
            createElement(Route, { path: "/levels/:level/play", element: createElement(LevelPlayScreen) }),
            createElement(Route, { path: "/climb", element: createElement("p", null, "practice") }),
          ),
        ),
      ),
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
      await client.submitResult(s.ticket.id, { finished: false, finishedTick: null, peakFt: 5, replayToken: null });
    }
    await renderMap(client);
    await click(pin("Level 11, next to play"));

    expect(button("Play level 11")).toBeUndefined();
    const alert = container.querySelector('[role="dialog"] [role="alert"]');
    expect(alert?.textContent).toMatch(/Out of lives\. Next life in \d+:\d\d/);

    await click(button("Practice this level"));
    expect(where.pathname).toBe("/levels/11/play");
  });

  it("opens the next level's card when a result's Next level lands on the map", async () => {
    const client = memoryClient();
    await clearLevels(client, 2);
    await renderMap(client, { pathname: "/", state: { openLevel: 3 } });
    expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe("Level 3");
  });

  it("sends Practice to the endless climb", async () => {
    await renderMap(memoryClient());
    await click(button("Practice, the endless climb"));
    expect(where.pathname).toBe("/climb");
  });
});

describe("level play route", () => {
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
    expect(ticketFromState({ ticket }, 4)).toBe(ticket);
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
    pars: { twoStarMs: 36_000, threeStarMs: 28_000 },
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
});
