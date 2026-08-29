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
import { POWER_UP_SPECS } from "../../game/powerups";
import type { PowerUpType } from "../../game/types";

export function TouchControls({
  active,
  onInput,
  heldPowerUp = null,
  powerUpReady = false,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
  /** Banked power-up, so the USE button can show what it will spend. */
  heldPowerUp?: PowerUpType | null;
  /** False while the banked power-up is still cooling down. */
  powerUpReady?: boolean;
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
      power: held.has("power"),
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

        {/* Always mounted, dimmed when empty: mounting it on pickup would resize
            the neighbouring buttons under the player's thumbs mid-climb. */}
        <TouchButton
          control={{
            ...POWER_CONTROL,
            glyph: heldPowerUp ? POWER_UP_SPECS[heldPowerUp].glyph : POWER_CONTROL.glyph,
            label: heldPowerUp
              ? `Use ${POWER_UP_SPECS[heldPowerUp].label}`
              : POWER_CONTROL.label,
          }}
          held={pressed.has("power")}
          disabled={!heldPowerUp || !powerUpReady}
          tint={heldPowerUp ? POWER_UP_SPECS[heldPowerUp].color : undefined}
          onHoldChange={setHeld}
        />

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
  disabled = false,
  tint,
  onHoldChange,
}: {
  control: Control;
  held: boolean;
  /** Rendered but inert — used by the power-up button when nothing is banked. */
  disabled?: boolean;
  /** Overrides the border/text colour, so the button matches the banked orb. */
  tint?: string;
  onHoldChange: (id: ControlId, down: boolean) => void;
}) {
  const { id, label, glyph, sub, accent, wordGlyph, narrow } = control;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      aria-disabled={disabled}
      style={{
        touchAction: "none",
        // Inline, because the orb colours are data rather than a fixed palette.
        ...(tint && !held && !disabled ? { borderColor: tint, color: tint } : null),
      }}
      className={
        // Width first: `narrow` and the default must not both set `flex`, since
        // competing flex utilities resolve by stylesheet order, not by the order
        // they are concatenated here.
        (narrow ? "flex-none basis-[72px] " : "flex-1 ") +
        (disabled ? "opacity-40 " : "") +
        "relative flex flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
        "min-h-[80px] min-w-[44px] backdrop-blur-sm " +
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
        if (disabled) return;
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

type ControlId = "left" | "right" | "climb" | "jump" | "power";

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
  /** Fixed narrow width instead of sharing the row equally. */
  narrow?: boolean;
}

const MOVE_CONTROLS: readonly Control[] = [
  { id: "left", label: "Move left", glyph: "←" },
  { id: "right", label: "Move right", glyph: "→" },
];

const CLIMB_CONTROLS: readonly Control[] = [
  { id: "climb", label: "Climb up ladder", glyph: "↑", sub: "climb" },
  { id: "jump", label: "Jump", glyph: "JMP", accent: true, wordGlyph: true },
];

const POWER_CONTROL: Control = {
  id: "power",
  label: "Use power-up (none held)",
  glyph: "◆",
  sub: "use",
  narrow: true,
};

/**
 * Canvas height these controls cover: `min-h-[80px]` plus `p-2` top and bottom.
 * Passed to ClimbCanvas as `bottomInset` so the camera keeps the climber above
 * the buttons instead of behind them.
 *
 * Button height and padding are deliberately breakpoint-free. When they varied
 * by breakpoint this constant matched only the phone case and understated the
 * bar by 16px at `sm:`, drawing the climber inside the buttons on tablets and
 * on any phone in landscape.
 */
export const TOUCH_CONTROLS_INSET = 96;
