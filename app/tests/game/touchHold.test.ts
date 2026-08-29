/**
 * On-screen control hold state.
 *
 * The touch buttons used to wire only pointer events. Keyboard, VoiceOver and
 * TalkBack all reach a real <button> and then got nothing. Pointer/key have a
 * press/release pair; AT typically synthesises a click, which must toggle —
 * but the click the browser fires after pointerup must not, or a tap would
 * press and immediately release.
 */

import { describe, it, expect } from "vitest";
import {
  initialHoldMemo,
  isHoldKey,
  reduceHold,
  touchInputFromHeld,
} from "../../src/components/Game/touchHold";

describe("reduceHold: pointer press/release", () => {
  it("holds while pressed and clears on release", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "left" });
    expect(touchInputFromHeld(memo.held).left).toBe(true);

    memo = reduceHold(memo, { kind: "release", id: "left" });
    expect(touchInputFromHeld(memo.held).left).toBe(false);
  });

  it("does not treat the browser's follow-up click as a toggle", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" });
    memo = reduceHold(memo, { kind: "release", id: "jump" });
    memo = reduceHold(memo, { kind: "activate", id: "jump" });

    expect(touchInputFromHeld(memo.held).jump).toBe(false);
  });

  it("latches on AT activate after a pointer tap whose click never arrived", () => {
    // preventDefault on pointerdown cancels the compatibility click, so the
    // DOM layer sends clear-suppress on a microtask instead. Without that,
    // suppressActivate stays set and this activate is dropped.
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" });
    memo = reduceHold(memo, { kind: "release", id: "jump" });
    memo = reduceHold(memo, { kind: "clear-suppress", id: "jump" });
    memo = reduceHold(memo, { kind: "activate", id: "jump" });

    expect(touchInputFromHeld(memo.held).jump).toBe(true);
  });

  it("does not let a jump tap suppress a later climb activate", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" });
    memo = reduceHold(memo, { kind: "release", id: "jump" });
    memo = reduceHold(memo, { kind: "activate", id: "climb" });
    expect(touchInputFromHeld(memo.held).up).toBe(true);
  });
});

describe("reduceHold: assistive-tech click toggles", () => {
  it("a click with no preceding press latches the control on", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "activate", id: "climb" });
    expect(touchInputFromHeld(memo.held).up).toBe(true);

    memo = reduceHold(memo, { kind: "activate", id: "climb" });
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
    memo = reduceHold(memo, { kind: "press", id: "right" });
    expect(touchInputFromHeld(memo.held).right).toBe(true);
    memo = reduceHold(memo, { kind: "release", id: "right" });
    expect(touchInputFromHeld(memo.held).right).toBe(false);
  });
});
