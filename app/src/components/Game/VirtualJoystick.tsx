"use client";

import { useEffect, useRef } from "react";
import {
  joystickAxesFromVector,
  NO_JOYSTICK,
  type JoystickAxes,
} from "./joystickInput";

/** Visible outer ring diameter in px — also nipplejs `size`. */
export const JOYSTICK_SIZE = 140;

/** Touch capture area — larger than the stick so drags don't drop. */
export const JOYSTICK_ZONE_WIDTH = 168;
export const JOYSTICK_ZONE_HEIGHT = 148;

export function VirtualJoystick({
  onChange,
}: {
  onChange: (axes: JoystickAxes) => void;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;

    let destroyManager: (() => void) | undefined;
    let cancelled = false;

    const emitAxes = (data: { vector: { x: number; y: number } }) => {
      const { x, y } = data.vector;
      onChangeRef.current(joystickAxesFromVector(x, y));
    };

    const onMove = (evt: { data: { vector: { x: number; y: number } } }) =>
      emitAxes(evt.data);
    const onEnd = () => onChangeRef.current(NO_JOYSTICK);

    const onWindowBlur = () => onChangeRef.current(NO_JOYSTICK);
    window.addEventListener("blur", onWindowBlur);

    void import("nipplejs").then((nipplejs) => {
      if (cancelled) return;

      const manager = nipplejs.default.create({
        zone,
        mode: "static",
        position: { left: "50%", top: "50%" },
        size: JOYSTICK_SIZE,
        threshold: 0.08,
        fadeTime: 0,
        restJoystick: true,
        restOpacity: 0.92,
        color: {
          front: "rgba(203, 242, 77, 0.92)",
          back: "rgba(30, 28, 36, 0.78)",
        },
      });

      destroyManager = () => manager.destroy();

      manager.on("move", onMove);
      manager.on("end", onEnd);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("blur", onWindowBlur);
      destroyManager?.();
      onChangeRef.current(NO_JOYSTICK);
    };
  }, []);

  return (
    <div
      ref={zoneRef}
      className="game-joystick-zone relative flex-shrink-0"
      style={{
        touchAction: "none",
        width: JOYSTICK_ZONE_WIDTH,
        height: JOYSTICK_ZONE_HEIGHT,
      }}
      aria-label="Move and climb joystick"
      role="group"
    />
  );
}
