"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Four buttons in a single row: move (← →), climb (hold ↑), jump. Wired into
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
import {
  initialHoldMemo,
  isHoldKey,
  reduceHold,
  touchInputFromHeld,
  type ControlId,
  type HoldEvent,
  type HoldMemo,
} from "./touchHold";

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
      const next = reduceHold(memoRef.current, event, performance.now());
      memoRef.current = next;
      setPressed(next.held);
      onInput(touchInputFromHeld(next.held));
    },
    [onInput]
  );

  const reset = useCallback(() => {
    memoRef.current = initialHoldMemo();
    setPressed(new Set());
    onInput(NO_TOUCH);
  }, [onInput]);

  useEffect(() => {
    if (active) return;
    reset();
  }, [active, reset]);

  // A finger still down when the tab hides never gets pointerup. Without this
  // the control stays held and the climber keeps walking after the user returns.
  useEffect(() => {
    if (!active) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") reset();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", reset);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", reset);
    };
  }, [active, reset]);

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
      <div className="grid grid-cols-4 gap-2">
        {ALL_CONTROLS.map((control) => (
          <TouchButton
            key={control.id}
            control={control}
            held={pressed.has(control.id)}
            onEvent={apply}
          />
        ))}
      </div>
    </div>
  );
}

function TouchButton({
  control,
  held,
  onEvent,
}: {
  control: Control;
  held: boolean;
  onEvent: (event: HoldEvent) => void;
}) {
  const { id, label, glyph, sub, accent, wordGlyph } = control;

  return (
    <button
      type="button"
      data-game-control
      aria-label={label}
      aria-pressed={held}
      style={{ touchAction: "none" }}
      onContextMenu={(e) => e.preventDefault()}
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
        // Do not preventDefault: scrolling is already killed by
        // touch-action: none, and a cancelled pointerdown can skip pointerup
        // on some mobile browsers, which is another way a hold gets stuck.
        e.currentTarget.setPointerCapture(e.pointerId);
        onEvent({ kind: "press", id });
      }}
      onPointerUp={() => onEvent({ kind: "release", id })}
      onPointerCancel={() => onEvent({ kind: "release", id })}
      onLostPointerCapture={() => onEvent({ kind: "release", id })}
      onKeyDown={(e) => {
        if (!isHoldKey(e.key)) return;
        e.preventDefault();
        if (e.repeat) return;
        onEvent({ kind: "press", id });
      }}
      onKeyUp={(e) => {
        if (!isHoldKey(e.key)) return;
        e.preventDefault();
        onEvent({ kind: "release", id });
      }}
      onClick={(e) => {
        // Pointer and keyboard already applied press/release. The remaining
        // click is the AT path (VoiceOver/TalkBack synthesise click with no
        // pair). preventDefault keeps Enter from firing this after keyup when
        // keydown did not already cancel it.
        e.preventDefault();
        onEvent({ kind: "activate", id });
      }}
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
  { id: "climb", label: "Climb up ladder", glyph: "↑", sub: "climb" },
  { id: "jump", label: "Jump", glyph: "JMP", accent: true, wordGlyph: true },
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
