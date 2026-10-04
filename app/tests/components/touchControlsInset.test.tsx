/**
 * Both touch layouts take the same height, so switching between Buttons and
 * Joystick leaves the game view where it was. The camera's clearance under the
 * controls is one value, and it clears the joystick column (stick + caption).
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
  TouchControls,
  touchControlsInset,
} from "../../src/components/Game/TouchControls";
import { JOYSTICK_LAYOUT_HEIGHT } from "../../src/components/Game/TouchJoystick";
import { CONTROL_SCHEME_KEY } from "../../src/lib/controlScheme";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

function layout(): HTMLElement {
  act(() => root.render(createElement(TouchControls, { active: true, onInput: () => {} })));
  const el = container.querySelector<HTMLElement>('[role="group"] > div');
  if (!el) throw new Error("no controls layout");
  return el;
}

describe("touch layout height", () => {
  it("makes the button row as tall as the joystick column", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "buttons");
    const row = layout();
    expect(row.querySelectorAll("button")).toHaveLength(4);
    expect(row.style.height).toBe(`${JOYSTICK_LAYOUT_HEIGHT}px`);
  });
});

describe("touchControlsInset", () => {
  it("clears the joystick column plus its gutters", () => {
    expect(TOUCH_CONTROLS_INSET).toBeGreaterThan(JOYSTICK_LAYOUT_HEIGHT);
    expect(touchControlsInset(0)).toBe(TOUCH_CONTROLS_INSET + TOUCH_CONTROLS_MIN_BOTTOM);
  });

  it("grows into the home-indicator safe area", () => {
    expect(touchControlsInset(34) - touchControlsInset(0)).toBe(34 - TOUCH_CONTROLS_MIN_BOTTOM);
  });
});
