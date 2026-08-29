/**
 * Press/hold state for the on-screen climb controls.
 *
 * The buttons used to listen only to pointer events. Keyboard (Space/Enter),
 * iOS Switch Control, VoiceOver double-tap and TalkBack all reach a real
 * `<button>` and fire either a key event or a click — neither of which was
 * handled, so the controls were advertised to AT and then did nothing.
 *
 * Pointer and key have a press/release pair. AT typically synthesizes a click
 * with no pair, so that path toggles. Browsers also fire a click after
 * pointerup/keyup, which must not toggle or a tap would press and immediately
 * release.
 *
 * `preventDefault` on pointerdown cancels that compatibility click (Pointer
 * Events spec). The suppress flag would then stick and eat the next AT
 * activate. `clear-suppress` is the follow-up the DOM layer queues on a
 * microtask so a missing click cannot latch the flag shut. The flag is per
 * control so jumping does not eat a later climb activation.
 */

export function initialHoldMemo(): HoldMemo {
  return { held: new Set(), suppressActivate: new Set() };
}

export function isHoldKey(key: string): boolean {
  return key === " " || key === "Enter" || key === "Spacebar";
}

export function reduceHold(memo: HoldMemo, event: HoldEvent): HoldMemo {
  const held = new Set(memo.held);
  const suppress = new Set(memo.suppressActivate);
  switch (event.kind) {
    case "press":
      held.add(event.id);
      suppress.add(event.id);
      return { held, suppressActivate: suppress };
    case "release":
      held.delete(event.id);
      suppress.add(event.id);
      return { held, suppressActivate: suppress };
    case "clear-suppress":
      suppress.delete(event.id);
      return { held: memo.held, suppressActivate: suppress };
    case "activate":
      if (suppress.has(event.id)) {
        suppress.delete(event.id);
        return { held: memo.held, suppressActivate: suppress };
      }
      if (held.has(event.id)) held.delete(event.id);
      else held.add(event.id);
      return { held, suppressActivate: suppress };
  }
}

import type { JoystickAxes } from "./joystickInput";

export function mergeTouchInput(
  joystick: JoystickAxes,
  held: ReadonlySet<ControlId>
): {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
} {
  return {
    ...joystick,
    jump: held.has("jump"),
  };
}

export type ControlId = "jump";

export type HoldEvent =
  | { kind: "press"; id: ControlId }
  | { kind: "release"; id: ControlId }
  | { kind: "activate"; id: ControlId }
  | { kind: "clear-suppress"; id: ControlId };

export interface HoldMemo {
  held: ReadonlySet<ControlId>;
  /** Controls whose follow-up click must be ignored. */
  suppressActivate: ReadonlySet<ControlId>;
}
