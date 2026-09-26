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
  JOYSTICK_DEAD_ZONE_EXIT,
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

  it("keeps the dead zone low (≤ 10% of travel)", () => {
    expect(JOYSTICK_DEAD_ZONE).toBeGreaterThan(0);
    expect(JOYSTICK_DEAD_ZONE).toBeLessThanOrEqual(0.1);
    expect(JOYSTICK_DEAD_ZONE_EXIT).toBeLessThan(JOYSTICK_DEAD_ZONE);
  });

  it("keeps moving while the push sits between the exit and entry thresholds", () => {
    const moving = { left: true, right: false, up: false, down: false };
    const between = -(R * (JOYSTICK_DEAD_ZONE + JOYSTICK_DEAD_ZONE_EXIT)) / 2;
    expect(joystickDirection(between, 0, R, moving).left).toBe(true);
    expect(joystickDirection(between, 0, R).left).toBe(false);
    expect(joystickDirection(-(R * JOYSTICK_DEAD_ZONE_EXIT) + 0.5, 0, R, moving)).toEqual(
      JOYSTICK_CENTERED
    );
  });
});

/** Thumb at `deg` degrees from +x (counter-clockwise, screen up = positive). */
function at(deg: number, prev?: Parameters<typeof joystickDirection>[3]) {
  const a = (deg * Math.PI) / 180;
  return joystickDirection(Math.cos(a) * R, -Math.sin(a) * R, R, prev);
}

describe("joystickDirection: cones", () => {
  it("maps cardinal pushes to a single direction", () => {
    expect(joystickDirection(R, 0, R)).toEqual({ left: false, right: true, up: false, down: false });
    expect(joystickDirection(-R, 0, R)).toEqual({ left: true, right: false, up: false, down: false });
    expect(joystickDirection(0, -R, R)).toEqual({ left: false, right: false, up: true, down: false });
    expect(joystickDirection(0, R, R)).toEqual({ left: false, right: false, up: false, down: true });
  });

  it("presses Up together with Right from a slight upward lean", () => {
    // The climb-while-walking band: walking at a ladder with the thumb
    // leaning up grabs it on arrival.
    for (const d of [7, 20, 45, 70]) {
      expect(at(d)).toEqual({ left: false, right: true, up: true, down: false });
    }
  });

  it("presses Up together with Left the same way", () => {
    for (const d of [110, 135, 160, 173]) {
      expect(at(d)).toEqual({ left: true, right: false, up: true, down: false });
    }
  });

  it("does not climb on a flat sideways push", () => {
    expect(at(3)).toEqual({ left: false, right: true, up: false, down: false });
    expect(at(177)).toEqual({ left: true, right: false, up: false, down: false });
    expect(at(0)).toEqual({ left: false, right: true, up: false, down: false });
  });

  it("does not walk on a near-vertical push", () => {
    expect(at(80)).toEqual({ left: false, right: false, up: true, down: false });
  });

  it("keeps Down narrow so a sagging thumb does not descend while walking", () => {
    expect(at(-20)).toEqual({ left: false, right: true, up: false, down: false });
    expect(at(-45)).toEqual({ left: false, right: true, up: false, down: true });
  });
});

describe("joystickDirection: cone hysteresis", () => {
  const climbing = { left: false, right: true, up: true, down: false };

  it("does not start climbing below the 5° edge", () => {
    expect(at(4).up).toBe(false);
  });

  it("keeps climbing once started until the lean drops under 3°", () => {
    expect(at(4, climbing).up).toBe(true);
    expect(at(2, climbing).up).toBe(false);
  });

  it("keeps walking once started until the push is within 10° of vertical", () => {
    expect(at(78).right).toBe(false);
    expect(at(78, climbing).right).toBe(true);
    expect(at(82, climbing).right).toBe(false);
  });
});

describe("joystickDirection: off the base", () => {
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
