"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Virtual joystick (move + climb) on the left, jump button on the right.
 * Wired into useClimb via setTouch, and only mounted on coarse-pointer devices.
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
import { NO_JOYSTICK, type JoystickAxes } from "./joystickInput";
import { VirtualJoystick, JOYSTICK_ZONE_HEIGHT } from "./VirtualJoystick";
import {
  initialHoldMemo,
  isHoldKey,
  mergeTouchInput,
  reduceHold,
  type ControlId,
  type HoldEvent,
  type HoldMemo,
} from "./touchHold";

const JUMP_CONTROL = {
  id: "jump" as const,
  label: "Jump",
  glyph: "JMP",
  accent: true,
  wordGlyph: true,
};

export function TouchControls({
  active,
  onInput,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
}) {
  const memoRef = useRef<HoldMemo>(initialHoldMemo());
  const joystickRef = useRef<JoystickAxes>(NO_JOYSTICK);
  const [jumpHeld, setJumpHeld] = useState(false);

  const emitInput = useCallback(
    (held: ReadonlySet<ControlId>, joystick: JoystickAxes) => {
      onInput(mergeTouchInput(joystick, held));
    },
    [onInput]
  );

  const apply = useCallback(
    (event: HoldEvent) => {
      const next = reduceHold(memoRef.current, event);
      memoRef.current = next;
      setJumpHeld(next.held.has("jump"));
      emitInput(next.held, joystickRef.current);
    },
    [emitInput]
  );

  const release = useCallback(
    (id: ControlId) => {
      apply({ kind: "release", id });
      // Enter's keydown preventDefault cancels the compatibility click that
      // would otherwise clear suppressActivate, and some pointer paths never
      // deliver a click at all. Clear the flag after this turn: click, if it
      // fires, runs first and consumes it; if it does not, this opens the
      // toggle path again.
      queueMicrotask(() => apply({ kind: "clear-suppress", id }));
    },
    [apply]
  );

  const handleJoystick = useCallback(
    (axes: JoystickAxes) => {
      joystickRef.current = axes;
      emitInput(memoRef.current.held, axes);
    },
    [emitInput]
  );

  useEffect(() => {
    if (active) return;
    memoRef.current = initialHoldMemo();
    joystickRef.current = NO_JOYSTICK;
    setJumpHeld(false);
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
      <div className="flex items-end justify-between gap-3">
        <VirtualJoystick onChange={handleJoystick} />
        <TouchButton
          control={JUMP_CONTROL}
          held={jumpHeld}
          onEvent={apply}
          onRelease={release}
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
}: {
  control: typeof JUMP_CONTROL;
  held: boolean;
  onEvent: (event: HoldEvent) => void;
  onRelease: (id: ControlId) => void;
}) {
  const { id, label, glyph, accent, wordGlyph } = control;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      style={{ touchAction: "none" }}
      className={
        "relative flex flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
        "min-h-[92px] min-w-[92px] flex-shrink-0 backdrop-blur-sm " +
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
        // Do not preventDefault: that cancels the compatibility click the
        // suppress flag exists to ignore. Scrolling is already killed by
        // touch-action: none.
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
    </button>
  );
}

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
export const TOUCH_CONTROLS_INSET = JOYSTICK_ZONE_HEIGHT + 16;
