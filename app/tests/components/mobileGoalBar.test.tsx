/**
 * The level goal bar (mobile/src/components/levels/LevelRun.tsx GoalBar)
 * marks the best failed attempt when it came close (design §6.2).
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GoalBar } from "../../mobile/src/components/levels/LevelRun";
import { ExpeditionHud } from "../../src/components/Game/ExpeditionHud";
import type { PlayerState } from "../../src/game/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const pars = { twoStarMs: 60_000, threeStarMs: 40_000, oneStarMs: null };

function render(bestFailFt: number | null) {
  act(() =>
    root.render(
      <GoalBar peakFt={20} goalFt={200} elapsedMs={1000} pars={pars} practice={false} bestFailFt={bestFailFt} />,
    ),
  );
}

describe("GoalBar best-fail marker", () => {
  it("draws the marker at the best try's share of the goal", () => {
    render(190);
    const mark = container.querySelector<HTMLElement>('[data-testid="best-fail-marker"]');
    expect(mark?.style.left).toBe("calc(95% - 1px)");
    expect(container.textContent).toContain("Your best try reached 190");
  });

  it("draws nothing without one", () => {
    render(null);
    expect(container.querySelector('[data-testid="best-fail-marker"]')).toBeNull();
  });
});

describe("GoalBar in the HUD", () => {
  const goal = (goalFt = 200) => (
    <GoalBar peakFt={20} goalFt={goalFt} elapsedMs={1000} pars={pars} practice={false} />
  );
  function renderHud(powers: string[]) {
    const player = { y: 50, peakY: 50, activePowerUps: powers.map((type) => ({ type, startTick: 0, durationTicks: 600 })) } as unknown as PlayerState;
    act(() =>
      root.render(
        <ExpeditionHud
          player={player}
          hazardY={0}
          tick={60}
          lavaPhase="surge"
          lavaPhaseProgress={0}
          muted={false}
          onToggleMute={() => {}}
          announcement=""
          runId={1}
          goal={goal()}
        />,
      ),
    );
  }

  it("puts the stars and progress first, with power-up timers after them", () => {
    renderHud(["giant", "super-jump"]);
    const hud = container.querySelector(".exp-hud");
    expect(hud?.hasAttribute("data-has-goal")).toBe(true);
    const bar = container.querySelector("[data-goal-bar]");
    const powers = container.querySelector(".exp-powers");
    expect(bar && powers).toBeTruthy();
    expect(bar!.compareDocumentPosition(powers!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the summit in whole feet", () => {
    act(() => root.render(goal(295.367)));
    expect(container.textContent).toContain("Summit 295 ");
    expect(container.textContent).not.toContain("295.367");
  });
});
