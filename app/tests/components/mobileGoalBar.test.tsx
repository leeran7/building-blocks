/**
 * The level goal bar (mobile/src/components/levels/LevelRun.tsx GoalBar)
 * marks the best failed attempt when it came close (design §6.2).
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExpeditionHud } from "../../src/components/Game/ExpeditionHud";
import type { PlayerState } from "../../src/game/types";
import { GoalBar } from "../../mobile/src/components/levels/LevelRun";

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

function render(bestFailFt: number | null, goalFt = 200) {
  act(() =>
    root.render(
      <GoalBar peakFt={20} goalFt={goalFt} elapsedMs={1000} pars={pars} practice={false} bestFailFt={bestFailFt} />,
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

describe("GoalBar summit label", () => {
  it("shows the summit in whole feet", () => {
    render(null, 299.286);
    expect(container.textContent).toContain("Summit 299 ft");
    expect(container.textContent).not.toContain("299.286");
  });
});

describe("GoalBar in the HUD", () => {
  // Two live powers: the stack the goal bar used to be drawn on top of.
  const player = {
    y: 10,
    activePowerUps: [
      { type: "rapid-climb", startTick: 0, durationTicks: 600 },
      { type: "giant", startTick: 0, durationTicks: 1200 },
    ],
  } as unknown as PlayerState;

  function renderHud(goal: boolean) {
    act(() =>
      root.render(
        <ExpeditionHud
          player={player}
          hazardY={0}
          tick={1}
          lavaPhase="surge"
          lavaPhaseProgress={0}
          muted={false}
          onToggleMute={() => {}}
          announcement=""
          runId={1}
          goal={goal ? <GoalBar peakFt={20} goalFt={200} elapsedMs={1000} pars={pars} practice={false} /> : null}
        />,
      ),
    );
  }

  it("puts the goal bar in its own row before the active powers, not over them", () => {
    renderHud(true);
    const hud = container.firstElementChild as HTMLElement;
    const rows = [...hud.children];
    const goalRow = rows.findIndex((el) => el.querySelector('[aria-label="Progress to the summit"]'));
    const powers = rows.findIndex((el) => el.getAttribute("aria-label") === "Active powers");
    expect(goalRow).toBeGreaterThanOrEqual(0);
    expect(powers).toBeGreaterThan(goalRow);
    expect(rows[powers]?.contains(rows[goalRow] ?? null)).toBe(false);
    expect(hud.hasAttribute("data-goal")).toBe(true);
  });

  it("leaves the HUD as it was without one", () => {
    renderHud(false);
    const hud = container.firstElementChild as HTMLElement;
    expect(hud.hasAttribute("data-goal")).toBe(false);
    expect(hud.querySelector('[aria-label="Progress to the summit"]')).toBeNull();
  });
});
