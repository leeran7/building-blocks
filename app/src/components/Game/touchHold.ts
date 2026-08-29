/**
 * Press/hold state for the on-screen climb controls.
 *
 * Pointer and key have a press/release pair. Assistive tech (VoiceOver,
 * TalkBack, Switch Control) typically synthesizes a click with no pair, so
 * that path still toggles.
 *
 * Browsers also fire a compatibility click after pointerup — on iOS that
 * click can arrive hundreds of milliseconds later. Clearing the suppress
 * flag on a microtask opened a race: the delayed click looked like an AT
 * activate and latched the button on. Ignore activate for a short window
 * after any press/release of that control instead.
 */

export const CLICK_GUARD_MS = 700;

export function initialHoldMemo(): HoldMemo {
  return { held: new Set(), lastInputAt: new Map() };
}

export function isHoldKey(key: string): boolean {
  return key === " " || key === "Enter" || key === "Spacebar";
}

export function reduceHold(
  memo: HoldMemo,
  event: HoldEvent,
  now = Date.now()
): HoldMemo {
  const held = new Set(memo.held);
  const lastInputAt = new Map(memo.lastInputAt);
  switch (event.kind) {
    case "press":
      held.add(event.id);
      lastInputAt.set(event.id, now);
      return { held, lastInputAt };
    case "release":
      held.delete(event.id);
      lastInputAt.set(event.id, now);
      return { held, lastInputAt };
    case "activate": {
      const last = lastInputAt.get(event.id);
      if (last != null && now - last < CLICK_GUARD_MS) {
        return memo;
      }
      if (held.has(event.id)) held.delete(event.id);
      else held.add(event.id);
      return { held, lastInputAt };
    }
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
    down: held.has("down"),
    jump: held.has("jump"),
  };
}

export type ControlId = "left" | "right" | "climb" | "down" | "jump";

export type HoldEvent =
  | { kind: "press"; id: ControlId }
  | { kind: "release"; id: ControlId }
  | { kind: "activate"; id: ControlId };

export interface HoldMemo {
  held: ReadonlySet<ControlId>;
  /** Latest press/release time per control, used to ignore delayed clicks. */
  lastInputAt: ReadonlyMap<ControlId, number>;
}
