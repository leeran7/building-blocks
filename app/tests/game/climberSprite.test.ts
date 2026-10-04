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
    this.naturalWidth = 768;
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

/**
 * The sheet character these tests exercise. A null or unknown avatar now
 * draws the Green Stick (no sheets), so the sprite paths name the Wraith.
 */
const WRAITH = "wraith";

// climberSprite caches images at module scope, so each test gets a fresh copy.
const load = () => import("../../src/components/Game/climberSprite");

/** Load the module with both sheets decoded. */
async function loaded() {
  const mod = await load();
  mod.climberFrame("idle", 0, 0, false, WRAITH);
  sheet("wraith-poses-192.png").decode();
  sheet("wraith-climb-192.png").decode();
  return mod;
}

type Call = { op: string; args: unknown[] };

/**
 * Records draw calls and tracks the affine transform, so a test can map a
 * point in drawImage's destination space back to the screen.
 */
function affineCtx() {
  const calls: Call[] = [];
  let m = [1, 0, 0, 1, 0, 0]; // a b c d e f
  const stack: number[][] = [];
  const mul = (n: number[]) => {
    const [a, b, c, d, e, f] = m;
    m = [
      a * n[0] + c * n[1],
      b * n[0] + d * n[1],
      a * n[2] + c * n[3],
      b * n[2] + d * n[3],
      a * n[4] + c * n[5] + e,
      b * n[4] + d * n[5] + f,
    ];
  };
  const draws: {
    img: unknown;
    sx: number;
    sy: number;
    toScreen: (x: number, y: number) => [number, number];
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  }[] = [];
  const ctx = {
    save: () => void stack.push(m.slice()),
    restore: () => void (m = stack.pop()!),
    translate: (x: number, y: number) => mul([1, 0, 0, 1, x, y]),
    scale: (x: number, y: number) => {
      calls.push({ op: "scale", args: [x, y] });
      mul([x, 0, 0, y, 0, 0]);
    },
    rotate: (r: number) => {
      calls.push({ op: "rotate", args: [r] });
      mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
    },
    drawImage: (
      img: unknown,
      sx: number,
      sy: number,
      _sw: number,
      _sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => {
      const t = m.slice();
      draws.push({
        img,
        sx,
        sy,
        dx,
        dy,
        dw,
        dh,
        toScreen: (x, y) => [
          t[0] * x + t[2] * y + t[4],
          t[1] * x + t[3] * y + t[5],
        ],
      });
    },
  };
  // Only the calls drawClimberSprite makes are implemented.
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, draws };
}

const walker = (
  over: Partial<{
    pose: "idle" | "walk" | "climb" | "air" | "done" | "dead";
    x: number;
    y: number;
    vx: number;
    vy: number;
    slot: number;
    avatarId: string | null;
  }> = {},
) => ({
  pose: "idle" as const,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  slot: 0,
  avatarId: WRAITH,
  ...over,
});

