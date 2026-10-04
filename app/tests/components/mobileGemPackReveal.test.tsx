/**
 * The gem packs sheet's payoff: gems landing (an in-app purchase credited at
 * once, or a web payment picked up by Refresh balance) play the reveal with
 * the balance counting up; a checkout still in the browser plays nothing.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => true }));

const shopState = vi.hoisted(() => ({
  shop: { gems: 250, ownedIds: [] as string[] } as { gems: number; ownedIds: string[] } | null,
  apply: vi.fn(),
  refresh: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/contexts/ShopContext", () => ({ useShop: () => shopState }));

const lib = vi.hoisted(() => ({ result: { kind: "credited", gems: 1450 } as { kind: string; gems?: number } }));
vi.mock("../../mobile/src/lib/shop", () => ({
  appStorePrices: async () => ({}),
  buyGemPack: vi.fn(async () => lib.result),
  buyGemPackOnWeb: vi.fn(async () => lib.result),
  offersWebCheckout: async () => false,
  packPrice: () => "$9.99",
  usesAppStore: () => false,
  ShopError: class extends Error {},
}));

import { GemPacksSheet } from "../../mobile/src/components/store/GemPacksSheet";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  shopState.shop = { gems: 250, ownedIds: [] };
  lib.result = { kind: "credited", gems: 1450 };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(onClose = vi.fn()) {
  await act(async () => root.render(createElement(GemPacksSheet, { onClose })));
  return onClose;
}
async function press(el: Element | null | undefined) {
  if (!el) throw new Error("missing");
  await act(async () => (el as HTMLElement).click());
}
const reveal = () => document.querySelector("[data-reward-phase]");
const buttonNamed = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent === text);

describe("gem pack payoff", () => {
  it("plays when a pack is credited, counting from the old balance to the new, and closes the sheet after", async () => {
    const onClose = await render();
    expect(reveal()).toBeNull();
    await press(document.querySelector("[data-gem-pack-buy]"));
    expect(reveal()?.getAttribute("aria-label")).toBe("Gems added: +1,200 gems");
    expect(reveal()?.textContent).toContain("1,450 gems");
    expect(shopState.apply).toHaveBeenCalledWith({ gems: 1450 });
    await press(buttonNamed("Continue"));
    expect(reveal()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("plays nothing while payment is still in the browser", async () => {
    lib.result = { kind: "checkout" };
    await render();
    await press(document.querySelector("[data-gem-pack-buy]"));
    expect(reveal()).toBeNull();
    expect(document.body.textContent).toContain("Finish paying in the browser.");
  });

  it("plays when Refresh balance finds gems that arrived, and not when it finds none", async () => {
    await render();
    await press(buttonNamed("Already paid? Refresh balance"));
    expect(shopState.refresh).toHaveBeenCalled();
    expect(reveal()).toBeNull();
    // The web payment cleared: the Shop's balance rises.
    shopState.shop = { gems: 2850, ownedIds: [] };
    await render();
    expect(reveal()?.getAttribute("aria-label")).toBe("Gems added: +2,600 gems");
    expect(reveal()?.textContent).toContain("2,850 gems");
  });
});
