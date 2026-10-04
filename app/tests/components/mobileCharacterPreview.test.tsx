/**
 * CharacterPreview's frame loop: how often it paints, and when it stops.
 *
 * requestAnimationFrame is replaced by a queue this file steps by hand at a
 * chosen display rate, and both painters are counted, so every assertion is a
 * count of real paints from the real component.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const painted = vi.hoisted(() => ({ sticks: 0, sprites: 0, spritesDecoded: true }));

vi.mock("@app/components/Game/paintClimbFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/paintClimbFrame")>();
  return { ...real, drawClimber: () => void painted.sticks++ };
});
vi.mock("@app/components/Game/climberSprite", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/components/Game/climberSprite")>();
  return {
    ...real,
    drawClimberSprite: () => {
      painted.sprites++;
      return painted.spritesDecoded;
    },
  };
});

import { AMBIENT_FPS, CharacterPreview, type PreviewPose } from "../../mobile/src/components/CharacterPreview";
import { climberStickColor } from "../../src/components/Game/climberSprite";

/** A sprite character (not a stick) and the default (the Green Stick). */
const SPRITE_ID = "wolf";
const STICK_ID = null;
/** A ProMotion display: the rate an uncapped loop would paint at. */
const DISPLAY_HZ = 120;
const FRAME_MS = 1000 / DISPLAY_HZ;