beforeEach(() => {
  FakeImage.all = [];
  vi.resetModules();
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("climberFrame: loading", () => {
  it("requests every sheet on the first call, not on the first ladder", async () => {
    const { climberFrame } = await load();
    expect(climberFrame("idle", 0, 0, false, WRAITH)).toBeNull();
    expect(FakeImage.all.map((i) => i.src).sort()).toEqual([
      "/climb/wraith-climb-192.png",
      "/climb/wraith-poses-192.png",
    ]);
  });

  it("uses the poses-sheet reach frames while the climb strip is still loading", async () => {
    const { climberFrame, CELL } = await load();
    climberFrame("idle", 0, 0, false, WRAITH);
    sheet("wraith-poses-192.png").decode();

    const frame = climberFrame("climb", 0, 0.3, false, WRAITH);
    expect(frame).not.toBeNull();
    expect(frame!.img).toBe(sheet("wraith-poses-192.png"));
    // Cell 3 of the 4-column poses sheet: reach-a.
    expect([frame!.sx, frame!.sy]).toEqual([3 * CELL, 0]);
  });

  it("keeps the poses-sheet fallback when the climb strip fails to load", async () => {
    const { climberFrame } = await load();
    climberFrame("idle", 0, 0, false, WRAITH);
    sheet("wraith-poses-192.png").decode();
    sheet("wraith-climb-192.png").fail();

    expect(climberFrame("climb", 0, 0, false, WRAITH)?.img).toBe(
      sheet("wraith-poses-192.png"),
    );
  });

  it("switches to the back-view climb strip once it decodes", async () => {
    const { climberFrame } = await loaded();
    const frame = climberFrame("climb", 0, 0.3, false, WRAITH);
    expect(frame?.img).toBe(sheet("wraith-climb-192.png"));
    expect([frame!.sx, frame!.sy]).toEqual([0, 0]);
  });

  it("returns null until the poses sheet decodes, so the vector climber draws", async () => {
    const { climberFrame } = await load();
    climberFrame("idle", 0, 0, false, WRAITH);
    sheet("wraith-climb-192.png").decode();

    expect(climberFrame("walk", 0, 0, false, WRAITH)).toBeNull();
  });

  it("setClimberSpriteSrc re-points both sheets (native bundle) and reloads", async () => {
    const { climberFrame, setClimberSpriteSrc } = await load();
    climberFrame("idle", 0, 0, false, WRAITH);
    sheet("wraith-poses-192.png").decode();
    expect(climberFrame("idle", 0, 0, false, WRAITH)).not.toBeNull();

    setClimberSpriteSrc({ poses: "./assets/p.png", climb: "./assets/c.png" });
    // The old decode is dropped: nothing drawn until the new URL decodes.
    expect(climberFrame("idle", 0, 0, false, WRAITH)).toBeNull();
    expect(
      FakeImage.all
        .slice(-2)
        .map((i) => i.src)
        .sort(),
    ).toEqual(["./assets/c.png", "./assets/p.png"]);
    sheet("p.png").decode();
    expect(climberFrame("idle", 0, 0, false, WRAITH)?.img).toBe(sheet("p.png"));
  });

  it("setClimberSpriteSrc ignores empty and unchanged sources", async () => {
    const { climberFrame, setClimberSpriteSrc, CLIMBER_SPRITE_SRC } =
      await loaded();
    const before = climberFrame("idle", 0, 0, false, WRAITH)!.img;
    setClimberSpriteSrc({ poses: "" });
    setClimberSpriteSrc({ poses: CLIMBER_SPRITE_SRC.poses });
    expect(climberFrame("idle", 0, 0, false, WRAITH)?.img).toBe(before);
  });
});

describe("climberFrame: cycles", () => {
  it("walk alternates run-a/run-b once per step of distance", async () => {
    const { climberFrame, CELL, WALK_M_PER_STEP } = await loaded();
    const mid = (k: number) => {
      const f = climberFrame("walk", (k + 0.5) * WALK_M_PER_STEP, 0, false, WRAITH)!;
      return [f.sx, f.sy, f.blend];
    };
    expect(mid(0)).toEqual([1 * CELL, 0, 0]); // run-a, crisp mid-stride
    expect(mid(1)).toEqual([2 * CELL, 0, 0]); // run-b
    expect(mid(2)).toEqual([1 * CELL, 0, 0]);
    expect(mid(-1)).toEqual([2 * CELL, 0, 0]); // walking left of the origin too
  });

  it("holds its frame while the climber is stationary (no wall-clock drive)", async () => {
    const { climberFrame } = await loaded();
    const a = { ...climberFrame("walk", 7.3, 0, false, WRAITH)! };
    const b = { ...climberFrame("walk", 7.3, 0, false, WRAITH)! };
    expect(b).toEqual(a);
  });

  it("crossfades continuously across a step boundary", async () => {
    const { climberFrame, WALK_M_PER_STEP, CYCLE_BLEND } = await loaded();
    const eps = 1e-6;
    const before = {
      ...climberFrame("walk", WALK_M_PER_STEP - eps, 0, false, WRAITH)!,
    };
    const after = { ...climberFrame("walk", WALK_M_PER_STEP + eps, 0, false, WRAITH)! };
    // Dominant frame swaps at the boundary; each shows the other at ~half.
    expect(before.blend).toBeCloseTo(0.5, 3);
    expect(after.blend).toBeCloseTo(0.5, 3);
    expect([before.sx, before.bx]).toEqual([after.bx, after.sx]);
    // Outside the window the frame is crisp.
    const inside = climberFrame(
      "walk",
      WALK_M_PER_STEP * (1 + CYCLE_BLEND + 0.01),
      0,
      false,
      WRAITH,
    )!;
    expect(inside.blend).toBe(0);
    expect(inside.bx).toBe(inside.sx);
  });

  it("a character's own cycleBlend widens its climb crossfade to a continuous dissolve", async () => {
    const { climberFrame, CELL, CYCLE_BLEND } = await loaded();
    // Three-quarters into a frame: crisp inside the Wraith's window, mid-dissolve at 0.5.
    expect(climberFrame("climb", 0, 0.75 * 0.65, false, WRAITH)!.blend).toBe(0);
    climberFrame("climb", 0, 0, false, "otter-void"); // requests the Void sheets
    sheet("otter-void-poses-192.png").decode();
    sheet("otter-void-climb-192.png").decode();
    const voidSkin = climberFrame("climb", 0, 0.75 * 0.65, false, "otter-void")!;
    expect(voidSkin.character).toBe("otter-void");
    expect(voidSkin.geom.cycleBlend).toEqual({ walk: CYCLE_BLEND, climb: 0.5 });
    expect(voidSkin.blend).toBeCloseTo(0.5 * (0.5 * 0.5 * (3 - 2 * 0.5)), 6); // smoothstep(0.5) / 2
    expect([voidSkin.sx, voidSkin.bx]).toEqual([0, CELL]);
    // Frame centres stay crisp, and the walk keeps the default window.
    expect(climberFrame("climb", 0, 0.5 * 0.65, false, "otter-void")!.blend).toBe(0);
    expect(climberFrame("walk", 0.75 * 4.5, 0, false, "otter-void")!.blend).toBe(0);
    expect(climberFrame("walk", (1 - CYCLE_BLEND / 2) * 4.5, 0, false, "otter-void")!.blend).toBeGreaterThan(0);
  });

  it("climb steps through all six back-view frames by height", async () => {
    const { climberFrame, CELL } = await loaded();
    const seen = new Set<number>();
    for (let k = 0; k < 6; k++)
      seen.add(climberFrame("climb", 0, (k + 0.5) * 0.65, false, WRAITH)!.sx);
    expect([...seen].sort((a, b) => a - b)).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => i * CELL),
    );
  });

  it("reduced motion pins frame 0 and never blends", async () => {
    const { climberFrame, CELL, WALK_M_PER_STEP } = await loaded();
    for (const x of [0, WALK_M_PER_STEP * 0.99, WALK_M_PER_STEP * 1.5, 13.37]) {
      const f = climberFrame("walk", x, 0, true, WRAITH)!;
      expect([f.sx, f.bx, f.blend]).toEqual([1 * CELL, 1 * CELL, 0]);
    }
  });

  it("reuses one result object (no allocation per call)", async () => {
    const { climberFrame } = await loaded();
    expect(climberFrame("walk", 1, 0, false, WRAITH)).toBe(
      climberFrame("idle", 2, 0, false, WRAITH),
    );
  });
});

