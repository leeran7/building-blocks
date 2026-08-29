/**
 * On-screen control hold state.
 *
 * Pointer/key have a press/release pair; AT typically synthesises a click,
 * which must toggle. The click the browser fires after pointerup must not, or
 * a tap would press and immediately release — and a click that arrives in a
 * later task must not latch the control on (b526fdb).
 */

import { describe, it, expect } from "vitest";
import {
  GHOST_CLICK_WINDOW_MS,
  initialHoldMemo,
  isHoldKey,
  reduceHold,
  touchInputFromHeld,
} from "../../src/components/Game/touchHold";

describe("reduceHold: pointer press/release", () => {
  it("holds while pressed and clears on release", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "left" }, 0);
    expect(touchInputFromHeld(memo.held).left).toBe(true);

    memo = reduceHold(memo, { kind: "release", id: "left" }, 1);
    expect(touchInputFromHeld(memo.held).left).toBe(false);
  });

  it("does not treat the browser's follow-up click as a toggle", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 1);
    memo = reduceHold(memo, { kind: "activate", id: "jump" }, 1);

    expect(touchInputFromHeld(memo.held).jump).toBe(false);
  });

  it("does not latch when the compatibility click arrives after release, inside the ghost-click window", () => {
    // Regression for b526fdb: clear-suppress ran on a microtask, so a click
    // dispatched in a later task (or after the ~300 ms iOS delay) toggled the
    // control ON with no pointerup to clear it.
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "climb" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "climb" }, 5);
    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 6);
    expect(touchInputFromHeld(memo.held).up).toBe(false);

    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 5 + 300);
    expect(touchInputFromHeld(memo.held).up).toBe(false);

    memo = reduceHold(
      memo,
      { kind: "activate", id: "climb" },
      5 + GHOST_CLICK_WINDOW_MS - 1
    );
    expect(touchInputFromHeld(memo.held).up).toBe(false);
  });

  it("does not consume the window on a suppressed activate", () => {
    // Some browsers fire click twice. Consuming suppress on the first one
    // would let the second latch the control on.
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "left" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "left" }, 1);
    memo = reduceHold(memo, { kind: "activate", id: "left" }, 2);
    memo = reduceHold(memo, { kind: "activate", id: "left" }, 3);
    expect(touchInputFromHeld(memo.held).left).toBe(false);
  });

  it("lets AT toggle once the ghost-click window has elapsed", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 4);
    memo = reduceHold(
      memo,
      { kind: "activate", id: "jump" },
      4 + GHOST_CLICK_WINDOW_MS
    );
    expect(touchInputFromHeld(memo.held).jump).toBe(true);
  });

  it("does not let a jump tap suppress a later climb activate", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 1);
    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 1);
    expect(touchInputFromHeld(memo.held).up).toBe(true);
  });
});

describe("reduceHold: assistive-tech click toggles", () => {
  it("a click with no preceding press latches the control on", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 0);
    expect(touchInputFromHeld(memo.held).up).toBe(true);

    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 1);
    expect(touchInputFromHeld(memo.held).up).toBe(false);
  });
});

describe("reduceHold: keyboard", () => {
  it("Space and Enter are hold keys; letters are not", () => {
    expect(isHoldKey(" ")).toBe(true);
    expect(isHoldKey("Enter")).toBe(true);
    expect(isHoldKey("a")).toBe(false);
  });

  it("keydown holds and keyup releases, same as a pointer", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "right" }, 0);
    expect(touchInputFromHeld(memo.held).right).toBe(true);
    memo = reduceHold(memo, { kind: "release", id: "right" }, 1);
    expect(touchInputFromHeld(memo.held).right).toBe(false);
  });
});
