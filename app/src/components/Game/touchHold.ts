/**
 * Press/hold state for the on-screen climb controls.
 *
 * Pointer and key have a press/release pair. Assistive tech typically
 * synthesizes a click with no pair, so that path toggles. Browsers also fire a
 * click after pointerup/keyup, which must not toggle or a tap would press and
 * immediately release — or, worse, latch the control ON after release.
 *
 * That latch is what `b526fdb` shipped: it cleared the suppress flag on a
 * microtask so a missing click could not "eat" the next VoiceOver activate.
 * Touch browsers (and iOS historically at ~300 ms) fire the compatibility click
 * in a *later task*, after microtasks. That click looked like AT and toggled
 * the button on with nothing to release it — climber stuck walking/climbing.
 *
 * Suppress is therefore a timestamp window, not a boolean and not a microtask.
 * `now` is injected so tests can drive the window without fake timers.
 */

export function initialHoldMemo(): HoldMemo {
  return { held: new Set(), suppressUntil: new Map() };
}

export function isHoldKey(key: string): boolean {
  return key === " " || key === "Enter" || key === "Spacebar";
}

export function reduceHold(
  memo: HoldMemo,
  event: HoldEvent,
  now: number
): HoldMemo {
  const held = new Set(memo.held);
  const suppressUntil = new Map(memo.suppressUntil);
  switch (event.kind) {
    case "press":
      held.add(event.id);
      suppressUntil.set(event.id, now + GHOST_CLICK_WINDOW_MS);
      return { held, suppressUntil };
    case "release":
      held.delete(event.id);
      suppressUntil.set(event.id, now + GHOST_CLICK_WINDOW_MS);
      return { held, suppressUntil };
    case "activate":
      // Do not consume the window on a suppressed click: some browsers fire
      // click twice, and consuming would let the second one latch ON.
      if ((suppressUntil.get(event.id) ?? 0) > now) {
        return memo;
      }
      if (held.has(event.id)) held.delete(event.id);
      else held.add(event.id);
      return { held, suppressUntil };
  }
}

export function touchInputFromHeld(held: ReadonlySet<ControlId>): {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
} {
  return {
    left: held.has("left"),
    right: held.has("right"),
    up: held.has("climb"),
    down: false,
    jump: held.has("jump"),
  };
}

/**
 * Compatibility-click window after a pointer/key cycle.
 *
 * Must cover the historic iOS ~300 ms click delay and the more common case of
 * a click dispatched in a later task than pointerup (which a microtask clear
 * cannot wait for).
 */
export const GHOST_CLICK_WINDOW_MS = 500;

export type ControlId = "left" | "right" | "climb" | "jump";

export type HoldEvent =
  | { kind: "press"; id: ControlId }
  | { kind: "release"; id: ControlId }
  | { kind: "activate"; id: ControlId };

export interface HoldMemo {
  held: ReadonlySet<ControlId>;
  /** Earliest `now` at which an activate may toggle this control. */
  suppressUntil: ReadonlyMap<ControlId, number>;
}
