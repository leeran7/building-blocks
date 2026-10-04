/**
 * The Shop's character layout: the Wraith featured on its own, every other
 * character beside its Void skin, owned looks marked, and each card opening
 * Skin Details on the look it showed.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "me" }, isAnonymous: false, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock("../../mobile/src/contexts/AppDataContext", () => ({
  useSettings: () => ({ data: null, setSettings: () => {}, refreshSettings: async () => {} }),
  useInvalidateAppData: () => () => {},
  echoedSetting: () => null,
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
  fetchShop: async () => ({ gems: 1850, ownedIds: ["kestrel-void"], appleAccountToken: null, webCheckout: false }),
  settleUnfinishedPurchases: async () => null,
  watchAppleTransactions: () => () => {},
}));

import { skinsOf } from "@app/lib/avatars";
import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { ShopProvider } from "../../mobile/src/contexts/ShopContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import { SceneContext, type TransitionKind } from "../../mobile/src/components/RouteTransition";
import { FEATURED_CHARACTER_ID, SHOP_CHARACTERS, ShopScreen } from "../../mobile/src/screens/ShopScreen";
import { SkinDetailsScreen } from "../../mobile/src/screens/SkinDetailsScreen";

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

/** `arrivedBy`: the transition RouteTransition would say the Shop's screen arrived by. */
async function renderShop(arrivedBy: TransitionKind = "initial") {
  let stored: string | null = null;
  const client = createMockLevelsClient({ load: () => stored, save: (raw) => void (stored = raw) });
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/shop"]}>
        <LevelsProvider client={client}>
          <ShopProvider>
            <SceneContext.Provider value={arrivedBy}>
              <Routes>
                <Route path="/shop" element={<ShopScreen />} />
                <Route path="/shop/:characterId" element={<SkinDetailsScreen />} />
              </Routes>
            </SceneContext.Provider>
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

async function click(el: Element | null) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

const card = (id: string) => document.querySelector(`[data-shop-character="${id}"]`);
const checkedLook = () => document.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("data-look");

describe("Shop characters", () => {
  it("features the Wraith alone and lists every other character once", async () => {
    await renderShop();
    expect(document.querySelector("[data-shop-featured]")?.getAttribute("data-shop-featured")).toBe("wraith");
    expect(card(FEATURED_CHARACTER_ID)).toBeNull();

    const listed = [...document.querySelectorAll("[data-shop-character]")].map((c) => c.getAttribute("data-shop-character"));
    const expected = SHOP_CHARACTERS.map((c) => c.id).filter((id) => id !== FEATURED_CHARACTER_ID);
    expect(expected.length).toBeGreaterThan(0);
    expect(listed).toEqual(expected);
  });

  it("shows the character itself and its Void skin on each card, not a portrait", async () => {
    await renderShop();
    const lynx = card("lynx");
    expect(lynx?.querySelectorAll("[data-character-preview]")).toHaveLength(2);
    expect(lynx?.querySelector("[data-character-figure]")).not.toBeNull();
    expect(lynx?.querySelector("[data-skin-figure]")).not.toBeNull();
    expect(lynx?.querySelector("img")).toBeNull();
  });

  it("puts the Void skin in front at full size, named as the look it sells", async () => {
    await renderShop();
    const lynx = card("lynx");
    const skinCanvas = lynx?.querySelector("[data-skin-figure] canvas") as HTMLCanvasElement | null;
    const classicCanvas = lynx?.querySelector("[data-character-figure] canvas") as HTMLCanvasElement | null;
    expect(skinCanvas).not.toBeNull();
    expect(classicCanvas).not.toBeNull();
    expect(parseFloat(skinCanvas!.style.width)).toBeGreaterThan(parseFloat(classicCanvas!.style.width) * 1.3);
    // The skin paints after the Classic so it stacks in front.
    expect(classicCanvas!.compareDocumentPosition(skinCanvas!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lynx?.textContent).toContain("Void Lynx");
  });

  it("marks owned skins and counts them", async () => {
    await renderShop();
    expect(card("kestrel")?.getAttribute("aria-label")).toBe("Void Kestrel, owned");
    expect(card("lynx")?.getAttribute("aria-label")).toBe("Void Lynx, 1,200 gems");
    const total = SHOP_CHARACTERS.length - 1;
    expect(document.querySelector("[data-shop-owned-count]")?.textContent).toBe(`1 of ${total} owned`);
  });

  it("opens the Wraith's details on the Wraith itself", async () => {
    await renderShop();
    // Without the Shop's hint, details open on the first skin: the hint must change that.
    expect(skinsOf("wraith")[0].id).not.toBe("wraith");
    await click(document.querySelector("[data-shop-featured]"));
    expect(document.querySelector("[data-skin-details]")).not.toBeNull();
    expect(checkedLook()).toBe("wraith");
  });

  it("opens a character's details on the Void skin its card sold", async () => {
    await renderShop();
    await click(card("lynx"));
    expect(checkedLook()).toBe("lynx-void");
  });
});

describe("the Shop's entrance", () => {
  // Real Motion here (the suite's setup skips animations): the first frame
  // shows whether the cards start hidden. happy-dom's WAAPI stub rejects on
  // cancel, so Motion falls back to its own frame loop.
  const realAnimate = Element.prototype.animate;
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = false;
    delete (Element.prototype as Partial<Element>).animate;
  });
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    Element.prototype.animate = realAnimate;
  });

  /** The last card: the one whose rise, staggered, starts latest. */
  const lastRow = () => {
    const rows = document.querySelectorAll("[data-shop-character]");
    return rows[rows.length - 1]?.closest("li") as HTMLElement | null;
  };

  it("rises the cards in when the Shop opens", async () => {
    await renderShop();
    // Still on its way up from opacity 0 as the render returns.
    expect(Number(lastRow()?.style.opacity)).toBeLessThan(0.5);
  });

  it("has the cards in place already on the way back from Skin Details", async () => {
    await renderShop("pop");
    expect(Number(lastRow()?.style.opacity)).toBe(1);
  });
});
