/**
 * RV-DC-3 (web), what the page shows once today's tower replaces yesterday's:
 * yesterday's result pill is gone and "Next tower in" counts down to the NEW
 * reset. Without this, a player who crosses 00:00 UTC on the results card
 * sees yesterday's streak pill over today's tower and a countdown of "<1m".
 *
 * ClimbScene is stubbed to render the extras DailyClimbClient hands it; fetch
 * is mocked; only Date is faked (the minute ticker never fires here, so the
 * countdown can change only through the rollover itself).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface SceneProps {
  seed?: string;
  onBeforeStart?: () => boolean;
  onFinish?: (peakY: number) => void;
  resultExtra?: ReactNode;
}

const scene = vi.hoisted(() => ({ props: [] as SceneProps[] }));
vi.mock("../../src/components/Game/ClimbScene", () => ({
  ClimbScene: (props: SceneProps) => {
    scene.props.push(props);
    return createElement("div", { "data-testid": "scene" }, createElement("div", { "data-testid": "result-extra" }, props.resultExtra ?? null));
  },
}));
vi.mock("../../src/components/Game/ClimbControlsGuide", () => ({ ClimbControlsGuide: () => null }));

import { DailyClimbClient } from "../../src/components/Game/DailyClimbClient";

// `now` is the server clock at answer time (the device reads the same in beforeEach).
const OLD = { day: "2026-09-26", seed: "daily1-OldOldOldOldOldOldOldO", resetsAt: "2026-09-27T00:00:00.000Z", now: "2026-09-26T23:59:00.000Z" };
const NEW = { day: "2026-09-27", seed: "daily1-NewNewNewNewNewNewNewN", resetsAt: "2026-09-28T00:00:00.000Z", now: "2026-09-27T00:00:30.000Z" };

const net = vi.hoisted(() => ({ body: null as unknown }));
const fetchMock = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, json: async () => net.body }) as Response);

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

const last = () => scene.props[scene.props.length - 1];
const resultExtraText = () => container!.querySelector('[data-testid="result-extra"]')?.textContent ?? "";
/** The "Next tower in" value in the page header. */
const nextTowerIn = () => {
  const label = [...container!.querySelectorAll("p")].find((p) => p.textContent === "Next tower in");
  return label?.nextElementSibling?.textContent ?? null;
};

beforeEach(() => {
  // Both clocks are frozen: the countdown now counts the server timeline
  // down by elapsed time, which reads the monotonic clock too (RV-DCF-6).
  vi.useFakeTimers({ toFake: ["Date", "performance"] });
  vi.setSystemTime(new Date("2026-09-26T23:59:00Z"));
  scene.props = [];
  net.body = OLD;
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

describe("web Daily Climb: the page after today's tower replaces yesterday's", () => {
  it("yesterday's result pill is cleared and the countdown targets the new reset", async () => {
    await mount();
    expect(nextTowerIn()).toBe("1m");
    await act(async () => last().onFinish!(7));
    // Precondition: yesterday's result is on the card.
    expect(resultExtraText()).toContain("streak");

    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.body = NEW;
    let started = true;
    await act(async () => {
      started = last().onBeforeStart!();
    });
    await settle();
    expect(started).toBe(false);
    expect(last().seed).toBe(NEW.seed);

    expect(resultExtraText()).toBe("");
    expect(nextTowerIn()).toBe("23h 59m");
  });

  it("control: a refetch that returns the SAME day (fast device clock) keeps the result pill", async () => {
    await mount();
    await act(async () => last().onFinish!(7));
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    // The server has not reset yet.
    await act(async () => {
      last().onBeforeStart!();
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(last().seed).toBe(OLD.seed);
    expect(resultExtraText()).toContain("streak");
  });
});
