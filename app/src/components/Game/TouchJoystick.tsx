"use client";

/**
 * Virtual joystick for the "joystick" control scheme: drag to walk, push up to
 * climb, down to descend. Fixed-centre stick; the drag may leave the base and
 * keeps steering (pointer capture), with the knob pinned to the rim.
 *
 * The knob is moved by writing its transform directly — a pointermove per
 * frame should not re-render React.
 */

import { useCallback, useRef } from "react";
import {
  clampKnob,
  joystickDirection,
  JOYSTICK_CENTERED,
  type JoystickDirection,
} from "./joystick";

/** Base diameter. Matches the button height so TOUCH_CONTROLS_INSET holds. */
export const JOYSTICK_SIZE = 104;
const KNOB_SIZE = 44;
/** How far the knob centre travels from the base centre. */
const TRAVEL = (JOYSTICK_SIZE - KNOB_SIZE) / 2 + 6;

function sameDirection(a: JoystickDirection, b: JoystickDirection): boolean {
  return a.left === b.left && a.right === b.right && a.up === b.up && a.down === b.down;
}

export function TouchJoystick({
  onChange,
}: {
  onChange: (direction: JoystickDirection) => void;
}) {
  const knobRef = useRef<HTMLSpanElement>(null);
  const pointerRef = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef<JoystickDirection>(JOYSTICK_CENTERED);

  const emit = useCallback(
    (next: JoystickDirection) => {
      if (sameDirection(next, lastRef.current)) return;
      lastRef.current = next;
      onChange(next);
    },
    [onChange]
  );

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const dx = clientX - originRef.current.x;
      const dy = clientY - originRef.current.y;
      const knob = clampKnob(dx, dy, TRAVEL);
      if (knobRef.current) {
        knobRef.current.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
      }
      emit(joystickDirection(dx, dy, TRAVEL));
    },
    [emit]
  );

  const release = useCallback(() => {
    pointerRef.current = null;
    if (knobRef.current) knobRef.current.style.transform = "";
    emit(JOYSTICK_CENTERED);
  }, [emit]);

  return (
    <div
      data-game-control
      role="img"
      aria-label="Movement joystick: drag to move, push up to climb"
      className="exp-joystick relative shrink-0 rounded-full"
      style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE, touchAction: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (pointerRef.current !== null) return;
        pointerRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        originRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointerRef.current) return;
        move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pointerRef.current) release();
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === pointerRef.current) release();
      }}
      onLostPointerCapture={(e) => {
        if (e.pointerId === pointerRef.current) release();
      }}
    >
      <span aria-hidden="true" className="exp-joystick-arrow" data-dir="up">▲</span>
      <span aria-hidden="true" className="exp-joystick-arrow" data-dir="left">◀</span>
      <span aria-hidden="true" className="exp-joystick-arrow" data-dir="right">▶</span>
      <span aria-hidden="true" className="exp-joystick-arrow" data-dir="down">▼</span>
      <span
        ref={knobRef}
        aria-hidden="true"
        className="exp-joystick-knob absolute rounded-full"
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          left: (JOYSTICK_SIZE - KNOB_SIZE) / 2,
          top: (JOYSTICK_SIZE - KNOB_SIZE) / 2,
        }}
      />
    </div>
  );
}
