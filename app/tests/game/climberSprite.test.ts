import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal HTMLImageElement stand-in: decodes only when a test says so. */
class FakeImage {
  static all: FakeImage[] = [];
  src = "";
  complete = false;
  naturalWidth = 0;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.all.push(this);
  }
  decode(): void {
    this.complete = true;
    this.naturalWidth = 2048;
  }
  fail(): void {
    this.complete = true;
    this.onerror?.();
  }
}

const sheet = (name: string): FakeImage => {
  const img = FakeImage.all.find((i) => i.src.endsWith(name));
  if (!img) throw new Error(`${name} was never requested`);
  return img;
};

// climberSprite caches images at module scope, so each test gets a fresh copy.
const load = () => import("../../src/components/Game/climberSprite");

beforeEach(() => {
  FakeImage.all = [];
  vi.resetModules();
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("climberFrame", () => {
  it("requests every sheet on the first call, not on the first ladder", async () => {
    const { climberFrame } = await load();
    expect(climberFrame("idle", 0, 0, false)).toBeNull();
    expect(FakeImage.all.map((i) => i.src).sort()).toEqual([
      "/climb/wraith-climb.png",
      "/climb/wraith-poses.png",
    ]);
  });

  it("uses the poses-sheet reach frames while the climb strip is still loading", async () => {
    const { climberFrame } = await load();
    climberFrame("idle", 0, 0, false);
    sheet("wraith-poses.png").decode();

    const frame = climberFrame("climb", 0, 0, false);
    expect(frame).not.toBeNull();
    expect(frame!.img).toBe(sheet("wraith-poses.png"));
    // Cell 3 of the 4-column poses sheet: reach-a.
    expect([frame!.sx, frame!.sy]).toEqual([3 * 512, 0]);
  });

  it("keeps the poses-sheet fallback when the climb strip fails to load", async () => {
    const { climberFrame } = await load();
    climberFrame("idle", 0, 0, false);
    sheet("wraith-poses.png").decode();
    sheet("wraith-climb.png").fail();

    expect(climberFrame("climb", 0, 0, false)?.img).toBe(sheet("wraith-poses.png"));
  });

  it("switches to the back-view climb strip once it decodes", async () => {
    const { climberFrame } = await load();
    climberFrame("idle", 0, 0, false);
    sheet("wraith-poses.png").decode();
    sheet("wraith-climb.png").decode();

    const frame = climberFrame("climb", 0, 0, false);
    expect(frame?.img).toBe(sheet("wraith-climb.png"));
    expect([frame!.sx, frame!.sy]).toEqual([0, 0]);
  });

  it("returns null until the poses sheet decodes, so the vector climber draws", async () => {
    const { climberFrame } = await load();
    climberFrame("idle", 0, 0, false);
    sheet("wraith-climb.png").decode();

    expect(climberFrame("walk", 0, 0, false)).toBeNull();
  });
});