describe("CharacterPreview frame loop", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queue: Map<number, FrameRequestCallback>;
  let nextId: number;
  let clock: number;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    painted.sticks = 0;
    painted.sprites = 0;
    painted.spritesDecoded = true;
    queue = new Map();
    nextId = 1;
    clock = 1000;
    visibility = "visible";
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => void queue.delete(id));
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: () => {},
      clearRect: () => {},
    } as unknown as CanvasRenderingContext2D);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount(avatarId: string | null, opts: { pose?: PreviewPose; ambient?: boolean } = {}) {
    act(() => {
      root.render(
        <CharacterPreview avatarId={avatarId} pose={opts.pose ?? "idle"} locked={false} ambient={opts.ambient} />,
      );
    });
  }

  /** Runs `count` display refreshes: each one fires every frame callback queued before it. */
  function refresh(count: number) {
    for (let i = 0; i < count; i++) {
      clock += FRAME_MS;
      const due = [...queue.values()];
      queue.clear();
      act(() => due.forEach((cb) => cb(clock)));
    }
  }

  function setVisibility(next: DocumentVisibilityState) {
    visibility = next;
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
  }

  it("uses a stick figure for the default and a sprite for the sprite character", () => {
    // The fixtures below rely on this split; without it they would count the wrong painter.
    expect(climberStickColor(STICK_ID)).not.toBeNull();
    expect(climberStickColor(SPRITE_ID)).toBeNull();
  });

  describe("by default (picker, detail and result screens)", () => {
    it("paints every display refresh, even a standing stick figure", () => {
      mount(STICK_ID);
      refresh(DISPLAY_HZ);
      expect(painted.sticks).toBe(DISPLAY_HZ);
      expect(queue.size).toBe(1);
    });

    it("paints a sprite every display refresh and keeps going while the page is hidden", () => {
      mount(SPRITE_ID);
      refresh(10);
      setVisibility("hidden");
      refresh(10);
      expect(painted.sprites).toBe(20);
      expect(queue.size).toBe(1);
    });
  });

  describe("ambient (the level map)", () => {
    it("paints a standing stick figure once and stops", () => {
      mount(STICK_ID, { ambient: true });
      refresh(DISPLAY_HZ);
      expect(painted.sticks).toBe(1);
      expect(queue.size).toBe(0);
    });

    it("keeps a walking stick figure moving, capped", () => {
      mount(STICK_ID, { ambient: true, pose: "walk" });
      refresh(DISPLAY_HZ);
      expect(painted.sticks).toBeGreaterThanOrEqual(AMBIENT_FPS - 1);
      expect(painted.sticks).toBeLessThanOrEqual(AMBIENT_FPS + 1);
      expect(queue.size).toBe(1);
    });

    it("paints a sprite's idle breath at most AMBIENT_FPS times a second, not every refresh", () => {
      mount(SPRITE_ID, { ambient: true });
      refresh(DISPLAY_HZ);
      expect(painted.sprites).toBeGreaterThanOrEqual(AMBIENT_FPS - 1);
      expect(painted.sprites).toBeLessThanOrEqual(AMBIENT_FPS + 1);
      expect(painted.sprites).toBeLessThan(DISPLAY_HZ);
      // A sprite breathes, so it does not stop.
      expect(queue.size).toBe(1);
    });

    it("keeps trying until a sprite's sheets decode", () => {
      painted.spritesDecoded = false;
      mount(SPRITE_ID, { ambient: true });
      refresh(DISPLAY_HZ / 2);
      const tries = painted.sprites;
      expect(tries).toBeGreaterThan(1);
      expect(queue.size).toBe(1);
      painted.spritesDecoded = true;
      refresh(DISPLAY_HZ / 2);
      expect(painted.sprites).toBeGreaterThan(tries);
    });

    it("stops painting while the page is hidden and resumes when it is shown", () => {
      mount(SPRITE_ID, { ambient: true });
      refresh(DISPLAY_HZ / 4);
      const before = painted.sprites;
      expect(before).toBeGreaterThan(0);

      setVisibility("hidden");
      expect(queue.size).toBe(0);
      refresh(DISPLAY_HZ);
      expect(painted.sprites).toBe(before);

      setVisibility("visible");
      expect(queue.size).toBe(1);
      refresh(DISPLAY_HZ / 4);
      expect(painted.sprites).toBeGreaterThan(before);
    });

    it("does not restart a finished stick figure when the page is shown again", () => {
      mount(STICK_ID, { ambient: true });
      refresh(4);
      setVisibility("hidden");
      setVisibility("visible");
      refresh(DISPLAY_HZ);
      expect(painted.sticks).toBe(1);
      expect(queue.size).toBe(0);
    });

    it("stops listening for visibility and cancels its frame when unmounted", () => {
      mount(SPRITE_ID, { ambient: true });
      refresh(4);
      act(() => root.unmount());
      expect(queue.size).toBe(0);
      setVisibility("hidden");
      setVisibility("visible");
      expect(queue.size).toBe(0);
      root = createRoot(container);
    });

    // ---- Added by the verifier (iteration 2): concurrent loops, not just paint counts. ----

    it("never runs a second loop: a repeated 'visible' and hidden/visible cycles leave one frame queued", () => {
      mount(SPRITE_ID, { ambient: true });
      refresh(4);
      // A 'visible' while already visible (iOS fires it on some app-switcher paths).
      setVisibility("visible");
      setVisibility("visible");
      expect(queue.size).toBe(1);
      for (let i = 0; i < 3; i++) {
        setVisibility("hidden");
        expect(queue.size).toBe(0);
        setVisibility("visible");
        setVisibility("visible");
        expect(queue.size).toBe(1);
      }
      // Two loops would each paint at the cap: one second is still one loop's worth.
      const before = painted.sprites;
      refresh(DISPLAY_HZ);
      expect(painted.sprites - before).toBeLessThanOrEqual(AMBIENT_FPS + 1);
      expect(queue.size).toBe(1);
    });

    it("replaces its loop and its visibility listener when the character changes", () => {
      mount(SPRITE_ID, { ambient: true });
      refresh(4);
      mount("otter", { ambient: true });
      expect(climberStickColor("otter")).toBeNull();
      expect(queue.size).toBe(1);
      setVisibility("hidden");
      expect(queue.size).toBe(0);
      setVisibility("visible");
      // Only the new figure's loop comes back; the old effect's listener is gone.
      expect(queue.size).toBe(1);
    });

    it("unmounted while the page is hidden, it never restarts when the page is shown", () => {
      mount(SPRITE_ID, { ambient: true });
      refresh(4);
      setVisibility("hidden");
      act(() => root.unmount());
      setVisibility("visible");
      refresh(10);
      expect(queue.size).toBe(0);
      root = createRoot(container);
    });
  });

  it("by default, cancels its frame when unmounted", () => {
    mount(SPRITE_ID);
    refresh(4);
    expect(queue.size).toBe(1);
    act(() => root.unmount());
    expect(queue.size).toBe(0);
    root = createRoot(container);
  });
});
