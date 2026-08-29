"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Left cluster: move (← →). Right cluster: climb (hold ↑) + jump. Wired into
 * useClimb via setTouch, and only mounted on coarse-pointer devices.
 *
 * These sit *over* the bottom of the canvas rather than in a bar beneath it. A
 * phone has ~660px of viewport, and a 9:16 canvas wants all of it: a separate
 * 100px bar was taking that height from the canvas and still ending up below
 * the fold, so the game shrank and the buttons needed a scroll to reach. On top
 * of the canvas they cost no layout height and are always reachable. They only
 * cover the lava band well below the climber, who is held at ~62% of the view.
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

  // Absolutely positioned, so unmounting between runs costs the canvas no
  // height and cannot resize the game mid-transition.
  if (!active) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 select-none p-2 sm:p-3"
      style={{ touchAction: "none" }}
      aria-label="Touch game controls"
    >
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 items-stretch gap-2">
          {MOVE_CONTROLS.map((control) => (
            <TouchButton
              key={control.id}
              control={control}
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
  held,
  onHoldChange,
}: {
  control: Control;
  held: boolean;
  onHoldChange: (id: ControlId, down: boolean) => void;
}) {
  const { id, label, glyph, sub, accent, wordGlyph } = control;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      className={
        "relative flex flex-1 flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
        "min-h-[80px] sm:min-h-[88px] backdrop-blur-sm " +
        "transition-[filter,transform,background-color] active:scale-95 " +
        // Opaque enough to stay legible where the lava band shows through.
        (accent
          ? "border-signal/70 bg-void/85 text-signal shadow-signal "
          : "border-border-strong bg-void/80 text-text-primary ") +
        (held ? (accent ? "bg-signal/35 scale-95 " : "bg-elevated/95 scale-95 ") : "")
      }
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onHoldChange(id, true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onHoldChange(id, false);
      }}
      onPointerCancel={() => onHoldChange(id, false)}
      onLostPointerCapture={() => onHoldChange(id, false)}
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
 * Canvas height these controls cover — the tallest button plus its padding.
 * Passed to ClimbCanvas as `bottomInset` so the camera keeps the climber above
 * the buttons instead of behind them.
 */
export const TOUCH_CONTROLS_INSET = 96;
