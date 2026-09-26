/**
 * Virtual joystick → digital input mapping.
 *
 * Low dead zone (a small thumb move already walks), 8-way sectors so a
 * mostly-sideways push does not also climb.
 */

import { describe, it, expect } from "vitest";
import {
  clampKnob,
  joystickDirection,
  JOYSTICK_CENTERED,
  JOYSTICK_DEAD_ZONE,
  withJoystick,
} from "../../src/components/Game/joystick";
import { NO_TOUCH } from "../../src/game/useClimb";

const R = 40;

describe("joystickDirection: dead zone", () => {
  it("reads a resting thumb inside the dead zone as centred", () => {
    expect(joystickDirection(0, 0, R)).toEqual(JOYSTICK_CENTERED);
    expect(joystickDirection(R * JOYSTICK_DEAD_ZONE - 0.5, 0, R)).toEqual(JOYSTICK_CENTERED);
  });

  it("moves as soon as the push clears the dead zone", () => {
    expect(joystickDirection(-(R * JOYSTICK_DEAD_ZONE + 0.5), 0, R).left).toBe(true);
  });

  it("keeps the dead zone low (≤ 15% of travel)", () => {
    expect(JOYSTICK_DEAD_ZONE).toBeGreaterThan(0);
    expect(JOYSTICK_DEAD_ZONE).toBeLessThanOrEqual(0.15);
  });
});

describe("joystickDirection: 8-way sectors", () => {
  it("maps cardinal pushes to a single direction", () => {
    expect(joystickDirection(R, 0, R)).toEqual({ left: false, right: true, up: false, down: false });
    expect(joystickDirection(-R, 0, R)).toEqual({ left: true, right: false, up: false, down: false });
    expect(joystickDirection(0, -R, R)).toEqual({ left: false, right: false, up: true, down: false });
    expect(joystickDirection(0, R, R)).toEqual({ left: false, right: false, up: false, down: true });
  });

  it("maps a 45° push to both axes (walk + climb)", () => {
    expect(joystickDirection(R, -R, R)).toEqual({ left: false, right: true, up: true, down: false });
  });

  it("does not climb on a mostly-sideways push", () => {
    // 15° above horizontal: inside the right sector, outside the up-right one.
    const a = (15 * Math.PI) / 180;
    expect(joystickDirection(Math.cos(a) * R, -Math.sin(a) * R, R)).toEqual({
      left: false,
      right: true,
      up: false,
      down: false,
    });
  });

  it("still steers when the thumb leaves the base", () => {
    expect(joystickDirection(-5 * R, 0, R).left).toBe(true);
  });
});

describe("clampKnob", () => {
  it("passes offsets inside the travel radius through", () => {
    expect(clampKnob(10, -5, R)).toEqual({ x: 10, y: -5 });
  });

  it("pins the knob to the rim beyond it", () => {
    const k = clampKnob(3 * R, 0, R);
    expect(k.x).toBeCloseTo(R);
    expect(k.y).toBeCloseTo(0);
  });
});

describe("withJoystick", () => {
  it("ORs the stick into button input and leaves jump to the button", () => {
    const out = withJoystick(
      { ...NO_TOUCH, jump: true },
      { left: true, right: false, up: true, down: false }
    );
    expect(out).toEqual({ left: true, right: false, up: true, down: false, jump: true });
  });

  it("is a no-op with a centred stick", () => {
    expect(withJoystick(NO_TOUCH, JOYSTICK_CENTERED)).toEqual(NO_TOUCH);
  });
});