describe("climberMotion", () => {
  const base = {
    pose: "walk" as const,
    step: 0,
    vx: 14,
    vy: 0,
    timeSec: 0,
    landAgeSec: Infinity,
    landImpact: 0,
    reducedMotion: false,
  };

  it("walk bobs with the step: planted + squashed on contact, lifted + stretched mid-stride", async () => {
    const { climberMotion, WALK_BOB } = await load();
    const contact = { ...climberMotion({ ...base, step: 0 }) };
    const mid = { ...climberMotion({ ...base, step: 0.5 }) };
    expect(contact.lift).toBeCloseTo(0, 9);
    expect(mid.lift).toBeCloseTo(WALK_BOB, 9);
    expect(contact.scaleY).toBeLessThan(1);
    expect(mid.scaleY).toBeGreaterThan(1);
    // Volume-ish preserved: wider when squashed.
    expect(contact.scaleX).toBeGreaterThan(1);
    expect(mid.scaleX).toBeLessThan(1);
  });

  it("leans forward only while moving", async () => {
    const { climberMotion, WALK_LEAN } = await load();
    expect(climberMotion({ ...base, vx: 14 }).lean).toBe(WALK_LEAN);
    expect(climberMotion({ ...base, vx: -14 }).lean).toBe(WALK_LEAN); // mirror flips it
    expect(climberMotion({ ...base, pose: "idle", vx: 0 }).lean).toBe(0);
  });

  it("idle breathes over time", async () => {
    const { climberMotion } = await load();
    const ys = [0, 0.65, 1.3, 1.95].map(
      (t) => climberMotion({ ...base, pose: "idle", vx: 0, timeSec: t }).scaleY,
    );
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.02);
    expect(ys.every((y) => Math.abs(y - 1) < 0.03)).toBe(true);
  });

  it("stretches in the air with speed", async () => {
    const { climberMotion } = await load();
    const slow = climberMotion({ ...base, pose: "air", vy: 1 }).scaleY;
    const fast = climberMotion({ ...base, pose: "air", vy: -18 }).scaleY;
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(1);
  });

  it("squashes on touchdown and recovers within LAND_S", async () => {
    const { climberMotion, LAND_SQUASH, LAND_S } = await load();
    const idle = {
      ...base,
      pose: "idle" as const,
      vx: 0,
      timeSec: 0,
      landImpact: 1,
    };
    const hit = climberMotion({ ...idle, landAgeSec: 0 }).scaleY;
    const later = climberMotion({ ...idle, landAgeSec: LAND_S * 0.5 }).scaleY;
    const done = climberMotion({ ...idle, landAgeSec: LAND_S }).scaleY;
    expect(hit).toBeCloseTo(1 - LAND_SQUASH, 9);
    expect(later).toBeGreaterThan(hit);
    expect(done).toBeCloseTo(1, 9);
  });

  it("is the identity under reduced motion, whatever the input", async () => {
    const { climberMotion } = await load();
    for (const pose of ["walk", "idle", "air"] as const) {
      const m = climberMotion({
        ...base,
        pose,
        step: 0.5,
        vy: -18,
        timeSec: 0.6,
        landAgeSec: 0,
        landImpact: 1,
        reducedMotion: true,
      });
      expect({ ...m }).toEqual({ lift: 0, scaleX: 1, scaleY: 1, lean: 0 });
    }
  });
});

