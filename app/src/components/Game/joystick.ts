/**
 * Virtual joystick math for the on-screen controls.
 *
 * The stick maps to the same digital inputs as the buttons (the sim only takes
 * -1/0/1 per axis), split into eight 45° sectors so a diagonal push climbs and
 * walks at once while a mostly-sideways push does not also grab a ladder.
 */

import type { TouchInput } from "../../game/useClimb";

/**
 * Fraction of the travel radius that reads as centred. Kept low so a small
 * thumb movement already moves the climber; just enough to swallow the jitter
 * of a resting thumb.
 */
export const JOYSTICK_DEAD_ZONE = 0.1;

/** An axis is active when the push is within 67.5° of it (8-way sectors). */
const SECTOR_EDGE = Math.sin(Math.PI / 8);

export interface JoystickDirection {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export const JOYSTICK_CENTERED: JoystickDirection = {
  left: false,
  right: false,
  up: false,
  down: false,
};

/**
 * Direction for a thumb offset (`dx`, `dy` in screen px, +y down) from the
 * stick's centre, given the knob's travel radius in px.
 */
export function joystickDirection(
  dx: number,
  dy: number,
  radius: number
): JoystickDirection {
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist < radius * JOYSTICK_DEAD_ZONE) {
    return JOYSTICK_CENTERED;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    left: nx < -SECTOR_EDGE,
    right: nx > SECTOR_EDGE,
    up: ny < -SECTOR_EDGE,
    down: ny > SECTOR_EDGE,
  };
}

/** Knob offset clamped to the travel radius, for drawing. */
export function clampKnob(
  dx: number,
  dy: number,
  radius: number
): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist <= radius || dist === 0) return { x: dx, y: dy };
  const k = radius / dist;
  return { x: dx * k, y: dy * k };
}

/** Button input with the stick's directions OR-ed in. */
export function withJoystick(
  base: TouchInput,
  stick: JoystickDirection
): TouchInput {
  return {
    left: base.left || stick.left,
    right: base.right || stick.right,
    up: base.up || stick.up,
    down: base.down || stick.down,
    jump: base.jump,
  };
}
