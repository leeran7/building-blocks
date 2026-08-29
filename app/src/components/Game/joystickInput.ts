/**
 * Analog joystick deflection → digital climb axes.
 *
 * The sim only accepts boolean left/right/up/down, so the joystick maps
 * normalized deflection through deadzones into those flags.
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

/** Fraction of horizontal throw below which left/right read as neutral. */
export const JOYSTICK_HORIZONTAL_DEADZONE = 0.12;

/** Slightly lower so pushing up on ladders is easier than walking. */
export const JOYSTICK_VERTICAL_DEADZONE = 0.08;

/** @deprecated Use axis-specific deadzones via `joystickAxesFromVector`. */
export const JOYSTICK_DEADZONE = JOYSTICK_HORIZONTAL_DEADZONE;

/**
 * Map nipplejs vector components to digital axes.
 *
 * Vertical uses a lower deadzone than horizontal so ladder climbs register
 * with a shorter thumb throw.
 *
 * @param dx Horizontal deflection, -1 (left) to +1 (right).
 * @param dy Vertical deflection from nipplejs: +1 (up) to -1 (down).
 *   nipplejs negates screen Y when building `vector.y`.
 */
export function joystickAxesFromVector(dx: number, dy: number): JoystickAxes {
  const h = JOYSTICK_HORIZONTAL_DEADZONE;
  const v = JOYSTICK_VERTICAL_DEADZONE;
  const active = Math.abs(dx) > h || Math.abs(dy) > v;
  if (!active) {
    return NO_JOYSTICK;
  }
  return {
    left: dx < -h,
    right: dx > h,
    up: dy > v,
    down: dy < -v,
  };
}

/**
 * Map normalized stick position to digital axes with a uniform deadzone.
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
