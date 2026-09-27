/**
 * RV-DCF-6 (web), verifier: the Daily page's "Resets in" (lobby) and "Next
 * tower in" (header) count down on the server's clock once today's answer is
 * stamped. Before the first answer they fall back to the device clock.
 *
 * The device clock runs 2 min fast: it reads 00:01:00 on the 27th while the
 * server says 23:59:00 on the 26th. The device clock alone would show
 * "23h 59m"; the server's minute shows "1m".
 *
 * ClimbScene is stubbed to render the lobby extras DailyClimbClient hands it.
 * Date, performance and setInterval are faked, so no real time leaks into the
 * countdown (it reads both clocks).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/components/Game/ClimbScene", () => ({
  ClimbScene: (props: { lobbyExtra?: ReactNode }) => createElement("div", { "data-testid": "lobby" }, props.lobbyExtra ?? null),
}));
vi.mock("../../src/components/Game/ClimbControlsGuide", () => ({ ClimbControlsGuide: () => null }));

import { DailyClimbClient } from "../../src/components/Game/DailyClimbClient";

const DEVICE_NOW = "2026-09-27T00:01:00Z"; // 2 min ahead of the server
const ANSWER = { day: "2026-09-26", seed: "daily1-OldOldOldOldOldOldOldO", resetsAt: "2026-09-27T00:00:00.000Z", now: "2026-09-26T23:59:00.000Z" };

const net = vi.hoisted(() => ({ held: [] as Array<() => void>, hold: false }));
const fetchMock = vi.fn(async (): Promise<Response> => {
  const answer = { ok: true, status: 200, json: async () => ANSWER } as Response;
  if (net.hold) return new Promise<Response>((resolve) => net.held.push(() => resolve(answer)));
  return answer;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(createElement(DailyClimbClient));
  });
  await settle();
}

const nextTowerIn = () => {
  const label = [...container!.querySelectorAll("p")].find((p) => p.textContent === "Next tower in");
  return label?.nextElementSibling?.textContent ?? null;
};
const lobbyResetsIn = () =>
  [...container!.querySelectorAll('[data-testid="lobby"] p')].map((p) => p.textContent ?? "").find((t) => t.startsWith("Resets in")) ?? null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(DEVICE_NOW));
  net.hold = false;
  net.held = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("web Daily countdown on the server's clock (RV-DCF-6)", () => {
  it("device 2 min fast, server at 23:59:00: the header and the lobby read 1m", async () => {
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(nextTowerIn()).toBe("1m");
    expect(lobbyResetsIn()).toBe("Resets in 1m");
  });

  it("before the first answer the header falls back to the device clock, then switches when the answer lands", async () => {
    net.hold = true;
    await mount();
    // No answer yet: the device clock's next 00:00 UTC.
    expect(nextTowerIn()).toBe("23h 59m");
    await act(async () => net.held.splice(0).forEach((go) => go()));
    await settle();
    expect(nextTowerIn()).toBe("1m");
    expect(lobbyResetsIn()).toBe("Resets in 1m");
  });

  it("the minute ticker keeps counting the server's timeline down", async () => {
    await mount();
    expect(nextTowerIn()).toBe("1m");
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    // The server's minute is up; the device clock would still say 23h 58m.
    expect(nextTowerIn()).toBe("<1m");
    expect(lobbyResetsIn()).toBe("Resets in <1m");
  });
});

describe("web Daily lobby copy (RV-DCF-5)", () => {
  it("names the Daily board with a capital D, like every other Daily string", async () => {
    await mount();
    const lobby = container!.querySelector('[data-testid="lobby"]')?.textContent ?? "";
    expect(lobby).toContain("One seed, one shot at the top of the Daily board");
    expect(lobby).not.toContain("daily board");
  });
});
