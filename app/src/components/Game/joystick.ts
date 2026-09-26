/**
 * Virtual joystick math for the on-screen controls.
 *
 * The stick maps to the same digital inputs as the buttons (the sim only takes
 * -1/0/1 per axis). Each direction has its own cone and the cones overlap, so
 * one push can press Up together with Left or Right: walking at a ladder with
 * the thumb leaning up grabs it on arrival instead of needing a second,
 * separate push up.
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
 * Cone edges, as the minimum share of the push along an axis (sin of the
 * angle away from the perpendicular axis).
 *
 * - Up: any push more than 5° above horizontal climbs, so only a flat push
 *   walks without grabbing. The sim grabs a ladder in reach *before* walking
 *   on whenever Up is held, so the wide Up cone is what makes the climber stop
 *   at ladders instead of walking past. Left/right: any push at least 15° off
 *   vertical walks. Between 5° and 75° above horizontal both are pressed.
 * - Down keeps a narrower 67.5° cone (22.5° below horizontal) so a thumb that
 *   sags while walking does not drop the climber down a ladder.
 *
 * Each axis turns on at ENTER and stays on until the push falls below STAY.
 * Without that hysteresis a thumb resting on a cone edge flickers the climb
 * intent, which repeatedly grabs and releases the ladder.
 */
const deg = (d: number) => Math.sin((d * Math.PI) / 180);
const UP_ENTER = deg(5);
const UP_STAY = deg(3);
const SIDE_ENTER = deg(15);
const SIDE_STAY = deg(10);
const DOWN_ENTER = deg(22.5);
const DOWN_STAY = deg(15);

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
function axis(component: number, wasOn: boolean, enter: number, stay: number): boolean {
  return component > (wasOn ? stay : enter);
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
    left: axis(-nx, prev.left, SIDE_ENTER, SIDE_STAY),
    right: axis(nx, prev.right, SIDE_ENTER, SIDE_STAY),
    up: axis(-ny, prev.up, UP_ENTER, UP_STAY),
    down: axis(ny, prev.down, DOWN_ENTER, DOWN_STAY),
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
