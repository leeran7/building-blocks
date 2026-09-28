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

const pars = { twoStarMs: 60_000, threeStarMs: 40_000 };

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
