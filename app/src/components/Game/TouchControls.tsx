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
 *
 * The "joystick" control scheme (chosen in settings, per device) swaps the
 * arrow and climb buttons for a TouchJoystick on the left, keeping jump as a
 * button on the right. Both feed the same TouchInput.
 */

import "./expedition.css";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NO_TOUCH, type TouchInput } from "../../game/useClimb";
import { useControlScheme } from "../../lib/controlScheme";
import { JOYSTICK_CENTERED, withJoystick, type JoystickDirection } from "./joystick";
import { TouchJoystick } from "./TouchJoystick";
import {
  initialHoldMemo,
  isHoldKey,
  reduceHold,
  touchInputFromHeld,
  type ControlId,
  type HoldEvent,
  type HoldMemo,
} from "./touchHold";

const TouchButton = memo(function TouchButton({
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
      data-primary={Boolean(accent)}
      className="exp-touch-button relative flex min-w-[44px] flex-col items-center justify-center font-mono font-bold"
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
});

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

const JUMP_CONTROL = ALL_CONTROLS.find((c) => c.id === "jump")!;

export function TouchControls({
  active,
  onInput,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
}) {
  const [scheme] = useControlScheme();
  const memoRef = useRef<HoldMemo>(initialHoldMemo());
  const stickRef = useRef<JoystickDirection>(JOYSTICK_CENTERED);
  const [pressed, setPressed] = useState<ReadonlySet<ControlId>>(new Set());
  // Remounts the joystick on reset so its knob and pointer state clear too.
  const [stickKey, setStickKey] = useState(0);

  const apply = useCallback(
    (event: HoldEvent) => {
      const next = reduceHold(memoRef.current, event, performance.now());
      memoRef.current = next;
      setPressed(next.held);
      onInput(withJoystick(touchInputFromHeld(next.held), stickRef.current));
    },
    [onInput]
  );

  const steer = useCallback(
    (direction: JoystickDirection) => {
      stickRef.current = direction;
      onInput(withJoystick(touchInputFromHeld(memoRef.current.held), direction));
    },
    [onInput]
  );

  const reset = useCallback(() => {
    memoRef.current = initialHoldMemo();
    stickRef.current = JOYSTICK_CENTERED;
    setPressed(new Set());
    setStickKey((k) => k + 1);
    onInput(NO_TOUCH);
  }, [onInput]);

  useEffect(() => {
    if (active) return;
    reset();
  }, [active, reset]);

  // Switching scheme mid-run must not leave a control from the old layout held.
  const schemeRef = useRef(scheme);
  useEffect(() => {
    if (schemeRef.current === scheme) return;
    schemeRef.current = scheme;
    reset();
  }, [scheme, reset]);

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
      className="exp-mobile-controls absolute inset-x-0 bottom-0 z-10 select-none"
      style={{
        touchAction: "none",
        // Sit inside the safe area so the buttons clear the home indicator and
        // the rounded display corners, but never less than a comfortable gutter.
        paddingTop: 8,
        paddingLeft: "max(10px, env(safe-area-inset-left))",
        paddingRight: "max(10px, env(safe-area-inset-right))",
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
      }}
      aria-label="Touch game controls"
    >
      {scheme === "joystick" ? (
        <div className="flex items-center justify-between gap-2.5">
          <TouchJoystick key={stickKey} onChange={steer} />
          <div className="grid w-[40%] max-w-[180px]">
            <TouchButton
              control={JUMP_CONTROL}
              held={pressed.has("jump")}
              onEvent={apply}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2.5">
          {ALL_CONTROLS.map((control) => (
            <TouchButton
              key={control.id}
              control={control}
              held={pressed.has(control.id)}
              onEvent={apply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Height these controls cover ABOVE the safe area: the `min-h-[104px]` button
 * plus the 8px top gutter. Callers add the bottom padding —
 * `max(10px, safe-area-inset-bottom)` — themselves, because the safe-area part
 * is only known at runtime (see ClimbScene). The sum is passed to ClimbCanvas as
 * `bottomInset` so the camera keeps the climber above the buttons.
 *
 * Button height and padding are deliberately breakpoint-free. When they varied
 * by breakpoint this constant matched only the phone case and understated the
 * bar, drawing the climber inside the buttons on tablets and in landscape.
 */
export const TOUCH_CONTROLS_INSET = 112;
/** Minimum bottom gutter under the buttons, matched to the container padding. */
export const TOUCH_CONTROLS_MIN_BOTTOM = 10;

/** Responsive presentation alias; the established input reducer is unchanged. */
export const MobileControls = TouchControls;
