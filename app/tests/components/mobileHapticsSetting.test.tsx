/**
 * The in-game Vibration switch: it reads and writes the same saved flag the
 * haptics calls check, so a change applies to the next vibration.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isHapticsEnabled, useHapticsSetting } from "../../mobile/src/lib/hapticsSetting";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let setting: ReturnType<typeof useHapticsSetting>;

function Probe() {
  setting = useHapticsSetting();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useHapticsSetting", () => {
  it("starts on, and toggling saves the flag the haptics read", () => {
    act(() => root.render(createElement(Probe)));
    expect(setting.enabled).toBe(true);

    act(() => setting.onToggle());
    expect(setting.enabled).toBe(false);
    expect(isHapticsEnabled()).toBe(false);

    act(() => setting.onToggle());
    expect(setting.enabled).toBe(true);
    expect(isHapticsEnabled()).toBe(true);
  });

  it("reads a saved off on mount", () => {
    localStorage.setItem("haptics_enabled", "false");
    act(() => root.render(createElement(Probe)));
    expect(setting.enabled).toBe(false);
  });
});
