"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Left cluster: move (← →). Right cluster: climb (hold ↑) + jump. Wired into
 * useClimb via setTouch, and only mounted on coarse-pointer devices.
 *
 * The bar keeps its footprint whether or not a run is active — the buttons just
 * dim and disable between runs. Unmounting them instead would change how much
 * height the canvas is given (see useCanvasSize) and resize the game every time
 * a run starts or ends.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { NO_TOUCH, type TouchInput } from "../../game/useClimb";

export function TouchControls({
  active,
  onInput,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
}) {
  const pressedRef = useRef<Set<ControlId>>(new Set());
  const [pressed, setPressed] = useState<ReadonlySet<ControlId>>(new Set());

  const emit = useCallback(() => {
    const held = pressedRef.current;
    onInput({
      left: held.has("left"),
      right: held.has("right"),
      up: held.has("climb"),
      down: false,
      jump: held.has("jump"),
    });
    setPressed(new Set(held));
  }, [onInput]);

  const setHeld = useCallback(
    (id: ControlId, down: boolean) => {
      if (down) pressedRef.current.add(id);
      else pressedRef.current.delete(id);
      emit();
    },
    [emit]
  );

  useEffect(() => {
    if (active) return;
    pressedRef.current = new Set();
    setPressed(new Set());
    onInput(NO_TOUCH);
  }, [active, onInput]);

  return (
    <div
      className="w-full select-none mt-3"
      style={{ touchAction: "none" }}
      aria-label="Touch game controls"
    >
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 items-stretch gap-2">
          {MOVE_CONTROLS.map((control) => (
            <TouchButton
              key={control.id}
              control={control}
              active={active}
              held={pressed.has(control.id)}
              onHoldChange={setHeld}
            />
          ))}
        </div>
        <div className="flex flex-1 items-stretch gap-2">
          {CLIMB_CONTROLS.map((control) => (
            <TouchButton
              key={control.id}
              control={control}
              active={active}
              held={pressed.has(control.id)}
              onHoldChange={setHeld}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TouchButton({
  control,
  active,
  held,
  onHoldChange,
}: {
  control: Control;
  active: boolean;
  held: boolean;
  onHoldChange: (id: ControlId, down: boolean) => void;
}) {
  const { id, label, glyph, sub, accent, wordGlyph } = control;

  const press = (down: boolean) => {
    if (!active) return;
    onHoldChange(id, down);
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      disabled={!active}
      className={
        "relative flex flex-1 flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
        "min-h-[76px] sm:min-h-[84px] transition-[filter,transform,background-color,opacity] " +
        "active:scale-95 disabled:opacity-40 " +
        (accent
          ? "border-signal/50 bg-signal/15 text-signal shadow-signal "
          : "border-border-strong bg-surface/80 text-text-primary ") +
        (held ? (accent ? "bg-signal/30 scale-95 " : "bg-elevated scale-95 ") : "")
      }
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        press(false);
      }}
      onPointerCancel={() => press(false)}
      onLostPointerCapture={() => press(false)}
    >
      <span
        className={
          wordGlyph
            ? "text-lg sm:text-xl uppercase tracking-[0.08em] leading-none"
            : "text-3xl sm:text-4xl leading-none"
        }
        aria-hidden="true"
      >
        {glyph}
      </span>
      {sub && (
        <span className="mt-1 text-[10px] uppercase tracking-[0.12em] font-semibold text-text-muted">
          {sub}
        </span>
      )}
    </button>
  );
}

type ControlId = "left" | "right" | "climb" | "jump";

interface Control {
  id: ControlId;
  label: string;
  glyph: string;
  /** Small caption under the glyph. */
  sub?: string;
  /** Signal-coloured treatment for the primary action. */
  accent?: boolean;
  /** Glyph is a word ("JMP"), not a single arrow — needs a smaller type size. */
  wordGlyph?: boolean;
}

const MOVE_CONTROLS: readonly Control[] = [
  { id: "left", label: "Move left", glyph: "←" },
  { id: "right", label: "Move right", glyph: "→" },
];

const CLIMB_CONTROLS: readonly Control[] = [
  { id: "climb", label: "Climb up ladder", glyph: "↑", sub: "climb" },
  { id: "jump", label: "Jump", glyph: "JMP", accent: true, wordGlyph: true },
];

/**
 * Height the control bar occupies, for useCanvasSize's `reserveBelow`. Covers
 * the tallest button (84px) plus its top margin and a little slack, so the
 * controls stay on screen instead of being pushed below the fold.
 */
export const TOUCH_CONTROLS_RESERVE = 104;
