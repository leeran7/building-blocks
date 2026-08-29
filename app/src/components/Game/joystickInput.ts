/**
 * Analog joystick deflection → digital climb axes.
 *
 * The sim only accepts boolean left/right/up/down, so the joystick maps
 * normalized deflection through a deadzone into those flags.
 */

export interface JoystickAxes {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export const NO_JOYSTICK: JoystickAxes = {
  left: false,
  right: false,
  up: false,
  down: false,
};

/** Fraction of full throw (0–1) below which all axes read as neutral. */
export const JOYSTICK_DEADZONE = 0.2;

/**
 * Map normalized stick position to digital axes.
 *
 * @param dx Horizontal deflection, -1 (left) to +1 (right).
 * @param dy Vertical deflection, -1 (up on screen) to +1 (down).
 */
export function joystickAxesFromNormalized(
  dx: number,
  dy: number,
  deadzone = JOYSTICK_DEADZONE
): JoystickAxes {
  const mag = Math.hypot(dx, dy);
  if (mag < deadzone) {
    return NO_JOYSTICK;
  }
  return {
    left: dx < -deadzone,
    right: dx > deadzone,
    up: dy < -deadzone,
    down: dy > deadzone,
  };
}
