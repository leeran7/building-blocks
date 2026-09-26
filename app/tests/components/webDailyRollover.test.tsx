/**
 * RV-DC-3 (web): "Climb again" after 00:00 UTC must not replay yesterday's
 * tower. DailyClimbClient refuses the start once the server's reset has
 * passed since the seed was fetched, refetches, holds the button meanwhile,
 * and hands ClimbScene today's seed. The device clock may run a little ahead
 * of the server: after one refetch it plays whatever the server says.
 *
 * ClimbScene is stubbed to record its props; fetch is mocked; only Date is
 * faked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface SceneProps {
  seed?: string;
  onBeforeStart?: () => boolean;
  startBlockedLabel?: string | null;
  onFinish?: (peakY: number) => void;
}

const scene = vi.hoisted(() => ({ props: [] as SceneProps[] }));
vi.mock("../../src/components/Game/ClimbScene", () => ({
  ClimbScene: (props: SceneProps) => {
    scene.props.push(props);
    return createElement("div", { "data-testid": "scene" }, `seed:${props.seed}`);
  },
}));
vi.mock("../../src/components/Game/ClimbControlsGuide", () => ({ ClimbControlsGuide: () => null }));

import { DailyClimbClient } from "../../src/components/Game/DailyClimbClient";

// `now` is the server clock at answer time (the device reads the same in beforeEach).
const OLD = { day: "2026-09-26", seed: "daily1-OldOldOldOldOldOldOldO", resetsAt: "2026-09-27T00:00:00.000Z", now: "2026-09-26T23:59:00.000Z" };
const NEW = { day: "2026-09-27", seed: "daily1-NewNewNewNewNewNewNewN", resetsAt: "2026-09-28T00:00:00.000Z", now: "2026-09-27T00:00:30.000Z" };

const net = vi.hoisted(() => ({ body: null as unknown, fail: false, held: [] as Array<() => void>, hold: false }));
const fetchMock = vi.fn(async (): Promise<Response> => {
  const answer = (): Response => {
    if (net.fail) throw new TypeError("offline");
    return { ok: true, status: 200, json: async () => net.body } as Response;
  };
  if (net.hold) return new Promise<Response>((resolve, reject) => net.held.push(() => {
    try {
      resolve(answer());
    } catch (e) {
      reject(e);
    }
  }));
  return answer();
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

const last = () => scene.props.at(-1)!;
const askStart = async (): Promise<boolean> => {
  let ok = false;
  await act(async () => {
    ok = last().onBeforeStart!();
  });
  await settle();
  return ok;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T23:59:00Z"));
  scene.props = [];
  net.body = OLD;
  net.fail = false;
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

describe("web Daily Climb across 00:00 UTC (RV-DC-3)", () => {
  it("control: before the reset a start goes ahead on the fetched seed with no refetch", async () => {
    await mount();
    expect(last().seed).toBe(OLD.seed);
    expect(await askStart()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after the reset the start is refused, the tower is refetched, and today's seed replaces it", async () => {
    await mount();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.body = NEW;
    net.hold = true;
    expect(await askStart()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Held: the button waits and the old seed is not playable.
    expect(last().startBlockedLabel).toBe("Loading today’s tower…");
    await act(async () => net.held.splice(0).forEach((go) => go()));
    await settle();
    expect(last().seed).toBe(NEW.seed);
    expect(last().startBlockedLabel).toBeNull();
    expect(await askStart()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a finished run on the new tower commits to the new day", async () => {
    await mount();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.body = NEW;
    await askStart();
    await act(async () => last().onFinish!(7));
    const store = JSON.parse(localStorage.getItem("doomstack.daily.v1") ?? "{}") as { lastPlayedKey?: string };
    expect(store.lastPlayedKey).toBe(NEW.day);
  });

  it("a device clock ahead of the server refetches once, then plays the server's answer", async () => {
    await mount();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    // The server has not reset yet and still names the old tower.
    expect(await askStart()).toBe(false);
    expect(last().seed).toBe(OLD.seed);
    expect(await askStart()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a device clock 2 min fast that refetched just before the real reset still gets today's tower 3 h later (V-DC-2)", async () => {
    await mount();
    // Device 00:00:30, server 23:58:30: the refetch still names yesterday.
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.body = { ...OLD, now: "2026-09-26T23:58:30.000Z" };
    expect(await askStart()).toBe(false);
    expect(await askStart()).toBe(true);
    expect(last().seed).toBe(OLD.seed);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Three hours later the server has reset: the start refetches today's tower.
    vi.setSystemTime(new Date("2026-09-27T03:00:30Z"));
    net.body = { ...NEW, now: "2026-09-27T02:58:30.000Z" };
    expect(await askStart()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(last().seed).toBe(NEW.seed);
    expect(await askStart()).toBe(true);
  });

  it("if the refetch fails, the closed tower is not playable: the page offers Try again", async () => {
    await mount();
    vi.setSystemTime(new Date("2026-09-27T00:00:30Z"));
    net.fail = true;
    expect(await askStart()).toBe(false);
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain("Can’t load today’s tower");
    expect(container!.querySelector('[data-testid="scene"]')).toBeNull();
  });
});
