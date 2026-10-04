/**
 * The saved vibration preference, apart from the Capacitor haptics calls so
 * screens can read and change it without loading the native plugin.
 */

import { useCallback, useState } from "react";

const HAPTICS_KEY = "haptics_enabled";

export function isHapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

/**
 * The vibration setting for the in-game cog: the saved flag and a setter that
 * saves it. Every haptic reads the flag when it fires, so a change applies at once.
 */
export function useHapticsSetting(): { enabled: boolean; onToggle: () => void } {
  const [enabled, setEnabled] = useState(isHapticsEnabled);
  const onToggle = useCallback(() => {
    const next = !isHapticsEnabled();
    setHapticsEnabled(next);
    setEnabled(next);
  }, []);
  return { enabled, onToggle };
}
