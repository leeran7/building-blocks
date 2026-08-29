"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Three buttons in a single row: move (← →) and a shared jump/climb action.
 * Wired into
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
    const action = held.has("action");
    onInput({
      left: held.has("left"),
      right: held.has("right"),
      up: action,
      down: false,
      jump: action,
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
      role="group"
      className="absolute inset-x-0 bottom-0 z-10 select-none p-2"
      style={{ touchAction: "none" }}
      aria-label="Touch game controls"
    >
      <div className="grid grid-cols-3 gap-2">
        {ALL_CONTROLS.map((control) => (
          <TouchButton
            key={control.id}
            control={control}
            held={pressed.has(control.id)}
            onHoldChange={setHeld}
          />
        ))}
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
      style={{ touchAction: "none" }}
      className={
        "relative flex flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
        "min-h-[92px] min-w-[44px] backdrop-blur-sm " +
        "transition-[filter,transform,background-color] " +
        // One ternary per state rather than appending the held colour: competing
        // background utilities are resolved by stylesheet order, not by the
        // order they appear here, so an appended override silently loses.
        // Backgrounds stay opaque enough to read over the orange lava band, and
        // the pressed accent flips the glyph to dark for contrast on lime.
        (held
          ? accent
            ? "border-signal bg-signal/90 text-void scale-95 "
            : "border-border-strong bg-elevated/95 text-text-primary scale-95 "
          : accent
          ? "border-signal/70 bg-void/85 text-signal shadow-signal "
          : "border-border-strong bg-void/80 text-text-primary ")
      }
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
            ? "text-lg uppercase tracking-[0.08em] leading-none"
            : "text-3xl leading-none"
        }
        aria-hidden="true"
      >
        {glyph}
      </span>
      {sub && (
        // text-secondary, not text-muted: muted only reaches 3.5:1 where the
        // lava band shows through behind the button.
        <span
          className={
            "mt-1 text-[10px] uppercase tracking-[0.12em] font-semibold " +
            (held ? "text-inherit" : "text-text-secondary")
          }
        >
          {sub}
        </span>
      )}
    </button>
  );
}

type ControlId = "left" | "right" | "action";

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

const ALL_CONTROLS: readonly Control[] = [
  { id: "left", label: "Move left", glyph: "←" },
  { id: "right", label: "Move right", glyph: "→" },
  {
    id: "action",
    label: "Jump or climb up",
    glyph: "↑",
    sub: "jump · climb",
    accent: true,
  },
];

/**
 * Canvas height these controls cover: `min-h-[92px]` plus `p-2` top and bottom
 * (8px * 2 = 16px). Passed to ClimbCanvas as `bottomInset` so the camera keeps
 * the climber above the buttons instead of behind them.
 *
 * Button height and padding are deliberately breakpoint-free. When they varied
 * by breakpoint this constant matched only the phone case and understated the
 * bar by 16px at `sm:`, drawing the climber inside the buttons on tablets and
 * on any phone in landscape.
 */
export const TOUCH_CONTROLS_INSET = 108;
