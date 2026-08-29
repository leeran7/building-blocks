import { describe, it, expect } from "vitest";
import { joystickAxesFromNormalized, NO_JOYSTICK } from "../../src/components/Game/joystickInput";

describe("joystickAxesFromNormalized", () => {
  it("exports a neutral sentinel", () => {
    expect(NO_JOYSTICK).toEqual({
      left: false,
      right: false,
      up: false,
      down: false,
    });
  });

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
