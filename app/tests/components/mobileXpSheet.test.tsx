/**
 * The level map's XP pill and the sheet it opens: the player level, how to
 * earn XP, and what unlocks next. Rendered for real on the device-local level
 * store (mobile/src/lib/levels/mockClient); auth and haptics are mocked.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
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

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { LevelsClient, SeasonView } from "../../mobile/src/lib/levels/model";
import { progressionOf } from "../../mobile/src/lib/levels/progression";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { TICK_HZ } from "../../src/game/types";
import { POWER_UP_TYPES } from "../../src/game/powerups";
import { markTutorialsSeen } from "../../mobile/src/lib/levels/tutorialSeen";
import { markOnboardingDone } from "../../mobile/src/lib/onboarding";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  markTutorialsSeen(["basics", ...POWER_UP_TYPES]);
  markOnboardingDone();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function memoryClient(): LevelsClient {
  let stored: string | null = null;
  return createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) });
}

/** Clears levels 1..upTo in 3 seconds each: 3 stars apiece. */
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

async function renderMap(client: LevelsClient) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <LevelsProvider client={client}>
          <Routes>
            <Route path="/" element={<LevelMapScreen />} />
          </Routes>
        </LevelsProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

async function click(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
  await flush();
}

const xpPill = () => document.body.querySelector<HTMLButtonElement>("button[data-xp-pill]");
const xpSheet = () => document.body.querySelector<HTMLElement>("[data-xp-sheet]");
const rows = () => [...(xpSheet()?.querySelectorAll("li") ?? [])].map((li) => li.textContent);

describe("progressionOf", () => {
  it("lists what the next levels bring, the next star characters and the chest", async () => {
    const client = memoryClient();
    await clearLevels(client, 10);
    const p = progressionOf(await client.getSeason());

    // 10 first clears at 3 stars: frontier 11 (50 + 5·11 XP), 30 stars.
    expect(p.nextClear).toEqual({ level: 11, hard: false, firstClearXp: 105 });
    expect(p.episode).toEqual({ episode: 1, first: 1, last: 15, levelsLeft: 5, xp: 250 });
    expect(p.tower.map((u) => [u.level, u.kind, u.title])).toEqual([
      [11, "power-up", "Super Jump"],
      [14, "power-up", "Slow Lava"],
      [18, "power-up", "Giant"],
    ]);
    expect(p.stars).toBe(30);
    expect(p.characters).toEqual([
      { id: "raven", name: "Raven", stars: 50, starsLeft: 20 },
      { id: "panther", name: "Panther", stars: 75, starsLeft: 45 },
    ]);
    expect(p.starsToChest).toBe(10);
  });

  it("names an obstacle intro by its tip's first sentence", async () => {
    const client = memoryClient();
    await clearLevels(client, 7);
    const p = progressionOf(await client.getSeason());
    expect(p.tower[0]).toEqual({
      level: 9,
      kind: "obstacle",
      title: "New obstacle",
      detail: "Hanging ladders start above your head.",
      color: null,
    });
  });

  it("has no next clear or tower unlocks once every level is cleared", async () => {
    const season = await memoryClient().getSeason();
    const cleared: SeasonView = {
      ...season,
      frontier: season.levels.length,
      levels: season.levels.map((n) => ({ ...n, stars: 3 })),
      chests: null,
    };
    const p = progressionOf(cleared);
    expect(p.nextClear).toBeNull();
    expect(p.episode).toBeNull();
    expect(p.tower).toEqual([]);
    expect(p.starsToChest).toBeNull();
    // Without the server's lifetime total it counts this season's stars: 900,
    // past the last star character (840).
    expect(p.stars).toBe(season.levels.length * 3);
    expect(p.characters).toEqual([]);
  });
});

describe("XP pill on the level map", () => {
  it("opens the XP sheet with how to level up and what unlocks next", async () => {
    const client = memoryClient();
    await clearLevels(client, 10);
    await renderMap(client);

    expect(xpSheet()).toBeNull();
    const pill = xpPill();
    expect(pill?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pill?.getAttribute("aria-label")).toMatch(/^Player level \d+, [\d,]+ of [\d,]+ XP\. Show what unlocks next$/);
    await click(pill);

    expect(xpSheet()?.getAttribute("role")).toBe("dialog");
    expect(xpSheet()?.querySelector("#xp-sheet-title")?.textContent).toMatch(/^Level \d+$/);
    expect(rows()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Clear level 11"),
        expect.stringContaining("Finish Episode 1Levels 1–15 · 5 left+250 XP"),
        expect.stringContaining("Super Jump"),
        expect.stringContaining("Raven"),
        expect.stringContaining("Star chest"),
      ]),
    );
    expect(rows().find((r) => r?.startsWith("Super Jump"))).toContain("Level 11");
    expect(rows().find((r) => r?.startsWith("Raven"))).toContain("20 more stars");
  });

  it("closes on the close button and on Escape", async () => {
    await renderMap(memoryClient());
    await click(xpPill());
    await click(xpSheet()?.querySelector('button[aria-label="Close"]:not([tabindex="-1"])'));
    expect(xpSheet()).toBeNull();

    await click(xpPill());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(xpSheet()).toBeNull();
  });
});
