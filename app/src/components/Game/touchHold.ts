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
 */

export function initialHoldMemo(): HoldMemo {
  return { held: new Set(), suppressActivate: false };
}

export function isHoldKey(key: string): boolean {
  return key === " " || key === "Enter" || key === "Spacebar";
}

export function reduceHold(memo: HoldMemo, event: HoldEvent): HoldMemo {
  const held = new Set(memo.held);
  switch (event.kind) {
    case "press":
      held.add(event.id);
      return { held, suppressActivate: true };
    case "release":
      held.delete(event.id);
      return { held, suppressActivate: true };
    case "activate":
      if (memo.suppressActivate) {
        return { held: memo.held, suppressActivate: false };
      }
      if (held.has(event.id)) held.delete(event.id);
      else held.add(event.id);
      return { held, suppressActivate: false };
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

export type ControlId = "left" | "right" | "climb" | "jump";

export type HoldEvent =
  | { kind: "press"; id: ControlId }
  | { kind: "release"; id: ControlId }
  | { kind: "activate"; id: ControlId };

export interface HoldMemo {
  held: ReadonlySet<ControlId>;
  /**
   * Pointer/key already applied this activation, so the click the browser
   * synthesizes afterwards must not toggle.
   */
  suppressActivate: boolean;
}
