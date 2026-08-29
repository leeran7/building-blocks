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
  mergeTouchInput,
  reduceHold,
} from "../../src/components/Game/touchHold";
import {
  joystickAxesFromNormalized,
  NO_JOYSTICK,
} from "../../src/components/Game/joystickInput";

describe("reduceHold: pointer press/release", () => {
  it("holds while pressed and clears on release", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" });
    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(true);

    memo = reduceHold(memo, { kind: "release", id: "jump" });
    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(false);
  });

  it("does not treat the browser's follow-up click as a toggle", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "press", id: "jump" });
    memo = reduceHold(memo, { kind: "release", id: "jump" });
    memo = reduceHold(memo, { kind: "activate", id: "jump" });

    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(false);
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

    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(true);
  });
});

describe("reduceHold: assistive-tech click toggles", () => {
  it("a click with no preceding press latches the control on", () => {
    let memo = initialHoldMemo();
    memo = reduceHold(memo, { kind: "activate", id: "jump" });
    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(true);

    memo = reduceHold(memo, { kind: "activate", id: "jump" });
    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(false);
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
    memo = reduceHold(memo, { kind: "press", id: "jump" });
    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(true);
    memo = reduceHold(memo, { kind: "release", id: "jump" });
    expect(mergeTouchInput(NO_JOYSTICK, memo.held).jump).toBe(false);
  });
});

describe("joystickAxesFromNormalized", () => {
  it("returns neutral inside the deadzone", () => {
    expect(joystickAxesFromNormalized(0, 0)).toEqual(NO_JOYSTICK);
    expect(joystickAxesFromNormalized(0.1, 0.1)).toEqual(NO_JOYSTICK);
  });

  it("maps horizontal deflection to left and right", () => {
    expect(joystickAxesFromNormalized(-1, 0)).toEqual({
      left: true,
      right: false,
      up: false,
      down: false,
    });
    expect(joystickAxesFromNormalized(1, 0)).toEqual({
      left: false,
      right: true,
      up: false,
      down: false,
    });
  });

  it("maps vertical deflection to up and down", () => {
    expect(joystickAxesFromNormalized(0, -1)).toEqual({
      left: false,
      right: false,
      up: true,
      down: false,
    });
    expect(joystickAxesFromNormalized(0, 1)).toEqual({
      left: false,
      right: false,
      up: false,
      down: true,
    });
  });

  it("can combine diagonal horizontal and vertical axes", () => {
    expect(joystickAxesFromNormalized(-0.8, -0.8)).toEqual({
      left: true,
      right: false,
      up: true,
      down: false,
    });
  });

  it("merges joystick axes with jump hold", () => {
    const held = new Set(["jump"] as const);
    expect(mergeTouchInput({ left: true, right: false, up: false, down: false }, held)).toEqual({
      left: true,
      right: false,
      up: false,
      down: false,
      jump: true,
    });
  });
});
