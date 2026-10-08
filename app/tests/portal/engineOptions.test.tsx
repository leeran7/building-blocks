/**
 * The backward-compatible engine options the portals need:
 *  - useClimb `paused`: the live loop stops stepping and keeps no time debt;
 *    modifier shortcuts (Ctrl+W) and keys pressed while paused are not game input.
 *  - usePowerUpFeedback `silenced`: host silence mutes the engines without
 *    touching the saved mute preference.
 *  - GameSettingsButton `escapeCloses`: Escape still closes by default.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const engines = vi.hoisted(() => ({ audio: [] as boolean[], music: [] as boolean[] }));

vi.mock("../../src/components/Game/powerUpAudio", () => ({
  PowerUpAudio: class {
    setMuted(m: boolean) {
      engines.audio.push(m);
    }
    unlock() {}
    dispose() {}
    play() {}
    setJetpackThrusting() {}
    setLavaDoom() {}
    playLavaSurge() {}
    playLavaSting() {}
    playDeath() {}
  },
}));
vi.mock("../../src/components/Game/climbMusic", () => ({
  ClimbMusic: class {
    setMuted(m: boolean) {
      engines.music.push(m);
    }
    unlock() {}
    dispose() {}
    start() {}
    stop() {}
    setIntensity() {}
  },
}));

import { useClimb, type UseClimbResult } from "../../src/game/useClimb";
import { buildFreeTower } from "../../src/game/freeStack";
import { usePowerUpFeedback, type PowerUpFeedback } from "../../src/components/Game/usePowerUpFeedback";
import { isSfxMuted, setSfxMuted } from "../../src/components/Game/sfxMute";
import { GameSettingsButton } from "../../src/components/Game/GameSettings";

let container: HTMLDivElement;
let root: Root;
let frames: Array<(ts: number) => void> = [];
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;

/** Run every queued animation frame at `ts`. */
async function frame(ts: number) {
  await act(async () => {
    const due = frames;
    frames = [];
    due.forEach((cb) => cb(ts));
  });
}

beforeEach(() => {
  frames = [];
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  };
  window.cancelAnimationFrame = () => {};
  engines.audio = [];
  engines.music = [];
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
});

describe("useClimb paused", () => {
  const tower = buildFreeTower();
  let climb: UseClimbResult;
  function Harness({ paused }: { paused: boolean }) {
    climb = useClimb({ tower, paused });
    return null;
  }

  async function render(paused: boolean) {
    await act(async () => root.render(<Harness paused={paused} />));
  }

  it("stops stepping while paused and does not replay the paused time on resume", async () => {
    await render(false);
    await act(async () => climb.start());
    let ts = 1000;
    for (let i = 0; i < 5; i++) await frame((ts += 100));
    const before = climb.simRef.current.tick;
    expect(before).toBeGreaterThan(0);

    await render(true);
    for (let i = 0; i < 30; i++) await frame((ts += 100));
    expect(climb.simRef.current.tick).toBe(before);

    await render(false);
    await frame((ts += 5000)); // first frame after 5 s away: clock restarts
    await frame((ts += 100));
    const advanced = climb.simRef.current.tick - before;
    expect(advanced).toBeGreaterThan(0);
    expect(advanced).toBeLessThanOrEqual(4);
  });

  it("ignores modifier shortcuts and keys pressed while paused", async () => {
    await render(false);
    await act(async () => climb.start());
    const press = (init: KeyboardEventInit) => {
      const ev = new KeyboardEvent("keydown", { cancelable: true, ...init });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    // Positive control: a plain game key is captured during the countdown.
    expect(press({ key: "w" })).toBe(true);
    expect(press({ key: "w", ctrlKey: true })).toBe(false);
    expect(press({ key: "ArrowLeft", metaKey: true })).toBe(false);
    expect(press({ key: "ArrowRight", altKey: true })).toBe(false);
    await render(true);
    expect(press({ key: "w" })).toBe(false);
  });
});

describe("usePowerUpFeedback silenced", () => {
  let fb: PowerUpFeedback;
  function Harness({ silenced }: { silenced?: boolean }) {
    fb = usePowerUpFeedback(undefined, 0, 0, undefined, undefined, silenced === undefined ? undefined : { silenced });
    return null;
  }
  const render = (silenced?: boolean) => act(async () => root.render(<Harness silenced={silenced} />));

  it("mutes the engines without changing the saved preference", async () => {
    await render(true);
    expect(engines.audio.at(-1)).toBe(true);
    expect(engines.music.at(-1)).toBe(true);
    expect(fb.muted).toBe(false);
    expect(isSfxMuted()).toBe(false);
    expect(localStorage.getItem("doomstack:sfx-muted")).toBeNull();

    // Unmuting while silenced saves the choice but keeps the engines quiet.
    await act(async () => fb.setMuted(false));
    expect(engines.audio.at(-1)).toBe(true);
    expect(isSfxMuted()).toBe(false);

    await render(false);
    expect(engines.audio.at(-1)).toBe(false);
    expect(engines.music.at(-1)).toBe(false);
  });

  it("lifting silence keeps a player's own mute", async () => {
    setSfxMuted(true);
    await render(true);
    await render(false);
    expect(engines.audio.at(-1)).toBe(true);
    expect(engines.music.at(-1)).toBe(true);
    expect(isSfxMuted()).toBe(true);
  });

  it("callers that never pass it see no extra engine calls", async () => {
    await render(undefined);
    expect(engines.audio).toEqual([]);
    expect(engines.music).toEqual([]);
  });
});

describe("GameSettingsButton escapeCloses", () => {
  async function openThenEscape(escapeCloses?: boolean): Promise<boolean> {
    await act(async () =>
      root.render(<GameSettingsButton muted={false} onToggleMute={() => {}} escapeCloses={escapeCloses} />),
    );
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Game settings"]')!.click());
    expect(container.querySelector('[role="group"]')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    return container.querySelector('[role="group"]') !== null;
  }

  it("closes on Escape by default (the app and web are unchanged)", async () => {
    expect(await openThenEscape()).toBe(false);
  });

  it("stays open on Escape when opted out (web portals)", async () => {
    expect(await openThenEscape(false)).toBe(true);
  });
});