describe("drawClimberSprite", () => {
  const FX = 100;
  const FY = 200;
  const S = 9;

  /** Screen position of the cell's foot root for the last draw. */
  async function rootOnScreen(draws: ReturnType<typeof affineCtx>["draws"]) {
    const { CELL } = await load();
    const d = draws.at(-1)!;
    const k = d.dw / CELL;
    const rootX = d.dx + ((256 * CELL) / 512) * k;
    const rootY = d.dy + ((460 * CELL) / 512) * k;
    return d.toScreen(rootX, rootY);
  }

  it("returns false before the atlas decodes, so the vector figure draws", async () => {
    const { drawClimberSprite } = await load();
    const { ctx, draws } = affineCtx();
    expect(drawClimberSprite(ctx, FX, FY, S, 1, walker(), false, null, 0)).toBe(
      false,
    );
    expect(draws).toHaveLength(0);
  });

  it("anchors the feet at (fx, fy) for both facings", async () => {
    const { drawClimberSprite } = await loaded();
    for (const facing of [1, -1] as const) {
      const { ctx, draws } = affineCtx();
      drawClimberSprite(ctx, FX, FY, S, facing, walker(), true, null, 0);
      const [x, y] = await rootOnScreen(draws);
      expect(x).toBeCloseTo(FX, 6);
      expect(y).toBeCloseTo(FY, 6);
    }
  });

  it("lays the character's skull top on the stick figure's head top", async () => {
    const { drawClimberSprite, CELL, STICK_HEAD_TOP_IN_S } = await loaded();
    const { WRAITH: def } = await import("../../src/components/Game/climberCharacters");
    const { ctx, draws } = affineCtx();
    drawClimberSprite(ctx, FX, FY, S, 1, walker(), true, null, 0);
    const d = draws.at(-1)!;
    const k = d.dw / CELL;
    const [, skullY] = d.toScreen(d.dx + def.rootX * k, d.dy + (def.rootY - def.refH) * k);
    expect(skullY).toBeCloseTo(FY - STICK_HEAD_TOP_IN_S * S, 6);

    // ...which is where drawClimber puts the top of the stick's head.
    const { drawClimber } = await import("../../src/components/Game/paintClimbFrame");
    const arcs: number[][] = [];
    const noop = () => {};
    const stickCtx = new Proxy(
      { arc: (x: number, y: number, r: number) => arcs.push([x, y, r]) },
      { get: (t, k) => (k in t ? t[k as "arc"] : noop), set: () => true },
    );
    drawClimber(stickCtx as unknown as CanvasRenderingContext2D, FX, FY, S, 1, "idle", 0, "#cbf24d", true);
    const headTop = Math.min(...arcs.map(([, y, r]) => y - r));
    expect(headTop).toBeCloseTo(FY - STICK_HEAD_TOP_IN_S * S, 6);
  });

  it("mirrors left-facing climbers and not right-facing ones", async () => {
    const { drawClimberSprite } = await loaded();
    const left = affineCtx();
    drawClimberSprite(left.ctx, FX, FY, S, -1, walker(), true, null, 0);
    const right = affineCtx();
    drawClimberSprite(right.ctx, FX, FY, S, 1, walker(), true, null, 0);
    // The cell's left edge lands right of the feet when mirrored.
    const [lx] = left.draws[0].toScreen(left.draws[0].dx, 0);
    const [rx] = right.draws[0].toScreen(right.draws[0].dx, 0);
    expect(lx).toBeGreaterThan(FX);
    expect(rx).toBeLessThan(FX);
  });

  it("applies no transform beyond placement under reduced motion", async () => {
    const { drawClimberSprite, createClimberMotionBag, tickClimberMotion } =
      await loaded();
    const bag = createClimberMotionBag();
    const { ctx, calls } = affineCtx();
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "air", vy: -18 }),
      true,
      bag,
      0,
    );
    tickClimberMotion(bag, 0.016);
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "walk", vx: 14, x: 2.25 }),
      true,
      bag,
      0,
    );
    expect(calls).toEqual([]);
  });

  it("squashes the climber on the frame it lands (with a motion bag)", async () => {
    const { drawClimberSprite, createClimberMotionBag, tickClimberMotion } =
      await loaded();
    const bag = createClimberMotionBag();
    const { ctx, calls } = affineCtx();
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "air", vy: -20 }),
      false,
      bag,
      0,
    );
    tickClimberMotion(bag, 1 / 60);
    calls.length = 0;
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "idle" }),
      false,
      bag,
      0,
    );
    const scale = calls.find((c) => c.op === "scale")!;
    expect(scale.args[1] as number).toBeLessThan(0.9);
    // Recovered once the landing has played out.
    tickClimberMotion(bag, 0.2);
    calls.length = 0;
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "idle" }),
      false,
      bag,
      0,
    );
    const later = calls.find((c) => c.op === "scale");
    expect(later ? (later.args[1] as number) : 1).toBeGreaterThan(0.97);
  });

  it("crossfades a pose change from the previous frame (nearest frame without a scratch canvas)", async () => {
    const {
      drawClimberSprite,
      createClimberMotionBag,
      tickClimberMotion,
      CELL,
      POSE_BLEND_S,
    } = await loaded();
    const bag = createClimberMotionBag();
    const { ctx, draws } = affineCtx();
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "idle" }),
      false,
      bag,
      0,
    );
    tickClimberMotion(bag, POSE_BLEND_S * 0.2);
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "done" }),
      false,
      bag,
      0,
    );
    // 20% into the blend the previous (idle, cell 0) frame still dominates.
    expect([draws[1].sx, draws[1].sy]).toEqual([0, 0]);
    tickClimberMotion(bag, POSE_BLEND_S);
    drawClimberSprite(
      ctx,
      FX,
      FY,
      S,
      1,
      walker({ pose: "done" }),
      false,
      bag,
      0,
    );
    expect([draws[2].sx, draws[2].sy]).toEqual([2 * CELL, CELL]); // cell 6
  });
});

