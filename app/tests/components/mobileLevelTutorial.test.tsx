/**
 * The level tutorial on the mobile level screen: it plays once per device
 * before level 1 and before each level that introduces a power-up, can be
 * skipped, and replays from "How to play".
 *
 * @vitest-environment happy-dom
 */

import { act, useEffect } from "react";
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
// The canvas painter needs a real 2D context; the demo's engine still runs.
vi.mock("@app/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../mobile/src/components/levels/LevelRun", async () => {
  const { createElement: h } = await import("react");
  return {
    LevelRun: (props: { onHowToPlay?: () => void }) =>
      h("button", { onClick: props.onHowToPlay, disabled: !props.onHowToPlay }, "stub-how-to-play"),
  };
});

import { LevelsProvider } from "../../mobile/src/contexts/LevelsContext";
import { createMockLevelsClient } from "../../mobile/src/lib/levels/mockClient";
import type { LevelsClient } from "../../mobile/src/lib/levels/model";
import { LevelMapScreen } from "../../mobile/src/screens/LevelMapScreen";
import { LevelPlayScreen } from "../../mobile/src/screens/LevelPlayScreen";
import { unseenTutorials } from "../../mobile/src/lib/levels/tutorialSeen";
import { TICK_HZ } from "../../src/game/types";
import { MAX_DEMO_TICKS } from "../../src/game/levels/tutorial";

let container: HTMLDivElement;
let root: Root;
let where = "";

function Where() {
  const loc = useLocation();
  useEffect(() => {
    where = loc.pathname;
  }, [loc]);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
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
      level: n,
      finishedTick: 3 * TICK_HZ,
      raceTicks: 3 * TICK_HZ,
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

async function renderPlay(client: LevelsClient, path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <LevelsProvider client={client}>
          <Where />
          <Routes>
            <Route path="/" element={<LevelMapScreen />} />
            <Route path="/levels/:level/play" element={<LevelPlayScreen />} />
          </Routes>
        </LevelsProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

const tutorial = () => container.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
const heading = () => tutorial()?.querySelector("h2")?.textContent;
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("level tutorial", () => {
  it("plays the basics before level 1, once", async () => {
    const client = memoryClient();
    await renderPlay(client, "/levels/1/play?practice=1");
    expect(heading()).toBe("How to climb");
    expect(tutorial()?.textContent).toContain("Cross sides");
    expect(tutorial()?.textContent).toContain("Climb ladders");
    // The first step is the one showing.
    expect(tutorial()?.querySelector('[aria-current="step"]')?.textContent).toContain("Cross sides");

    await click(button("Let’s climb"));
    expect(tutorial()).toBeNull();
    expect(unseenTutorials(["basics"])).toEqual([]);

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderPlay(client, "/levels/1/play?practice=1");
    expect(tutorial()).toBeNull();
  });

  it("shows no tutorial on a level with nothing new", async () => {
    await renderPlay(memoryClient(), "/levels/2/play?practice=1");
    expect(where).toBe("/levels/2/play");
    expect(tutorial()).toBeNull();
  });

  it("plays the new power-up before the level that introduces it", async () => {
    const client = memoryClient();
    await clearLevels(client, 3);
    await renderPlay(client, "/levels/4/play?practice=1");
    expect(heading()).toBe("New power-up: Rapid Climb");
    expect(tutorial()?.textContent).toContain("Grab the orb");
  });

  it("Skip closes it for good, and How to play replays it", async () => {
    await renderPlay(memoryClient(), "/levels/1/play?practice=1");
    await click(button("Skip"));
    expect(tutorial()).toBeNull();
    expect(unseenTutorials(["basics"])).toEqual([]);

    await click(button("stub-how-to-play"));
    expect(heading()).toBe("How to climb");
  });

  it("captions each step as the demo reaches it, then offers Watch again", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    await renderPlay(memoryClient(), "/levels/1/play?practice=1");
    expect(button("Watch again")).toBeUndefined();
    // Run the demo to its end on the engine's clock.
    for (let i = 0; i < MAX_DEMO_TICKS && !button("Watch again"); i++) {
      await act(async () => {
        vi.advanceTimersByTime(16 * 4);
      });
    }
    const steps = tutorial()!.querySelectorAll("ol li");
    expect(steps).toHaveLength(2);
    // Both steps shown and ticked off.
    expect([...steps].every((li) => li.textContent?.startsWith("✓"))).toBe(true);
    expect(button("Watch again")).toBeTruthy();

    await click(button("Watch again"));
    expect(button("Watch again")).toBeUndefined();
    expect(tutorial()?.querySelector('[aria-current="step"]')?.textContent).toContain("Cross sides");
  });
});
