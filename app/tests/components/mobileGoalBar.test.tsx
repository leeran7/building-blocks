/**
 * The level goal bar (mobile/src/components/levels/LevelRun.tsx GoalBar)
 * marks the best failed attempt when it came close (design §6.2).
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GOAL_BAR_HUD_GAP, GOAL_BAR_OFFSET, GoalBar, goalBarTop } from "../../mobile/src/components/levels/LevelRun";

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
      <GoalBar topInset={0} peakFt={20} goalFt={200} elapsedMs={1000} pars={pars} practice={false} bestFailFt={bestFailFt} />,
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

describe("GoalBar placement under the HUD", () => {
  /** A HUD beside the bar whose bottom edge sits `bottom` px below the container's top. */
  function renderWithHud(bottom: number | null, goalFt = 200) {
    act(() =>
      root.render(
        <>
          {bottom !== null && <div className="exp-hud" />}
          <GoalBar topInset={20} peakFt={20} goalFt={goalFt} elapsedMs={1000} pars={pars} practice={false} />
        </>,
      ),
    );
  }

  beforeEach(() => {
    container.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;
  });

  it("drops below the HUD when an active power-up's timer makes it taller", () => {
    const hudBottom = 240;
    const proto = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return this.classList.contains("exp-hud") ? ({ top: 20, bottom: hudBottom } as DOMRect) : proto.call(this);
    };
    try {
      renderWithHud(hudBottom);
      const bar = container.querySelector<HTMLElement>("[data-goal-bar]");
      expect(bar?.style.top).toBe(`${hudBottom + GOAL_BAR_HUD_GAP}px`);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = proto;
    }
  });

  it("keeps its resting place when the HUD is short, or absent", () => {
    expect(goalBarTop(20, 60)).toBe(20 + GOAL_BAR_OFFSET);
    expect(goalBarTop(20, null)).toBe(20 + GOAL_BAR_OFFSET);
    renderWithHud(null);
    expect(container.querySelector<HTMLElement>("[data-goal-bar]")?.style.top).toBe(`${20 + GOAL_BAR_OFFSET}px`);
  });

  it("shows the summit in whole feet", () => {
    renderWithHud(null, 295.367);
    expect(container.textContent).toContain("Summit 295 ");
    expect(container.textContent).not.toContain("295.367");
  });
});
