/**
 * The level's intro page and its countdown are one page: Start counts down in
 * the button's place, under the same title and goal, and Back leaves for the
 * map from either. Renders the real LevelRun on the real sim; the canvas, HUD
 * and audio are stood in.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/contexts/AppDataContext", () => ({ useSettings: () => ({ data: null }) }));
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../src/components/Game/ExpeditionHud", () => ({ ExpeditionHud: () => null }));
vi.mock("../../src/components/Game/TouchControls", () => ({
  TouchControls: () => null,
  touchControlsInset: () => 0,
}));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: () => {}, announcement: null, unlockAudio: () => {} }),
}));
vi.mock("../../src/hooks/useCanvasSize", () => ({ useCanvasSize: () => ({ width: 390, height: 780 }) }));
const pointer = vi.hoisted(() => ({ coarse: false }));
vi.mock("../../src/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => pointer.coarse }));
vi.mock("../../src/hooks/useSafeAreaInsets", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { LevelRun } from "../../mobile/src/components/levels/LevelRun";
import { season1Catalog } from "../../mobile/src/lib/levels/catalog";
import { CONTROL_SCHEME_KEY } from "../../src/lib/controlScheme";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  pointer.coarse = false;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
const timer = () => container.querySelector('[role="timer"]');
const title = () => container.querySelector("h2")?.textContent;

function mount(onQuit = vi.fn(), autoStart = false, pickControls = false) {
  const node = season1Catalog().level(5);
  act(() =>
    root.render(
      createElement(LevelRun, {
        level: 5,
        seed: node.seed,
        goalFt: node.goalFt,
        pars: node.pars,
        practice: false,
        autoStart,
        paused: false,
        onEnd: () => {},
        onQuit,
        onHowToPlay: () => {},
        pickControls,
      }),
    ),
  );
  return onQuit;
}

describe("level intro and countdown", () => {
  it("counts down on the intro page itself when Start is pressed", () => {
    mount();
    expect(title()).toBe("Level 5");
    expect(timer()).toBeNull();
    expect(button("How to play")?.disabled).toBe(false);

    act(() => button("Start")!.click());

    expect(button("Start")).toBeUndefined();
    expect(timer()?.textContent).toBe("3");
    // Same page: the title and goal stay, How to play steps aside.
    expect(title()).toBe("Level 5");
    expect(container.textContent).toContain("Climb to the summit");
    expect(button("How to play")?.disabled).toBe(true);
  });

  it("goes back to the map from the intro", () => {
    const onQuit = mount();
    act(() => button("Back")!.click());
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("goes back to the map during the countdown", () => {
    const onQuit = mount();
    act(() => button("Start")!.click());
    expect(timer()).not.toBeNull();
    act(() => button("Back")!.click());
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("starts a retry straight into the countdown on the same page", () => {
    mount(vi.fn(), true);
    expect(timer()?.textContent).toBe("3");
    expect(title()).toBe("Level 5");
    expect(button("Back")).toBeTruthy();
  });

  it("offers the touch controls on the start page when asked, and saves the pick", () => {
    pointer.coarse = true;
    mount(vi.fn(), false, true);
    const picker = container.querySelector<HTMLElement>('[role="radiogroup"]');
    expect(picker?.getAttribute("aria-labelledby")).toBe("level-run-controls");
    const joystick = [...picker!.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent?.startsWith("Joystick"));
    act(() => joystick!.click());
    expect(localStorage.getItem(CONTROL_SCHEME_KEY)).toBe("joystick");
    expect(joystick?.getAttribute("aria-checked")).toBe("true");
    // The countdown keeps its place but hides it, so Start does not jump.
    act(() => button("Start")!.click());
    expect(picker?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(picker?.parentElement?.className).toContain("invisible");
  });

  it("leaves the controls out on a mouse, or when not asked", () => {
    mount(vi.fn(), false, true);
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    pointer.coarse = true;
    mount();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  });
});
