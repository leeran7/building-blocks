"use client";

import { useEffect, useState } from "react";

const ASPECT = 360 / 640;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 640;

/**
 * Responsive canvas dimensions for the climb game. Preserves 360:640 aspect ratio
 * and reserves vertical space for on-screen touch controls on mobile.
 */
export function useCanvasSize(reserveControls = false): { width: number; height: number } {
  const [size, setSize] = useState({ width: 360, height: 640 });

  useEffect(() => {
    const update = () => {
      const controlsH = reserveControls ? 88 : 0;
      const maxW = Math.min(window.innerWidth * 0.92, MAX_WIDTH);
      const maxH = Math.min(window.innerHeight * 0.58 - controlsH, MAX_HEIGHT);

      let w = maxW;
      let h = w / ASPECT;
      if (h > maxH) {
        h = Math.max(200, maxH);
        w = h * ASPECT;
      }

      setSize({ width: Math.round(w), height: Math.round(h) });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [reserveControls]);

  return size;
}
