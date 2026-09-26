"use client";

/**
 * Settings control for the on-screen touch layout. Saves on change (it is a
 * device preference, not part of the account form's Save) and is shared by
 * the web settings page and the mobile app's Edit Profile screen.
 */

import {
  CONTROL_SCHEMES,
  useControlScheme,
  type ControlScheme,
} from "../lib/controlScheme";

const OPTIONS: Record<ControlScheme, { label: string; description: string }> = {
  buttons: { label: "Buttons", description: "← → climb and jump buttons" },
  joystick: { label: "Joystick", description: "Drag to move and climb, tap to jump" },
};

export function ControlSchemePicker({ labelledBy }: { labelledBy: string }) {
  const [scheme, setScheme] = useControlScheme();

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-2 gap-2.5">
      {CONTROL_SCHEMES.map((id) => {
        const selected = scheme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setScheme(id)}
            className={`min-h-[64px] rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              selected
                ? "border-signal bg-signal/10"
                : "border-border-strong bg-transparent"
            }`}
          >
            <span
              className={`block text-sm font-semibold ${
                selected ? "text-signal" : "text-text-primary"
              }`}
            >
              {OPTIONS[id].label}
            </span>
            <span className="mt-0.5 block text-xs text-text-secondary">
              {OPTIONS[id].description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
