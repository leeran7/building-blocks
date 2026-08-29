import { describe, it, expect } from "vitest";
import {
  joystickAxesFromNormalized,
  joystickAxesFromVector,
  NO_JOYSTICK,
  JOYSTICK_HORIZONTAL_DEADZONE,
  JOYSTICK_VERTICAL_DEADZONE,
} from "../../src/components/Game/joystickInput";

describe("joystickAxesFromVector", () => {
  it("exports a neutral sentinel", () => {
    expect(NO_JOYSTICK).toEqual({
      left: false,
      right: false,
      up: false,
      down: false,
    });
  });

  it("returns neutral inside both deadzones", () => {
    expect(joystickAxesFromVector(0, 0)).toEqual(NO_JOYSTICK);
    expect(joystickAxesFromVector(0.05, 0.05)).toEqual(NO_JOYSTICK);
  });

  it("uses a lower vertical deadzone for ladder climbs", () => {
    expect(JOYSTICK_VERTICAL_DEADZONE).toBeLessThan(JOYSTICK_HORIZONTAL_DEADZONE);
    expect(joystickAxesFromVector(0, -0.09)).toEqual({
      left: false,
      right: false,
      up: true,
      down: false,
    });
    expect(joystickAxesFromVector(0.09, 0)).toEqual(NO_JOYSTICK);
  });

  it("maps horizontal and vertical deflection independently", () => {
    expect(joystickAxesFromVector(-0.5, 0)).toEqual({
      left: true,
      right: false,
      up: false,
      down: false,
    });
    expect(joystickAxesFromVector(0, 0.5)).toEqual({
      left: false,
      right: false,
      up: false,
      down: true,
    });
  });
});

describe("joystickAxesFromNormalized", () => {
  it("respects a custom deadzone", () => {
    expect(joystickAxesFromNormalized(0.25, 0, 0.3)).toEqual(NO_JOYSTICK);
    expect(joystickAxesFromNormalized(-0.35, 0, 0.3)).toEqual({
      left: true,
      right: false,
      up: false,
      down: false,
    });
  });
});
