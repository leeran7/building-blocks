/**
 * useRunMoments + RunCallout: the hook turns render snapshots into an
 * on-screen callout, fires onMoment once per moment, and clears itself.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALLOUT_MS, RunCallout, useRunMoments } from "../../src/components/Game/RunCallout";
import type { MomentInput, RunMoment } from "../../src/components/Game/runMoments";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ input, onMoment }: { input: MomentInput; onMoment?: (m: RunMoment) => void }) {
  const callout = useRunMoments(input, onMoment);
  return createElement(RunCallout, { callout });
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const base: MomentInput = { runId: 1, tick: 0, live: true, peakY: 0, clearance: 100 };
const render = (input: Partial<MomentInput>, onMoment?: (m: RunMoment) => void) =>
  act(() => root.render(createElement(Harness, { input: { ...base, ...input }, onMoment })));
const shown = () => container.querySelector(".exp-callout");

describe("RunCallout", () => {
  it("pops a milestone, fires onMoment once, and clears after the animation", () => {
    const onMoment = vi.fn();
    render({ tick: 1, peakY: 20 }, onMoment);
    expect(shown()).toBeNull();
    render({ tick: 2, peakY: 51 }, onMoment);
    expect(shown()?.getAttribute("data-kind")).toBe("milestone");
    expect(shown()?.textContent).toContain("50 ft");
    render({ tick: 3, peakY: 52 }, onMoment);
    expect(onMoment).toHaveBeenCalledTimes(1);
    expect(onMoment).toHaveBeenCalledWith({ kind: "milestone", altitude: 50 });
    act(() => vi.advanceTimersByTime(CALLOUT_MS));
    expect(shown()).toBeNull();
  });

  it("says nothing outside a live run", () => {
    const onMoment = vi.fn();
    render({ tick: 1, live: false, peakY: 120 }, onMoment);
    expect(shown()).toBeNull();
    expect(onMoment).not.toHaveBeenCalled();
  });

  it("a throwing onMoment doesn't break the callout", () => {
    render({ tick: 1, peakY: 60 }, () => {
      throw new Error("audio gone");
    });
    expect(shown()).not.toBeNull();
  });

  it("a new run clears a callout still on screen", () => {
    render({ tick: 1, peakY: 60 });
    expect(shown()).not.toBeNull();
    render({ runId: 2, tick: 0, peakY: 0 });
    expect(shown()).toBeNull();
  });
});
