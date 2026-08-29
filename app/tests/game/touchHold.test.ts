/**
 * On-screen control hold state.
 *
 * Pointer/key have a press/release pair. AT typically synthesises a click,
 * which must toggle — but the delayed click after pointerup on mobile must
 * not, or a tap would press and then latch on.
 */

import { describe, it, expect } from "vitest";
import {
  CLICK_GUARD_MS,
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

    memo = reduceHold(memo, { kind: "release", id: "left" }, 10);
    expect(touchInputFromHeld(memo.held).left).toBe(false);
  });

  it("maps D-pad controls to movement and climb axes", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "climb" }, 0);
    expect(touchInputFromHeld(memo.held).up).toBe(true);

    memo = reduceHold(memo, { kind: "release", id: "climb" }, 10);
    memo = reduceHold(memo, { kind: "press", id: "down" }, 20);
    expect(touchInputFromHeld(memo.held).down).toBe(true);
  });

  it("does not treat the browser's follow-up click as a toggle", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 10);
    memo = reduceHold(memo, { kind: "activate", id: "jump" }, 11);

    expect(touchInputFromHeld(memo.held).jump).toBe(false);
  });

  it("does not latch from an iOS-delayed click after the old microtask gap", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 10);
    // iOS often delivers click ~300ms later — well after a microtask.
    memo = reduceHold(memo, { kind: "activate", id: "jump" }, 310);

    expect(touchInputFromHeld(memo.held).jump).toBe(false);
  });

  it("still lets AT toggle after the click-guard window", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 10);
    memo = reduceHold(memo, { kind: "activate", id: "jump" }, 10 + CLICK_GUARD_MS);

    expect(touchInputFromHeld(memo.held).jump).toBe(true);
  });

  it("does not let a jump tap suppress a later climb activate", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" }, 0);
    memo = reduceHold(memo, { kind: "release", id: "jump" }, 10);
    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 11);
    expect(touchInputFromHeld(memo.held).up).toBe(true);
  });
});

describe("reduceHold: assistive-tech click toggles", () => {
  it("a click with no preceding press latches the control on", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "activate", id: "climb" }, 0);
    expect(touchInputFromHeld(memo.held).up).toBe(true);

    memo = reduceHold(memo, { kind: "activate", id: "climb" }, CLICK_GUARD_MS + 1);
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
    memo = reduceHold(memo, { kind: "release", id: "right" }, 10);
    expect(touchInputFromHeld(memo.held).right).toBe(false);
  });
});