/** Paint one solo frame into a recording ctx: images drawn and stroke colours set. */
async function paintSolo(
  sprite: Awaited<ReturnType<typeof load>>,
  myAvatarId?: string | null,
  duel?: { avatarIds: Record<string, string | null> },
) {
  const { paintClimbFrame } = await import("../../src/components/Game/paintClimbFrame");
  const { createMatch } = await import("../../src/game/simulation");
  const { buildTower } = await import("../../src/game/towers");
  const m = createMatch({
    seed: "sprite",
    mode: duel ? "multiplayer" : "solo",
    tower: buildTower("indie-games"),
    playerIds: duel ? ["p1", "p2"] : ["p1"],
  });
  const images: unknown[] = [];
  const strokes: unknown[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === "drawImage") return (img: unknown) => images.push(img);
      if (prop === "measureText") return () => ({ width: 10 });
      if (typeof prop === "string" && prop.startsWith("create"))
        return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, prop, v) {
      if (prop === "strokeStyle") strokes.push(v);
      t[prop] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const bag = sprite.createClimberMotionBag();
  paintClimbFrame(ctx, m, {
    width: 360,
    height: 640,
    includeHud: false,
    climberMotion: bag,
    dtSec: 0.016,
    myAvatarId,
    ...(duel ? { myId: "p1", avatarIds: duel.avatarIds } : {}),
  });
  return { images, strokes, bag };
}

