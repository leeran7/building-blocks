/**
 * Touch control scheme: the settings picker persists the choice on this
 * device, and TouchControls swaps the button row for a joystick + jump.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TouchControls } from "../../src/components/Game/TouchControls";
import { ControlSchemePicker } from "../../src/components/ControlSchemePicker";
import {
  CONTROL_SCHEME_KEY,
  parseControlScheme,
  readControlScheme,
} from "../../src/lib/controlScheme";
import type { TouchInput } from "../../src/game/useClimb";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(onInput: (t: TouchInput) => void) {
  act(() => {
    root.render(
      createElement("div", null,
        createElement(ControlSchemePicker, { labelledBy: "x" }),
        createElement(TouchControls, { active: true, onInput })
      )
    );
  });
}

function radio(name: string): HTMLButtonElement {
  const el = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) =>
    b.textContent?.startsWith(name)
  );
  if (!el) throw new Error(`no ${name} radio`);
  return el;
}

function pointer(el: Element, type: string, x: number, y: number) {
  act(() => {
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: y })
    );
  });
}

describe("parseControlScheme", () => {
  it("allow-lists the stored value", () => {
    expect(parseControlScheme("joystick")).toBe("joystick");
    expect(parseControlScheme("buttons")).toBe("buttons");
    expect(parseControlScheme("JOYSTICK")).toBeNull();
    expect(parseControlScheme("__proto__")).toBeNull();
    expect(parseControlScheme(null)).toBeNull();
  });

  it("falls back to buttons for a tampered value", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "dpad");
    expect(readControlScheme()).toBe("buttons");
  });
});

describe("control scheme setting", () => {
  it("defaults to the four-button row", () => {
    mount(() => {});
    expect(radio("Buttons").getAttribute("aria-checked")).toBe("true");
    expect(container.querySelectorAll(".exp-touch-button")).toHaveLength(4);
    expect(container.querySelector(".exp-joystick")).toBeNull();
  });

  it("choosing Joystick persists it and swaps the controls live", () => {
    mount(() => {});
    act(() => radio("Joystick").click());

    expect(localStorage.getItem(CONTROL_SCHEME_KEY)).toBe("joystick");
    expect(radio("Joystick").getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector(".exp-joystick")).not.toBeNull();
    const buttons = container.querySelectorAll(".exp-touch-button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Jump");
  });

  it("reads a saved joystick choice on mount", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "joystick");
    mount(() => {});
    expect(container.querySelector(".exp-joystick")).not.toBeNull();
  });
});

describe("joystick input", () => {
  it("drags to walk/climb and centres on release", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "joystick");
    const onInput = vi.fn<(t: TouchInput) => void>();
    mount(onInput);
    const stick = container.querySelector(".exp-joystick")!;
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    pointer(stick, "pointerdown", cx, cy);
    pointer(stick, "pointermove", cx - 30, cy);
    expect(onInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: true, right: false, up: false })
    );

    pointer(stick, "pointermove", cx + 30, cy - 30);
    expect(onInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: false, right: true, up: true })
    );

    // A small move past the low dead zone already registers.
    pointer(stick, "pointermove", cx + 6, cy);
    expect(onInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ right: true, up: false })
    );

    pointer(stick, "pointerup", cx + 6, cy);
    expect(onInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: false, right: false, up: false, down: false })
    );
  });

  it("ignores a second finger while the first is steering", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "joystick");
    const onInput = vi.fn<(t: TouchInput) => void>();
    mount(onInput);
    const stick = container.querySelector(".exp-joystick")!;
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    pointer(stick, "pointerdown", cx - 30, cy);
    act(() => {
      stick.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 8, clientX: cx + 30, clientY: cy })
      );
    });
    expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({ left: true, right: false }));
  });
});
