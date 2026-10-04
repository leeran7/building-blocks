/**
 * The level map's chest cell and the sheet it opens: the boosters owned and
 * the stars to the next chest. Rendered for real on the device-local level
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
import type { LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { TICK_HZ } from "../../src/game/types";
import { POWER_UP_SPECS, POWER_UP_TYPES } from "../../src/game/powerups";
import { BOOSTER_TYPES } from "../../src/levels/engagement";
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

const chestCell = () => document.body.querySelector<HTMLButtonElement>("button[data-chest-meter]");
const chestSheet = () => document.body.querySelector<HTMLElement>("[data-chest-sheet]");
const rows = () => [...(chestSheet()?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");

describe("chest cell on the level map", () => {
  it("opens a sheet with no boosters yet and the stars to the first chest", async () => {
    const client = memoryClient();
    await clearLevels(client, 2);
    await renderMap(client);

    expect(chestSheet()).toBeNull();
    const cell = chestCell();
    expect(cell?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(cell?.getAttribute("aria-label")).toBe("Star chest: 6 of 20 stars, 14 to go. Show your boosters");
    await click(cell);

    expect(chestSheet()?.getAttribute("role")).toBe("dialog");
    expect(chestSheet()?.querySelector("#chest-sheet-title")?.textContent).toBe("Star chest");
    expect(chestSheet()?.textContent).toContain("6/20 stars · 14 to the next chest");
    expect(rows()).toEqual([expect.stringContaining("None yet")]);
    expect(rows()[0]).toContain("14 more stars");
  });

  it("lists every booster the opened chest gave, with what it does and the count", async () => {
    const client = memoryClient();
    // 7 clears at 3 stars: 21 stars, one chest opened, 1 into the next.
    await clearLevels(client, 7);
    const { boosters } = await client.getSeason();
    const owned = BOOSTER_TYPES.filter((t) => (boosters[t] ?? 0) > 0);
    expect(owned.length).toBeGreaterThan(0);

    await renderMap(client);
    await click(chestCell());

    expect(chestSheet()?.textContent).toContain("1/20 stars · 19 to the next chest");
    expect(rows()).toEqual(
      owned.map((t) => `${POWER_UP_SPECS[t].label}${POWER_UP_SPECS[t].description}×${boosters[t]}${boosters[t]} owned`),
    );
  });

  it("closes on the close button and on Escape", async () => {
    await renderMap(memoryClient());
    await click(chestCell());
    await click(chestSheet()?.querySelector('button[aria-label="Close"]:not([tabindex="-1"])'));
    expect(chestSheet()).toBeNull();

    await click(chestCell());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(chestSheet()).toBeNull();
  });
});
