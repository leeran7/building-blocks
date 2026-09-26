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

/** Base diameter. */
export const JOYSTICK_SIZE = 112;
const KNOB_SIZE = 44;
/** How far the knob centre travels from the base centre. */
const TRAVEL = (JOYSTICK_SIZE - KNOB_SIZE) / 2 + 6;
const CAPTION_GAP = 6;
const CAPTION_HEIGHT = 12;
/** Base plus the "Move / Climb" caption: the column's full height. */
export const JOYSTICK_LAYOUT_HEIGHT = JOYSTICK_SIZE + CAPTION_GAP + CAPTION_HEIGHT;

/** Thin chevron pointing up; rotated for the side arrows. */
function Chevron({ className, rotate }: { className: string; rotate: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className={`exp-joystick-chevron ${className}`}
    >
      <path
        d="M3.5 10.5 8 6l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`rotate(${rotate} 8 8)`}
      />
    </svg>
  );
}

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
      emit(joystickDirection(dx, dy, TRAVEL, lastRef.current));
    },
    [emit]
  );

  const release = useCallback(() => {
    pointerRef.current = null;
    if (knobRef.current) knobRef.current.style.transform = "";
    emit(JOYSTICK_CENTERED);
  }, [emit]);

  return (
    <div className="flex flex-col items-center" style={{ gap: CAPTION_GAP }}>
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
      <Chevron className="left-1/2 top-2.5 -translate-x-1/2" rotate={0} />
      <Chevron className="left-2.5 top-1/2 -translate-y-1/2" rotate={-90} />
      <Chevron className="right-2.5 top-1/2 -translate-y-1/2" rotate={90} />
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
    <span
      aria-hidden="true"
      className="exp-joystick-caption font-mono uppercase"
      style={{ height: CAPTION_HEIGHT, lineHeight: `${CAPTION_HEIGHT}px` }}
    >
      Move / Climb
    </span>
    </div>
  );
}
