/**
 * Virtual joystick math for the on-screen controls.
 *
 * The stick maps to the same digital inputs as the buttons (the sim only takes
 * -1/0/1 per axis), split into eight 45° sectors so a diagonal push climbs and
 * walks at once while a mostly-sideways push does not also grab a ladder.
 */

import type { TouchInput } from "../../game/useClimb";

/**
 * Fraction of the travel radius at which a push starts moving the climber.
 * Kept low so a small thumb movement already registers; just enough to
 * swallow the jitter of a resting thumb. The stick reads as centred again
 * only once the push drops below JOYSTICK_DEAD_ZONE_EXIT, so a thumb resting
 * right on the edge does not stutter the climber.
 */
export const JOYSTICK_DEAD_ZONE = 0.06;
export const JOYSTICK_DEAD_ZONE_EXIT = 0.04;

/**
 * 8-way sectors: an axis turns on when the push is within 67.5° of it and,
 * once on, stays on until the push leaves a wider 75° cone. Without the
 * hysteresis a thumb near a sector edge flickers the climb intent, which
 * repeatedly grabs and releases the ladder.
 */
const SECTOR_ENTER = Math.sin(Math.PI / 8);
const SECTOR_STAY = Math.sin(Math.PI / 12);

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

/** An axis needs the larger threshold to turn on and the smaller to stay on. */
function axis(component: number, wasOn: boolean): boolean {
  return component > (wasOn ? SECTOR_STAY : SECTOR_ENTER);
}

/**
 * Direction for a thumb offset (`dx`, `dy` in screen px, +y down) from the
 * stick's centre, given the knob's travel radius in px. `prev` is the last
 * direction, used for the hysteresis.
 */
export function joystickDirection(
  dx: number,
  dy: number,
  radius: number,
  prev: JoystickDirection = JOYSTICK_CENTERED
): JoystickDirection {
  const dist = Math.hypot(dx, dy);
  const wasMoving = prev.left || prev.right || prev.up || prev.down;
  const threshold = wasMoving ? JOYSTICK_DEAD_ZONE_EXIT : JOYSTICK_DEAD_ZONE;
  if (dist === 0 || dist < radius * threshold) {
    return JOYSTICK_CENTERED;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    left: axis(-nx, prev.left),
    right: axis(nx, prev.right),
    up: axis(-ny, prev.up),
    down: axis(ny, prev.down),
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
