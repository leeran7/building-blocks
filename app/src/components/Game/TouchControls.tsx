"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * WASD-style pad on the left (W = climb up, S = climb down, A/D = move) and a
 * jump button on the right. Wired into useClimb via setTouch, and only mounted
 * on coarse-pointer devices.
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
import {
  initialHoldMemo,
  isHoldKey,
  reduceHold,
  touchInputFromHeld,
  type ControlId,
  type HoldEvent,
  type HoldMemo,
} from "./touchHold";

interface Control {
  id: ControlId;
  label: string;
  glyph: string;
  /** Small caption under the glyph. */
  sub?: string;
  /** Signal-coloured treatment for the primary action. */
  accent?: boolean;
  /** Glyph is a word ("JMP"), not a single letter — needs a smaller type size. */
  wordGlyph?: boolean;
}

const WASD_CONTROLS = {
  climb: { id: "climb" as const, label: "Climb up", glyph: "W" },
  left: { id: "left" as const, label: "Move left", glyph: "A" },
  down: { id: "down" as const, label: "Climb down", glyph: "S" },
  right: { id: "right" as const, label: "Move right", glyph: "D" },
} as const;

const JUMP_CONTROL: Control = {
  id: "jump",
  label: "Jump",
  glyph: "JMP",
  accent: true,
  wordGlyph: true,
};

const PAD_BUTTON_CLASS =
  "relative flex flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
  "h-[72px] w-[72px] backdrop-blur-sm transition-[filter,transform,background-color] ";

export function TouchControls({
  active,
  onInput,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
}) {
  const memoRef = useRef<HoldMemo>(initialHoldMemo());
  const [pressed, setPressed] = useState<ReadonlySet<ControlId>>(new Set());

  const apply = useCallback(
    (event: HoldEvent) => {
      const next = reduceHold(memoRef.current, event);
      memoRef.current = next;
      setPressed(next.held);
      onInput(touchInputFromHeld(next.held));
    },
    [onInput]
  );

  const release = useCallback(
    (id: ControlId) => {
      apply({ kind: "release", id });
      queueMicrotask(() => apply({ kind: "clear-suppress", id }));
    },
    [apply]
  );

  useEffect(() => {
    if (active) return;
    memoRef.current = initialHoldMemo();
    setPressed(new Set());
    onInput(NO_TOUCH);
  }, [active, onInput]);

  if (!active) return null;

  return (
    <div
      role="group"
      className="absolute inset-x-0 bottom-0 z-10 select-none p-2"
      style={{ touchAction: "none" }}
      aria-label="Touch game controls"
    >
      <div className="flex items-end justify-between gap-3">
        <div
          role="group"
          aria-label="WASD movement and climb"
          className="grid grid-cols-3 gap-1.5"
          style={{ gridTemplateRows: "repeat(2, 72px)" }}
        >
          <div className="col-start-2">
            <TouchButton
              control={WASD_CONTROLS.climb}
              held={pressed.has("climb")}
              onEvent={apply}
              onRelease={release}
            />
          </div>
          <TouchButton
            control={WASD_CONTROLS.left}
            held={pressed.has("left")}
            onEvent={apply}
            onRelease={release}
          />
          <TouchButton
            control={WASD_CONTROLS.down}
            held={pressed.has("down")}
            onEvent={apply}
            onRelease={release}
          />
          <TouchButton
            control={WASD_CONTROLS.right}
            held={pressed.has("right")}
            onEvent={apply}
            onRelease={release}
          />
        </div>

        <TouchButton
          control={JUMP_CONTROL}
          held={pressed.has("jump")}
          onEvent={apply}
          onRelease={release}
          className="min-h-[148px] min-w-[92px]"
        />
      </div>
    </div>
  );
}

function TouchButton({
  control,
  held,
  onEvent,
  onRelease,
  className = "",
}: {
  control: Control;
  held: boolean;
  onEvent: (event: HoldEvent) => void;
  onRelease: (id: ControlId) => void;
  className?: string;
}) {
  const { id, label, glyph, accent, wordGlyph } = control;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      style={{ touchAction: "none" }}
      className={
        PAD_BUTTON_CLASS +
        className +
        (held
          ? accent
            ? "border-signal bg-signal/90 text-void scale-95 "
            : "border-border-strong bg-elevated/95 text-text-primary scale-95 "
          : accent
          ? "border-signal/70 bg-void/85 text-signal shadow-signal "
          : "border-border-strong bg-void/80 text-text-primary ")
      }
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onEvent({ kind: "press", id });
      }}
      onPointerUp={() => onRelease(id)}
      onPointerCancel={() => onRelease(id)}
      onLostPointerCapture={() => onRelease(id)}
      onKeyDown={(e) => {
        if (!isHoldKey(e.key)) return;
        e.preventDefault();
        if (e.repeat) return;
        onEvent({ kind: "press", id });
      }}
      onKeyUp={(e) => {
        if (!isHoldKey(e.key)) return;
        e.preventDefault();
        onRelease(id);
      }}
      onClick={(e) => {
        e.preventDefault();
        onEvent({ kind: "activate", id });
      }}
    >
      <span
        className={
          wordGlyph
            ? "text-lg uppercase tracking-[0.08em] leading-none"
            : "text-2xl leading-none"
        }
        aria-hidden="true"
      >
        {glyph}
      </span>
    </button>
  );
}

/**
 * Canvas height these controls cover: two 72px WASD rows plus `p-2` top and
 * bottom (8px * 2 = 16px). Passed to ClimbCanvas as `bottomInset` so the camera
 * keeps the climber above the buttons instead of behind them.
 */
export const TOUCH_CONTROLS_INSET = 160;
