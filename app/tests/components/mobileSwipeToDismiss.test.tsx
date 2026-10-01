/**
 * Swipe a bottom sheet down to close it (useSwipeToDismiss), driven with real
 * touch events: a long drag or a flick closes it, a short slow drag springs
 * back, and a sheet scrolled down scrolls instead of closing.
 *
 * @vitest-environment happy-dom
 */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduced }));

import { useSwipeToDismiss } from "../../mobile/src/hooks/useSwipeToDismiss";

let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn<() => void>>;
let onPress: ReturnType<typeof vi.fn<() => void>>;

function Sheet() {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);
  return (
    <div>
      <div ref={scrimRef} data-testid="scrim" />
      <div ref={sheetRef} data-testid="sheet">
        <div data-sheet-grabber data-testid="grabber" />
        <button type="button" onClick={onPress}>
          Play
        </button>
      </div>
    </div>
  );
}

const $ = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

let clock = 0;
function touch(el: HTMLElement, type: string, y: number, x = 100, dt = 16) {
  clock += dt;
  const point = { clientX: x, clientY: y, identifier: 0, target: el };
  const list = type === "touchend" || type === "touchcancel" ? [] : [point];
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    touches: { value: list },
    timeStamp: { value: clock },
  });
  act(() => {
    el.dispatchEvent(ev);
  });
  return ev;
}

/** Drags from y=100 down to `to` in even steps of `dt` ms, then lets go. */
function drag(el: HTMLElement, to: number, { steps = 10, dt = 16 } = {}) {
  touch(el, "touchstart", 100, 100, 0);
  let moved: Event | undefined;
  for (let i = 1; i <= steps; i++) moved = touch(el, "touchmove", 100 + ((to - 100) * i) / steps, 100, dt);
  touch(el, "touchend", to, 100, dt);
  return moved!;
}

beforeEach(() => {
  vi.useFakeTimers();
  motion.reduced = false;
  onClose = vi.fn<() => void>();
  onPress = vi.fn<() => void>();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Sheet />));
  Object.defineProperty($("sheet"), "offsetHeight", { value: 600, configurable: true });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("swipe down to close a sheet", () => {
  it("follows the finger, fades the scrim, and closes after a long drag", () => {
    const sheet = $("sheet");
    touch(sheet, "touchstart", 100, 100, 0);
    const move = touch(sheet, "touchmove", 250);
    expect(move.defaultPrevented).toBe(true);
    expect(sheet.style.transform).toMatch(/^translateY\(\d+(\.\d+)?px\)$/);
    expect(Number($("scrim").style.opacity)).toBeLessThan(1);
    // Slow, so only the distance counts.
    touch(sheet, "touchmove", 251, 100, 500);
    touch(sheet, "touchend", 251, 100, 500);
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs back from a short, slow drag", () => {
    const sheet = $("sheet");
    drag(sheet, 150, { steps: 5, dt: 200 });
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
  });

  it("closes on a short fast flick", () => {
    drag($("sheet"), 160, { steps: 3, dt: 10 });
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores upward and sideways drags", () => {
    const sheet = $("sheet");
    const up = drag(sheet, 20);
    const side = (() => {
      touch(sheet, "touchstart", 100, 100, 0);
      const m = touch(sheet, "touchmove", 130, 250);
      touch(sheet, "touchend", 130, 250);
      return m;
    })();
    act(() => vi.advanceTimersByTime(500));
    expect(up.defaultPrevented).toBe(false);
    expect(side.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets a scrolled sheet scroll back up, but the grabber still drags it", () => {
    const sheet = $("sheet");
    sheet.scrollTop = 120;
    Object.defineProperty(sheet, "scrollTop", { value: 120, configurable: true });
    const scroll = drag(sheet, 400);
    act(() => vi.advanceTimersByTime(500));
    expect(scroll.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    drag($("grabber"), 400);
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not press the button the drag ends on", () => {
    const play = container.querySelector("button")!;
    drag(play, 400);
    act(() => play.click());
    expect(onPress).not.toHaveBeenCalled();
    // A plain tap afterwards still works.
    act(() => vi.advanceTimersByTime(500));
    act(() => play.click());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("closes at once, without the slide, under Reduce Motion", () => {
    motion.reduced = true;
    drag($("sheet"), 400);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
