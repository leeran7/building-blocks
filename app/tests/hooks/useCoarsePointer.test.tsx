/**
 * useCoarsePointer must answer on the very first client render: a page reached
 * by in-app navigation paints from that render, so a flag that flipped in an
 * effect painted the mouse layout first and then swapped it (the /climb
 * controls guide shrank 74px after arriving on a phone).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoarsePointer } from "../../src/hooks/useCoarsePointer";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function stubPointer(coarse: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    get matches() {
      return coarse;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.spyOn(window, "matchMedia").mockImplementation((q: string) => {
    expect(q).toBe("(pointer: coarse)");
    return mq as unknown as MediaQueryList;
  });
  return {
    set(next: boolean) {
      coarse = next;
      listeners.forEach((fn) => fn());
    },
  };
}

function Probe({ seen }: { seen: boolean[] }) {
  seen.push(useCoarsePointer());
  return null;
}

afterEach(() => vi.restoreAllMocks());

describe("useCoarsePointer", () => {
  it("is already true on the first render of a touch device", () => {
    stubPointer(true);
    const seen: boolean[] = [];
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe, { seen })));
    expect(seen[0]).toBe(true);
    expect(seen).not.toContain(false);
    act(() => root.unmount());
  });

  it("is false on the first render of a mouse device", () => {
    stubPointer(false);
    const seen: boolean[] = [];
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe, { seen })));
    expect(seen).toEqual([false]);
    act(() => root.unmount());
  });

  it("follows a pointer change (a tablet docking a mouse)", () => {
    const pointer = stubPointer(true);
    const seen: boolean[] = [];
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe, { seen })));
    act(() => pointer.set(false));
    expect(seen.at(-1)).toBe(false);
    act(() => root.unmount());
  });

  it("server-renders as mouse, since the server can't know the pointer", () => {
    stubPointer(true);
    const seen: boolean[] = [];
    renderToString(createElement(Probe, { seen }));
    expect(seen).toEqual([false]);
  });
});
