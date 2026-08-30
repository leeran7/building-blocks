"use client";

import { useEffect, useState } from "react";

/**
 * Measured `env(safe-area-inset-*)` values in CSS pixels.
 *
 * The insets are only readable from CSS, so a hidden probe element carries them
 * as padding and we read the computed padding back as numbers. This lets the
 * full-bleed climb stage push its HUD below the notch / Dynamic Island and lift
 * the touch controls above the home indicator, without hard-coding device sizes.
 *
 * Requires `viewport-fit=cover` (set in the root layout) — without it every
 * inset reports 0 and the values here are all zero, which is the safe default on
 * a device that has no cutouts anyway.
 */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function useSafeAreaInsets(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO);

  useEffect(() => {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;" +
      "pointer-events:none;" +
      "padding-top:env(safe-area-inset-top);" +
      "padding-right:env(safe-area-inset-right);" +
      "padding-bottom:env(safe-area-inset-bottom);" +
      "padding-left:env(safe-area-inset-left);";
    document.body.appendChild(probe);

    const measure = () => {
      const cs = getComputedStyle(probe);
      const next: SafeAreaInsets = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
      setInsets((prev) =>
        prev.top === next.top &&
        prev.right === next.right &&
        prev.bottom === next.bottom &&
        prev.left === next.left
          ? prev
          : next
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      probe.remove();
    };
  }, []);

  return insets;
}
