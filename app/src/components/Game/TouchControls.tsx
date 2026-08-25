"use client";

/**
 * Tower v3 "The Climb" — on-screen touch controls (AC-34).
 *
 * Thumb-reachable move + jump + contextual climb controls that do NOT occlude
 * the summit or the rising-hazard line (they sit in a bottom bar below the
 * canvas). Only shown when the climb is a ladder segment for up/down; jump is
 * always available. Emits a full TouchInput on every change.
 *
 * 44px min targets, dark tokens, single cyan accent (app/DESIGN.md).
 */

import { useCallback, useRef } from "react";
import { TouchInput, NO_TOUCH } from "../../game/useClimb";

export interface TouchControlsProps {
  onChange: (t: TouchInput) => void;
  /** Whether the climber is on a ladder — enables up/down (contextual). */
  showClimb: boolean;
}

type Key = keyof TouchInput;

const BTN =
  "select-none touch-none flex items-center justify-center rounded-xl font-bold " +
  "min-w-[64px] min-h-[64px] text-lg active:brightness-125 transition";

export function TouchControls({ onChange, showClimb }: TouchControlsProps) {
  const stateRef = useRef<TouchInput>({ ...NO_TOUCH });

  const set = useCallback(
    (key: Key, value: boolean) => {
      stateRef.current = { ...stateRef.current, [key]: value };
      onChange(stateRef.current);
    },
    [onChange]
  );

  const hold = (key: Key) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      set(key, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      set(key, false);
    },
    onPointerLeave: () => set(key, false),
    onPointerCancel: () => set(key, false),
  });

  return (
    <div
      className="w-full flex items-end justify-between gap-3 px-2 py-3 select-none"
      aria-label="Touch controls"
    >
      {/* Left cluster: move. */}
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Move left"
          className={`${BTN} bg-surface border border-border-strong text-text-primary`}
          {...hold("left")}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="Move right"
          className={`${BTN} bg-surface border border-border-strong text-text-primary`}
          {...hold("right")}
        >
          ▶
        </button>
      </div>

      {/* Middle cluster: contextual climb (only on ladders). */}
      {showClimb && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-label="Climb up"
            className={`${BTN} bg-surface border border-border-strong text-text-primary min-h-[52px]`}
            {...hold("up")}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Climb down"
            className={`${BTN} bg-surface border border-border-strong text-text-primary min-h-[52px]`}
            {...hold("down")}
          >
            ▼
          </button>
        </div>
      )}

      {/* Right cluster: jump. */}
      <button
        type="button"
        aria-label="Jump"
        className={`${BTN} bg-accent text-void`}
        {...hold("jump")}
      >
        JUMP
      </button>
    </div>
  );
}
