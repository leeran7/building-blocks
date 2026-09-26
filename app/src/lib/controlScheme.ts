/**
 * On-screen control scheme for touch devices: the four-button row or a
 * joystick plus jump button.
 *
 * A per-device preference (a phone and a tablet can differ), so it lives in
 * localStorage rather than on the account — the same place the SFX mute and
 * haptics toggles live. The Next app and the Capacitor SPA share this module,
 * so a choice made on either settings screen is what TouchControls reads.
 */

import { useCallback, useSyncExternalStore } from "react";

export type ControlScheme = "buttons" | "joystick";

export const CONTROL_SCHEMES: readonly ControlScheme[] = ["buttons", "joystick"];

export const DEFAULT_CONTROL_SCHEME: ControlScheme = "buttons";

export const CONTROL_SCHEME_KEY = "doomstack:control-scheme";

/** Same-tab writes; the `storage` event only fires in *other* tabs. */
const CHANGE_EVENT = "doomstack:control-scheme-change";

/** Allow-list parse of an untrusted stored value. Unknown → null. */
export function parseControlScheme(raw: unknown): ControlScheme | null {
  return raw === "buttons" || raw === "joystick" ? raw : null;
}

export function readControlScheme(): ControlScheme {
  try {
    return (
      parseControlScheme(localStorage.getItem(CONTROL_SCHEME_KEY)) ??
      DEFAULT_CONTROL_SCHEME
    );
  } catch {
    return DEFAULT_CONTROL_SCHEME;
  }
}

export function writeControlScheme(scheme: ControlScheme): void {
  try {
    localStorage.setItem(CONTROL_SCHEME_KEY, scheme);
  } catch {
    // Private mode / blocked storage: the choice still applies to this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CONTROL_SCHEME_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const serverSnapshot = () => DEFAULT_CONTROL_SCHEME;

/** The saved scheme and a setter that persists it and updates every reader. */
export function useControlScheme(): [ControlScheme, (s: ControlScheme) => void] {
  const scheme = useSyncExternalStore(subscribe, readControlScheme, serverSnapshot);
  const set = useCallback((s: ControlScheme) => writeControlScheme(s), []);
  return [scheme, set];
}
