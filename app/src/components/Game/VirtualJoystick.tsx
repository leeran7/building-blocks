"use client";

import { useCallback, useRef, useState } from "react";
import {
  joystickAxesFromNormalized,
  NO_JOYSTICK,
  type JoystickAxes,
} from "./joystickInput";

const BASE_SIZE = 100;
const KNOB_SIZE = 44;

export function VirtualJoystick({
  onChange,
}: {
  onChange: (axes: JoystickAxes) => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const activeRef = useRef(false);

  const maxDeflection = BASE_SIZE / 2 - KNOB_SIZE / 2;

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;

      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDeflection) {
        dx = (dx / dist) * maxDeflection;
        dy = (dy / dist) * maxDeflection;
      }

      setKnobOffset({ x: dx, y: dy });
      onChange(
        joystickAxesFromNormalized(dx / maxDeflection, dy / maxDeflection)
      );
    },
    [maxDeflection, onChange]
  );

  const reset = useCallback(() => {
    activeRef.current = false;
    setKnobOffset({ x: 0, y: 0 });
    onChange(NO_JOYSTICK);
  }, [onChange]);

  return (
    <div
      ref={baseRef}
      role="group"
      aria-label="Move and climb joystick"
      className="relative flex-shrink-0 rounded-full border border-border-strong bg-void/80 backdrop-blur-sm"
      style={{
        touchAction: "none",
        width: BASE_SIZE,
        height: BASE_SIZE,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        activeRef.current = true;
        updateFromClient(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!activeRef.current) return;
        updateFromClient(e.clientX, e.clientY);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 rounded-full border border-border-strong bg-elevated/95 shadow-[0_2px_8px_rgb(0_0_0/0.35)]"
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          transform: `translate(calc(-50% + ${knobOffset.x}px), calc(-50% + ${knobOffset.y}px))`,
        }}
      />
    </div>
  );
}
