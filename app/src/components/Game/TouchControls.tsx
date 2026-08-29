"use client";

/**
 * On-screen touch controls for The Climb (mobile Phase 1).
 *
 * Arrow D-pad on the left (↑ climb, ↓ descend, ← → move) and jump on the
 * right. Wired into useClimb via setTouch, and only mounted on coarse-pointer
 * devices.
 *
 * These sit *over* the bottom of the canvas rather than in a bar beneath it. A
 * phone has ~660px of viewport, and a 9:16 canvas wants all of it: a separate
 * 100px bar was taking that height from the canvas and still ending up below
 * the fold, so the game shrank and the buttons needed a scroll to reach. On top
 * of the canvas they cost no layout height and are always reachable. They only
 * cover the lava band well below the climber, who is held at ~62% of the view.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  /** Glyph is a word ("JMP"), not a single arrow — needs a smaller type size. */
  wordGlyph?: boolean;
}

const D_PAD_CONTROLS = {
  climb: { id: "climb" as const, label: "Climb up ladder", glyph: "↑", sub: "climb" },
  left: { id: "left" as const, label: "Move left", glyph: "←" },
  down: { id: "down" as const, label: "Climb down ladder", glyph: "↓" },
  right: { id: "right" as const, label: "Move right", glyph: "→" },
} as const;

const JUMP_CONTROL: Control = {
  id: "jump",
  label: "Jump",
  glyph: "JMP",
  accent: true,
  wordGlyph: true,
};

/** Two 92px rows plus the `gap-2` (8px) between them. */
const D_PAD_HEIGHT = 192;

export function TouchControls({
  active,
  onInput,
}: {
  active: boolean;
  onInput: (input: TouchInput) => void;
}) {
  const memoRef = useRef<HoldMemo>(initialHoldMemo());
  const pointersRef = useRef(new Map<number, ControlId>());
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

  const press = useCallback(
    (id: ControlId, pointerId?: number) => {
      if (pointerId != null) pointersRef.current.set(pointerId, id);
      apply({ kind: "press", id });
    },
    [apply]
  );

  const release = useCallback(
    (id: ControlId, pointerId?: number) => {
      if (pointerId != null) pointersRef.current.delete(pointerId);
      apply({ kind: "release", id });
    },
    [apply]
  );

  useEffect(() => {
    const onWindowPointerUp = (e: PointerEvent) => {
      const id = pointersRef.current.get(e.pointerId);
      if (!id) return;
      pointersRef.current.delete(e.pointerId);
      apply({ kind: "release", id });
    };
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
    };
  }, [apply]);

  useEffect(() => {
    if (active) return;
    memoRef.current = initialHoldMemo();
    pointersRef.current.clear();
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
      <div className="flex items-end justify-between gap-2">
        <div
          role="group"
          aria-label="Directional controls"
          className="grid grid-cols-3 grid-rows-2 gap-2"
        >
          <div className="col-start-2 row-start-1">
            <TouchButton
              control={D_PAD_CONTROLS.climb}
              held={pressed.has("climb")}
              onPress={press}
              onRelease={release}
              onEvent={apply}
            />
          </div>
          <div className="col-start-1 row-start-2">
            <TouchButton
              control={D_PAD_CONTROLS.left}
              held={pressed.has("left")}
              onPress={press}
              onRelease={release}
              onEvent={apply}
            />
          </div>
          <div className="col-start-2 row-start-2">
            <TouchButton
              control={D_PAD_CONTROLS.down}
              held={pressed.has("down")}
              onPress={press}
              onRelease={release}
              onEvent={apply}
            />
          </div>
          <div className="col-start-3 row-start-2">
            <TouchButton
              control={D_PAD_CONTROLS.right}
              held={pressed.has("right")}
              onPress={press}
              onRelease={release}
              onEvent={apply}
            />
          </div>
        </div>

        <TouchButton
          control={JUMP_CONTROL}
          held={pressed.has("jump")}
          onPress={press}
          onRelease={release}
          onEvent={apply}
          style={{ height: D_PAD_HEIGHT }}
        />
      </div>
    </div>
  );
}

function TouchButton({
  control,
  held,
  onPress,
  onRelease,
  onEvent,
  style,
}: {
  control: Control;
  held: boolean;
  onPress: (id: ControlId, pointerId?: number) => void;
  onRelease: (id: ControlId, pointerId?: number) => void;
  onEvent: (event: HoldEvent) => void;
  style?: CSSProperties;
}) {
  const { id, label, glyph, sub, accent, wordGlyph } = control;

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onPress(id, e.pointerId);
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      style={{ touchAction: "none", ...style }}
      className={
        "relative flex flex-col items-center justify-center rounded-2xl border font-mono font-bold " +
        "min-h-[92px] min-w-[72px] backdrop-blur-sm " +
        "transition-[filter,transform,background-color] " +
        (held
          ? accent
            ? "border-signal bg-signal/90 text-void scale-95 "
            : "border-border-strong bg-elevated/95 text-text-primary scale-95 "
          : accent
          ? "border-signal/70 bg-void/85 text-signal shadow-signal "
          : "border-border-strong bg-void/80 text-text-primary ")
      }
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => onRelease(id, e.pointerId)}
      onPointerCancel={(e) => onRelease(id, e.pointerId)}
      onLostPointerCapture={(e) => onRelease(id, e.pointerId)}
      onKeyDown={(e) => {
        if (!isHoldKey(e.key)) return;
        e.preventDefault();
        if (e.repeat) return;
        onPress(id);
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
            : "text-3xl leading-none"
        }
        aria-hidden="true"
      >
        {glyph}
      </span>
      {sub && (
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

/**
 * Canvas height these controls cover: two `min-h-[92px]` rows plus `gap-2`
 * (8px) and `p-2` top/bottom (16px). Passed to ClimbCanvas as `bottomInset`.
 */
export const TOUCH_CONTROLS_INSET = D_PAD_HEIGHT + 16;
