/**
 * Camera clearance under the touch controls follows the chosen layout: the
 * joystick column (stick + caption) is taller than the button row, and an
 * understated inset draws the climber behind the controls.
 */

import { describe, it, expect } from "vitest";
import {
  JOYSTICK_CONTROLS_INSET,
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
  touchControlsInset,
} from "../../src/components/Game/TouchControls";
import { JOYSTICK_LAYOUT_HEIGHT } from "../../src/components/Game/TouchJoystick";

describe("touchControlsInset", () => {
  it("clears the taller joystick column", () => {
    expect(JOYSTICK_CONTROLS_INSET).toBeGreaterThan(JOYSTICK_LAYOUT_HEIGHT);
    expect(touchControlsInset("joystick", 0)).toBe(JOYSTICK_CONTROLS_INSET + TOUCH_CONTROLS_MIN_BOTTOM);
    expect(touchControlsInset("joystick", 0)).toBeGreaterThan(touchControlsInset("buttons", 0));
  });

  it("keeps the button row's inset unchanged", () => {
    expect(touchControlsInset("buttons", 0)).toBe(TOUCH_CONTROLS_INSET + TOUCH_CONTROLS_MIN_BOTTOM);
  });

  it("grows into the home-indicator safe area", () => {
    expect(touchControlsInset("joystick", 34) - touchControlsInset("joystick", 0)).toBe(34 - TOUCH_CONTROLS_MIN_BOTTOM);
  });
});