describe("paintClimbFrame draws the sprite", () => {
  it("paints each climber from the atlas once it decodes, with a motion bag", async () => {
    const sprite = await loaded();
    const { images, bag } = await paintSolo(sprite, WRAITH);
    expect(images).toContain(sheet("wraith-poses-192.png"));
    // Control for the stick tests' "no climber sheet" filter.
    expect(FakeImage.all.some((i) => /-(poses|climb)-192\.png$/.test(i.src))).toBe(true);
    expect(bag.clock).toBeCloseTo(0.016, 9);
    expect(bag.slots[0]?.pose).toBe("idle");
  });
});

describe("stick characters", () => {
  it("resolve null and unknown ids to the Green Stick, and a stick id to itself", async () => {
    const { resolveClimberCharacter, climberStickColor } = await load();
    for (const id of [null, undefined, "", "dragon", "__proto__", 42]) {
      expect(resolveClimberCharacter(id)).toBe("stick-green");
      expect(climberStickColor(id)).toBe("#cbf24d");
    }
    expect(resolveClimberCharacter("stick-sky")).toBe("stick-sky");
    expect(climberStickColor("stick-sky")).toBe("#4dd6f2");
    expect(climberStickColor(WRAITH)).toBeNull();
  });

  it("climberFrame is null for a stick and loads no sheet, so the vector figure draws", async () => {
    const { climberFrame, drawClimberSprite } = await load();
    expect(climberFrame("idle", 0, 0, false)).toBeNull();
    expect(climberFrame("walk", 1, 0, false, "stick-pink")).toBeNull();
    const { ctx, draws } = affineCtx();
    expect(drawClimberSprite(ctx, 0, 0, 9, 1, walker({ pose: "walk", avatarId: null }), false, null, 0)).toBe(false);
    expect(draws).toHaveLength(0);
    expect(FakeImage.all).toHaveLength(0);
    // Control: a sheet character does request its art on the same call.
    climberFrame("idle", 0, 0, false, WRAITH);
    expect(FakeImage.all.length).toBeGreaterThan(0);
  });

  it("paintClimbFrame draws a climber with no avatar as the Green Stick vector figure", async () => {
    const sprite = await load();
    const { images, strokes } = await paintSolo(sprite, null);
    // No climber sheet is requested or drawn (the background tile is not the climber).
    const climberSheets = FakeImage.all.filter((i) => /-(poses|climb)-192\.png$/.test(i.src));
    expect(climberSheets).toHaveLength(0);
    expect(images.filter((img) => climberSheets.includes(img as FakeImage))).toHaveLength(0);
    expect(strokes).toContain("#cbf24d");
  });

  it("in a duel, an opponent with no character keeps the opponent colour; a chosen stick keeps its own", async () => {
    const sprite = await load();
    const none = await paintSolo(sprite, undefined, { avatarIds: { p1: null, p2: null } });
    expect(none.strokes).toContain("#cbf24d"); // me: the Green Stick
    expect(none.strokes).toContain("#6bb8ff"); // opponent: not a second green figure
    const chosen = await paintSolo(sprite, undefined, { avatarIds: { p1: null, p2: "stick-ember" } });
    expect(chosen.strokes).toContain("#ff5a2c");
    expect(chosen.strokes).not.toContain("#6bb8ff");
  });

  it("paintClimbFrame draws a stick avatar in its own colour, not the default green", async () => {
    const sprite = await load();
    const { strokes } = await paintSolo(sprite, "stick-ember");
    expect(FakeImage.all.some((i) => /-(poses|climb)-192\.png$/.test(i.src))).toBe(false);
    expect(strokes).toContain("#ff5a2c");
    expect(strokes).not.toContain("#cbf24d");
  });
});
