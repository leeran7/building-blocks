"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Left: move (← →). Right: climb (hold ↑) + jump. Wired into useClimb via
 * setTouch — only rendered on coarse-pointer devices during an active run.
 */

import { useCallback, useEffect, useRef } from "react";
import { NO_TOUCH, type TouchInput } from "../../game/useClimb";

export function TouchControls({
  active,
  onInput,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
}) {
  const pressedRef = useRef<Set<string>>(new Set());

  const emit = useCallback(() => {
    const s = pressedRef.current;
    onInput({
      left: s.has("left"),
      right: s.has("right"),
      up: s.has("climb"),
      down: false,
      jump: s.has("jump"),
    });
  }, [onInput]);

  const setKey = useCallback(
    (id: string, down: boolean) => {
      const s = pressedRef.current;
      if (down) s.add(id);
      else s.delete(id);
      emit();
    },
    [emit]
  );

  useEffect(() => {
    if (!active) {
      pressedRef.current = new Set();
      onInput(NO_TOUCH);
    }
  }, [active, onInput]);

  if (!active) return null;

  return (
    <div
      className="w-full select-none mt-3"
      style={{ touchAction: "none" }}
      aria-label="Touch game controls"
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <TouchBtn
            label="Move left"
            glyph="←"
            onDown={() => setKey("left", true)}
            onUp={() => setKey("left", false)}
          />
          <TouchBtn
            label="Move right"
            glyph="→"
            onDown={() => setKey("right", true)}
            onUp={() => setKey("right", false)}
          />
        </div>

        <div className="flex items-center gap-2">
          <TouchBtn
            label="Climb up"
            glyph="↑"
            sub="climb"
            onDown={() => setKey("climb", true)}
            onUp={() => setKey("climb", false)}
          />
          <TouchBtn
            label="Jump"
            glyph="JMP"
            accent
            onDown={() => setKey("jump", true)}
            onUp={() => setKey("jump", false)}
          />
        </div>
      </div>
    </div>
  );
}

function TouchBtn({
  label,
  glyph,
  sub,
  accent,
  onDown,
  onUp,
}: {
  label: string;
  glyph: string;
  sub?: string;
  accent?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={
        "relative flex flex-col items-center justify-center rounded-2xl border font-mono font-bold transition-[filter,transform,background-color] active:scale-95 " +
        (accent
          ? "min-w-[56px] min-h-[56px] border-signal/50 bg-signal/15 text-signal shadow-signal active:bg-signal/25"
          : "min-w-[52px] min-h-[52px] border-border-strong bg-surface/80 text-text-primary active:bg-elevated")
      }
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onUp();
      }}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    >
      <span className={sub ? "text-xl leading-none" : "text-[11px] uppercase tracking-[0.08em] leading-none"} aria-hidden="true">
        {glyph}
      </span>
      {sub && (
        <span className="text-[9px] uppercase tracking-[0.12em] text-text-muted mt-0.5 font-semibold">
          {sub}
        </span>
      )}
    </button>
  );
}
