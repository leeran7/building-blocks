/**
 * useRetry: when the error panel shows. The screen tests in
 * tests/components/mobileRecoveryStates.test.tsx cover focus and requests on
 * the real screens; this pins the `hasData` guard, which act() hides there
 * because it batches "data arrived" and "retry settled" into one commit.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRetry, type UseRetry } from "../../mobile/src/hooks/useRetry";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let settle: (() => void) | null = null;

/** A refresh that stays in flight until `settle` is called. */
const heldRefresh = () =>
  new Promise<void>((resolve) => {
    settle = resolve;
  });

interface Props {
  failed: boolean;
  hasData: boolean;
}

/** Minimal renderHook: re-render with new props, read the latest return value. */
function renderRetry() {
  let latest: UseRetry | null = null;
  function Harness({ failed, hasData }: Props) {
    const headingRef = useRef<HTMLHeadingElement>(null);
    latest = useRetry(heldRefresh, { failed, hasData, focusOnRecover: headingRef });
    return createElement("h1", { ref: headingRef, tabIndex: -1 }, "Screen");
  }
  return {
    render(props: Props) {
      act(() => root.render(createElement(Harness, props)));
    },
    get current(): UseRetry {
      if (!latest) throw new Error("hook not rendered");
      return latest;
    },
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  settle = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useRetry showError", () => {
  it("stays true while a retry of a failed load is in flight", () => {
    const hook = renderRetry();
    hook.render({ failed: true, hasData: false });
    expect(hook.current.showError).toBe(true);

    act(() => void hook.current.retry());
    // The cache clears `error` the moment the cold refetch starts.
    hook.render({ failed: false, hasData: false });

    expect(hook.current.retrying).toBe(true);
    expect(hook.current.showError).toBe(true);
  });

  it("gives way to the content as soon as data arrives, before the retry settles", () => {
    const hook = renderRetry();
    hook.render({ failed: true, hasData: false });
    act(() => void hook.current.retry());
    hook.render({ failed: false, hasData: true });

    expect(hook.current.retrying).toBe(true);
    expect(hook.current.showError).toBe(false);
  });

  it("counts a settled attempt and ends the busy state", async () => {
    const hook = renderRetry();
    hook.render({ failed: true, hasData: false });
    act(() => void hook.current.retry());
    await act(async () => settle?.());

    expect(hook.current.retrying).toBe(false);
    expect(hook.current.attempts).toBe(1);
    expect(hook.current.showError).toBe(true);
  });
});
