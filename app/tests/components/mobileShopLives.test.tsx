/**
 * The Shop's lives refill row: it opens the same Lives sheet as the map's
 * lives pill, a refill there moves the Shop's gem balance, and the row is
 * absent where no refill can be sold.
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
vi.mock("../../mobile/src/lib/shop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mobile/src/lib/shop")>()),
  fetchShop: async () => ({ gems: 120, ownedIds: [], appleAccountToken: null, webCheckout: false }),
  settleUnfinishedPurchases: async () => null,
  watchAppleTransactions: () => () => {},
}));

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { ShopProvider } from "../../mobile/src/contexts/ShopContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { BuyLivesResult, LevelsClient } from "../../mobile/src/lib/levels/model";
import { ShopScreen } from "../../mobile/src/screens/ShopScreen";
import { TICK_HZ } from "../../src/game/types";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
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

/** Level 11 lost `losses` times on the local store, selling refills at 50 gems. */
async function refillClient(losses: number) {
  const base = memoryClient();
  for (let n = 1; n <= 10; n++) {
    const s = await base.startLevel(n);
    if (!s.ok) throw new Error("refused");
    await base.submitResult(s.ticket.id, { finished: true, level: n, finishedTick: 3 * TICK_HZ, raceTicks: 3 * TICK_HZ, peakFt: s.ticket.goalFt, replayToken: null, outOfTime: false });
  }
  for (let i = 0; i < losses; i++) {
    const s = await base.startLevel(11);
    if (!s.ok) throw new Error("refused");
    await base.submitResult(s.ticket.id, { level: 11, finished: false, finishedTick: null, raceTicks: 200, peakFt: 5, replayToken: null, outOfTime: false });
  }
  const buyLives = vi.fn(async (): Promise<BuyLivesResult> => {
    const season = await base.getSeason();
    return { ok: true, player: { ...season.player, lives: season.player.maxLives, nextLifeAt: null }, gems: 70 };
  });
  const client: LevelsClient = {
    ...base,
    getSeason: async () => ({ ...(await base.getSeason()), refill: { gems: 120, cost: 50 } }),
    buyLives,
  };
  return { client, buyLives };
}

async function renderShop(client: LevelsClient) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/shop"]}>
        <LevelsProvider client={client}>
          <ShopProvider>
            <Routes>
              <Route path="/shop" element={<ShopScreen />} />
            </Routes>
          </ShopProvider>
        </LevelsProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

const tile = () => document.querySelector("[data-shop-lives]");
const sheet = () => document.querySelector("[data-lives-sheet]");
const balance = () => document.querySelector("[data-gem-balance]")?.textContent;

describe("Shop lives refill", () => {
  it("sells a refill from the Shop and moves the gem balance", async () => {
    const { client, buyLives } = await refillClient(2);
    await renderShop(client);
    expect(tile()?.getAttribute("aria-label")).toBe("Lives, 3 of 5. Refill for 50 gems");
    expect(balance()).toContain("120");

    await click(tile());
    expect(sheet()?.textContent).toContain("3 of 5 lives");
    await click(document.querySelector('[aria-label="Refill lives for 50 gems"]'));
    expect(buyLives).toHaveBeenCalledTimes(1);
    expect(sheet()).toBeNull();
    expect(document.querySelector("[data-reward-phase]")?.getAttribute("aria-label")).toBe("Lives refilled: 5 lives");
    expect(balance()).toContain("70");
    expect(tile()?.textContent).toContain("Lives full");
  });

  it("is absent where no refill can be sold", async () => {
    await renderShop(memoryClient());
    expect(document.querySelector("[data-shop-page]")).not.toBeNull();
    expect(tile()).toBeNull();
  });
});
