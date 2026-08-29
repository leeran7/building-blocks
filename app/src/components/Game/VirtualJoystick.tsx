"use client";

import { useEffect, useRef } from "react";
import nipplejs from "nipplejs";
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

    const manager = nipplejs.create({
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

    const emitAxes = (data: { vector: { x: number; y: number } }) => {
      const { x, y } = data.vector;
      onChangeRef.current(joystickAxesFromVector(x, y));
    };

    const onMove = (evt: { data: { vector: { x: number; y: number } } }) =>
      emitAxes(evt.data);
    const onEnd = () => onChangeRef.current(NO_JOYSTICK);

    manager.on("move", onMove);
    manager.on("end", onEnd);

    const onWindowBlur = () => onChangeRef.current(NO_JOYSTICK);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("blur", onWindowBlur);
      manager.off("move", onMove);
      manager.off("end", onEnd);
      manager.destroy();
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
