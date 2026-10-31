/**
 * ClimbScene's start gate, used by Daily Climb for RV-DC-3: onBeforeStart is
 * asked before every live start and can cancel it; while startBlockedLabel is
 * set the button is disabled and says why. The real ClimbScene renders with
 * a stubbed useClimb whose start() is counted.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, token: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: vi.fn(), announcement: "", unlockAudio: vi.fn() }),
}));

const game = vi.hoisted(() => ({ starts: 0, finished: false }));
vi.mock("../../src/game/useClimb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/useClimb")>();
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  return {
    ...actual,
    useClimb: () => {
      const state = createMatch({ seed: "s", mode: "solo", tower: buildFreeTower(), playerIds: ["you"] });
      state.phase = game.finished ? "results" : "lobby";
      return {
        state,
        simRef: { current: state },
        renderFeed: { current: { prev: state, next: state, at: 0 } },
        start: () => {
          game.starts++;
        },
        finished: game.finished,
        setTouch: () => {},
        runId: 1,
        inputLog: [],
        replaying: false,
        transport: null,
        togglePlayPause: () => {},
        cycleSpeed: () => {},
        rewind: () => {},
        seekToTick: () => {},
        restartReplay: () => {},
      };
    },
  };
});

import { ClimbScene, type ClimbSceneProps } from "../../src/components/Game/ClimbScene";
import { buildFreeTower } from "../../src/game/freeStack";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(props: Partial<ClimbSceneProps>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ClimbScene, { tower: buildFreeTower(), categoryLabel: "Daily", ...props }));
  });
}

const startButton = (label: string) =>
  [...container!.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

beforeEach(() => {
  game.starts = 0;
  game.finished = false;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ClimbScene start gate", () => {
  it.each([
    ["the lobby", false, "Start climb"],
    ["the results card", true, "Climb again"],
  ])("in %s, onBeforeStart returning false cancels the start", async (_where, finished, label) => {
    game.finished = finished;
    const onBeforeStart = vi.fn(() => false);
    await render({ onBeforeStart });
    await act(async () => startButton(label)!.click());
    expect(onBeforeStart).toHaveBeenCalledTimes(1);
    expect(game.starts).toBe(0);
  });

  it("control: onBeforeStart returning true starts the run", async () => {
    await render({ onBeforeStart: () => true });
    await act(async () => startButton("Start climb")!.click());
    expect(game.starts).toBe(1);
  });

  it("while blocked the button is disabled, says why, and starts nothing", async () => {
    const onBeforeStart = vi.fn(() => true);
    await render({ onBeforeStart, startBlockedLabel: "Loading today’s tower…" });
    const button = startButton("Loading today’s tower…");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
    await act(async () => button!.click());
    expect(game.starts).toBe(0);
    expect(onBeforeStart).not.toHaveBeenCalled();
  });
});

describe("ClimbScene lobby controls (Leeran, 2026-10-31, mockup C)", () => {
  // The overlay card names each control on its own row ("Move", "Jump",
  // "Climb" labels); the hint is one line naming all three.
  const cardLabels = () =>
    [...container!.querySelectorAll("li span")].map((s) => s.textContent).filter((t) => t === "Move" || t === "Jump");

  it("shows the full keyboard card by default (the landing demo has no tab bar)", async () => {
    await render({});
    expect(cardLabels().length).toBeGreaterThan(0);
  });

  it('shows only the one-line hint with lobbyControls="hint" (/play, /daily)', async () => {
    await render({ lobbyControls: "hint" });
    expect(cardLabels()).toEqual([]);
    expect(container!.textContent).toMatch(/jump/i);
    expect(container!.textContent).toMatch(/ladders/i);
  });
});
