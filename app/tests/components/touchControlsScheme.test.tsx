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
import { ClimbControlsGuide } from "../../src/components/Game/ClimbControlsGuide";
import { UtilityControls } from "../../src/components/Game/ExpeditionHud";
import {
  CONTROL_SCHEME_KEY,
  DEFAULT_CONTROL_SCHEME,
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

  it("falls back to the default for a tampered value", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "dpad");
    expect(readControlScheme()).toBe(DEFAULT_CONTROL_SCHEME);
  });
});

describe("control scheme setting", () => {
  it("defaults to the buttons with nothing saved", () => {
    expect(DEFAULT_CONTROL_SCHEME).toBe("buttons");
    mount(() => {});
    expect(radio("Buttons").getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector(".exp-joystick")).toBeNull();
    expect(container.querySelectorAll(".exp-touch-button")).toHaveLength(4);
  });

  it("labels jump with the same word in both layouts", () => {
    mount(() => {});
    const jumpText = () =>
      container.querySelector('.exp-touch-button[aria-label="Jump"]')?.textContent?.trim();
    expect(jumpText()).toBe("Jump");
    act(() => radio("Joystick").click());
    expect(container.querySelector(".exp-joystick")).not.toBeNull();
    expect(jumpText()).toBe("Jump");
  });

  it("choosing Buttons persists it and swaps the controls live", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "joystick");
    mount(() => {});
    act(() => radio("Buttons").click());

    expect(localStorage.getItem(CONTROL_SCHEME_KEY)).toBe("buttons");
    expect(radio("Buttons").getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector(".exp-joystick")).toBeNull();
    expect(container.querySelectorAll(".exp-touch-button")).toHaveLength(4);
  });

  it("choosing Joystick persists it and swaps the controls live", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "buttons");
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

  it("lights the chevrons for what is pressed", () => {
    localStorage.setItem(CONTROL_SCHEME_KEY, "joystick");
    mount(() => {});
    const stick = container.querySelector<HTMLElement>(".exp-joystick")!;
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const lit = () =>
      (["up", "down", "left", "right"] as const).filter((d) => stick.dataset[d] === "true");

    pointer(stick, "pointerdown", cx, cy);
    // 1-2 o'clock: up and right.
    pointer(stick, "pointermove", cx + 25, cy - 30);
    expect(lit()).toEqual(["up", "right"]);
    // 10-11 o'clock: up and left.
    pointer(stick, "pointermove", cx - 25, cy - 30);
    expect(lit()).toEqual(["up", "left"]);
    // 3 o'clock: right only.
    pointer(stick, "pointermove", cx + 30, cy);
    expect(lit()).toEqual(["right"]);

    pointer(stick, "pointerup", cx + 30, cy);
    expect(lit()).toEqual([]);
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

describe("controls guide", () => {
  it("describes the touch layout the player has chosen, and follows a change", () => {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      act(() => {
        root.render(
          createElement("div", null,
            createElement(ControlSchemePicker, { labelledBy: "x" }),
            createElement("div", { id: "guide" }, createElement(ClimbControlsGuide, { variant: "compact" }))
          )
        );
      });
      const text = () => container.querySelector("#guide")?.textContent ?? "";
      expect(text()).toContain("Hold ← or →");
      expect(text()).not.toMatch(/stick/);

      act(() => radio("Joystick").click());
      expect(text()).toContain("Drag the stick");
      expect(text()).toContain("Push the stick up");
      expect(text()).not.toContain("Hold ↑ climb");
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });
});

describe("in-game settings cog", () => {
  function stubPointer(coarse: boolean) {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: coarse && query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    return () => {
      window.matchMedia = real;
    };
  }

  function mountHud(onToggleMute: () => void, muted = false) {
    act(() => {
      root.render(
        createElement("div", null,
          createElement(UtilityControls, { muted, onToggleMute }),
          createElement(TouchControls, { active: true, onInput: () => {} })
        )
      );
    });
  }

  const cog = () => container.querySelector<HTMLButtonElement>('[aria-label="Game settings"][aria-expanded]')!;
  const soundSwitch = () => container.querySelector<HTMLButtonElement>('[role="switch"]');

  it("opens a panel with sound and the touch layout, which swaps the controls mid-run", () => {
    const restore = stubPointer(true);
    try {
      const onToggleMute = vi.fn();
      mountHud(onToggleMute);
      expect(soundSwitch()).toBeNull();
      act(() => cog().click());
      expect(cog().getAttribute("aria-expanded")).toBe("true");

      expect(soundSwitch()!.getAttribute("aria-checked")).toBe("true");
      act(() => soundSwitch()!.click());
      expect(onToggleMute).toHaveBeenCalledTimes(1);

      expect(container.querySelectorAll(".exp-touch-button")).toHaveLength(4);
      act(() => radio("Joystick").click());
      expect(localStorage.getItem(CONTROL_SCHEME_KEY)).toBe("joystick");
      expect(container.querySelector(".exp-joystick")).not.toBeNull();
    } finally {
      restore();
    }
  });

  it("shows sound as off when muted", () => {
    const restore = stubPointer(true);
    try {
      mountHud(() => {}, true);
      act(() => cog().click());
      expect(soundSwitch()!.getAttribute("aria-checked")).toBe("false");
    } finally {
      restore();
    }
  });

  it("leaves the layout out on a keyboard device", () => {
    const restore = stubPointer(false);
    try {
      mountHud(() => {});
      act(() => cog().click());
      expect(soundSwitch()).not.toBeNull();
      expect(container.querySelector('[role="radio"]')).toBeNull();
    } finally {
      restore();
    }
  });

  it("closes on Escape and on a tap outside, returning focus on Escape", () => {
    const restore = stubPointer(true);
    try {
      mountHud(() => {});
      act(() => cog().click());
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(soundSwitch()).toBeNull();
      expect(document.activeElement).toBe(cog());

      act(() => cog().click());
      act(() => {
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      expect(soundSwitch()).toBeNull();
    } finally {
      restore();
    }
  });
});
