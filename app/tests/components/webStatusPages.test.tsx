/**
 * Website pages that show a state instead of content (StatusPage). Each keeps
 * the site header, names the state in an h1, explains it, and links onward,
 * so none is a dead end (Phase 4 grading, bar 9):
 *  - a duel link that is gone (404) vs one that failed to load;
 *  - payouts for a signed-out visitor (a sign-in link back to the page);
 *  - any unknown path (app/not-found.tsx).
 *
 * @vitest-environment happy-dom
 */

import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as unknown, token: null as string | null, loading: false }));
vi.mock("../../src/contexts/AuthContext", () => ({
  useAuth: () => ({ ...auth, isAnonymous: false, signOut: async () => {} }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
// The room itself loads Ably; these tests only reach the states before it.
vi.mock("../../src/components/Duel/DuelRoom", () => ({ DuelRoom: () => null }));
// The replay draws to a canvas; these tests only need its controls.
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
// Counts the replay's sim steps, so a pause can be seen to stop them.
const sim = vi.hoisted(() => ({ steps: 0 }));
vi.mock("../../src/game/simulation", async (importActual) => {
  const actual = await importActual<typeof import("../../src/game/simulation")>();
  return {
    ...actual,
    stepMatch: (...args: Parameters<typeof actual.stepMatch>) => {
      sim.steps++;
      return actual.stepMatch(...args);
    },
  };
});

import { DuelRoomLoader } from "../../src/components/Duel/DuelRoomLoader";
import { PayoutPage } from "../../src/components/Account/PayoutPage";
import { DuelWatch } from "../../src/components/Duel/DuelWatch";
import NotFound from "../../app/not-found";
import ErrorPage from "../../app/error";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

async function render(el: ReactElement) {
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const h1 = () => Array.from(container.querySelectorAll("main h1")).map((h) => h.textContent?.trim());
const links = () => Array.from(container.querySelectorAll("main a")).map((a) => [a.textContent?.trim(), a.getAttribute("href")]);

describe("website state pages", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    auth.user = null;
    auth.loading = false;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("tells a gone duel link apart from a failed load, with the header and a way to 1v1", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await render(createElement(DuelRoomLoader, { duelId: "gone" }));
    expect(container.querySelector("nav")).not.toBeNull();
    expect(h1()).toEqual(["Duel not found"]);
    expect(links()).toEqual([["Go to 1v1", "/duel"]]);
    act(() => root.unmount());

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await render(createElement(DuelRoomLoader, { duelId: "x" }));
    expect(h1()).toEqual(["Couldn't load this duel"]);
    act(() => root.unmount());

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await render(createElement(DuelRoomLoader, { duelId: "x" }));
    expect(h1()).toEqual(["Couldn't load this duel"]);
    expect(container.textContent).toContain("Check your connection");
  });

  it("says why a replay can't play: gone, not finished, or not loaded", async () => {
    const cases: [status: number | "network", h1: string, text: string][] = [
      [404, "Replay not found", "gone"],
      [409, "This duel hasn't finished yet", "once both climbers have finished"],
      [500, "Couldn't load this replay", "Check your connection"],
      ["network", "Couldn't load this replay", "Check your connection"],
    ];
    for (const [status, title, text] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => {
        if (status === "network") throw new TypeError("Failed to fetch");
        return { ok: false, status, json: async () => ({ error: "Duel not completed", code: "NOT_COMPLETED" }) };
      }));
      await render(createElement(DuelWatch, { duelId: "x" }));
      expect(h1()).toEqual([title]);
      expect(container.textContent).toContain(text);
      expect(container.textContent).not.toContain("Duel not completed");
      expect(links()).toEqual([["Go to 1v1", "/duel"]]);
      act(() => root.unmount());
    }
    act(() => {
      root = createRoot(container);
    });
  });

  it("lets a watcher pause and resume a replay", async () => {
    const replay = {
      seed: "replay-seed",
      categorySlug: "tech",
      player1: { id: "p1", displayName: "Kestrel", peak: 10 },
      player2: { id: "p2", displayName: "Moth", peak: 8 },
      log1: [],
      log2: [],
      winnerId: "p1",
      tiebreakRule: null,
      forfeit: false,
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => replay })));
    await render(createElement(DuelWatch, { duelId: "d1" }));
    const control = () =>
      Array.from(container.querySelectorAll("main button")).find((b) => /^(Pause|Resume|Watch again)$/.test(b.textContent ?? "")) as
        | HTMLButtonElement
        | undefined;
    const wait = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 120));
      });
    // Not full screen: the page keeps its header (the stage mounts after the
    // loading state, and that once read as full screen).
    expect(container.querySelector("nav")).not.toBeNull();
    // The result leads: winner tagged, both peaks, names spaced for readers.
    const h1 = container.querySelector("h1")!;
    expect(h1.textContent?.replace(/\s+/g, " ").trim()).toBe("Kestrelwin10ft vs Moth8ft");
    expect(control()?.textContent).toBe("Pause");
    await wait();
    expect(sim.steps).toBeGreaterThan(0);

    act(() => control()!.click());
    expect(control()?.textContent).toBe("Resume");
    const atPause = sim.steps;
    await wait();
    expect(sim.steps).toBe(atPause);

    expect(container.textContent).toContain("Paused 0:");

    act(() => control()!.click());
    expect(control()?.textContent).toBe("Pause");
    await wait();
    expect(sim.steps).toBeGreaterThan(atPause);

    // Space pauses too (full screen hides the button).
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
    });
    expect(control()?.textContent).toBe("Resume");
    const atSpace = sim.steps;
    await wait();
    expect(sim.steps).toBe(atSpace);
  });

  it("offers a signed-out visitor a sign-in that returns to payouts", async () => {
    await render(createElement(PayoutPage));
    expect(h1()).toEqual(["Tournament payouts"]);
    expect(links()).toContainEqual(["Sign in", "/auth/signin?redirect=%2Faccount%2Fpayout"]);
  });

  it("does not show the sign-in state while sign-in is still resolving", async () => {
    auth.loading = true;
    await render(createElement(PayoutPage));
    expect(links().map(([label]) => label)).not.toContain("Sign in");
    expect(container.textContent).toContain("Loading");
  });

  it("turns a page that throws into a branded error with Try again", async () => {
    const reset = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await render(createElement(ErrorPage, { error: new Error("boom"), reset }));
    expect(container.querySelector("nav")).not.toBeNull();
    expect(h1()).toEqual(["Something went wrong"]);
    expect(links()).toEqual([["Go home", "/"]]);
    const tryAgain = Array.from(container.querySelectorAll("main button")).find((b) => b.textContent === "Try again");
    act(() => (tryAgain as HTMLButtonElement).click());
    expect(reset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("gives an unknown path the site header and ways back", async () => {
    await render(createElement(NotFound));
    expect(container.querySelector("nav")).not.toBeNull();
    expect(h1()).toEqual(["Page not found"]);
    expect(links()).toEqual([
      ["Play the climb", "/play"],
      ["Go home", "/"],
    ]);
  });
});
