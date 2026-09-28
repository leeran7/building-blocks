import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATARS } from "../../src/lib/avatars";

/**
 * Per-avatar climber characters: the registry (real art only; avatars without
 * art draw as the plain Wraith), the Wraith fallback, lazy loading per
 * character, the tint engine kept for a future recolour feature (fed through a
 * registry override), and the avatar id travelling from paintClimbFrame's
 * options into the sprite draw.
 */

/** Minimal HTMLImageElement stand-in: decodes only when a test says so. */
class FakeImage {
  static all: FakeImage[] = [];
  src = "";
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.all.push(this);
  }
  decode(): void {
    this.complete = true;
    this.naturalWidth = 8;
    this.naturalHeight = 4;
  }
  fail(): void {
    this.complete = true;
    this.onerror?.();
  }
}

/** Offscreen canvas stand-in that counts pixel read-backs (one per tint render). */
class FakeCanvas {
  static all: FakeCanvas[] = [];
  static reads = 0;
  width = 300;
  height = 150;
  constructor() {
    FakeCanvas.all.push(this);
  }
  getContext() {
    return {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        FakeCanvas.reads++;
        return { data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData: () => {},
    };
  }
}

const requested = () => FakeImage.all.map((i) => i.src).sort();
const sheet = (name: string): FakeImage => {
  const img = FakeImage.all.find((i) => i.src.endsWith(name));
  if (!img) throw new Error(`${name} was never requested`);
  return img;
};

const SPRITE = "../../src/components/Game/climberSprite";
const REGISTRY = "../../src/components/Game/climberCharacters";
const load = () => import("../../src/components/Game/climberSprite");

/** Registry fixture: ibex has its own art, so sheet-character paths run. */
async function withIbexArt() {
  vi.doMock(REGISTRY, async (importOriginal) => {
    const real = await importOriginal<typeof import("../../src/components/Game/climberCharacters")>();
    return {
      ...real,
      CLIMBER_CHARACTERS: { ...real.CLIMBER_CHARACTERS, ibex: real.sheets("ibex") },
    };
  });
  return load();
}

/**
 * Registry fixture: ibex and yak have no art, whatever the live registry says,
 * so the "draws as the plain Wraith" paths run as avatars gain real sheets.
 */
async function withoutArt() {
  vi.doMock(REGISTRY, async (importOriginal) => {
    const real = await importOriginal<typeof import("../../src/components/Game/climberCharacters")>();
    return {
      ...real,
      CLIMBER_CHARACTERS: { ...real.CLIMBER_CHARACTERS, ibex: real.base(), yak: real.base() },
    };
  });
  return load();
}

/** Registry fixture: ibex and yak are recolours (not in the live registry). */
async function withTints() {
  vi.doMock(REGISTRY, async (importOriginal) => {
    const real = await importOriginal<typeof import("../../src/components/Game/climberCharacters")>();
    const p = real.RECOLOR_PALETTE;
    return {
      ...real,
      CLIMBER_CHARACTERS: {
        ...real.CLIMBER_CHARACTERS,
        ibex: real.tint(p.ibex.accent, p.ibex.body),
        yak: real.tint(p.yak.accent, p.yak.body),
      },
    };
  });
  return load();
}

beforeEach(() => {
  FakeImage.all = [];
  FakeCanvas.all = [];
  FakeCanvas.reads = 0;
  vi.resetModules();
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.doUnmock(REGISTRY);
  vi.doUnmock(SPRITE);
  vi.unstubAllGlobals();
});

describe("registry", () => {
  it("has exactly one entry per avatar in the catalogue", async () => {
    const { CLIMBER_CHARACTERS } = await import("../../src/components/Game/climberCharacters");
    expect(Object.keys(CLIMBER_CHARACTERS).sort()).toEqual(AVATARS.map((a) => a.id).sort());
  });

  it("keeps the Wraith on its shipped sheets and anchor", async () => {
    const { CLIMBER_CHARACTERS } = await import("../../src/components/Game/climberCharacters");
    expect(CLIMBER_CHARACTERS.wraith).toEqual({
      kind: "sheets",
      poses: "/climb/wraith-poses-192.png",
      climb: "/climb/wraith-climb-192.png",
      cell: 192,
      rootX: 96,
      rootY: 172.5,
      refH: 142.5,
    });
  });

  it("uses real art only: no tint entries in the live registry", async () => {
    const { CLIMBER_CHARACTERS } = await import("../../src/components/Game/climberCharacters");
    const kinds = new Set(Object.values(CLIMBER_CHARACTERS).map((c) => c.kind));
    expect(kinds.has("tint")).toBe(false);
  });

  it("RECOLOR_PALETTE: every colour parses, keyed by catalogue avatars other than the Wraith", async () => {
    const { RECOLOR_PALETTE, parseHexColor } = await import("../../src/components/Game/climberCharacters");
    const ids = Object.keys(RECOLOR_PALETTE);
    expect(ids).toHaveLength(18);
    const catalogue = new Set(AVATARS.map((a) => a.id));
    for (const id of ids) {
      expect(catalogue.has(id)).toBe(true);
      expect(id).not.toBe("wraith");
      const { accent, body } = RECOLOR_PALETTE[id];
      expect(parseHexColor(accent)).not.toBeNull();
      expect(parseHexColor(body)).not.toBeNull();
    }
  });

  it("parseHexColor rejects anything but #rrggbb", async () => {
    const { parseHexColor } = await import("../../src/components/Game/climberCharacters");
    expect(parseHexColor("#c6f24d")).toEqual([198, 242, 77]);
    for (const bad of ["c6f24d", "#c6f24", "#c6f24dz", "#fff", "red", ""]) {
      expect(parseHexColor(bad)).toBeNull();
    }
  });
});

describe("resolveClimberCharacter", () => {
  it("returns the avatar's own entry when it has art", async () => {
    const { resolveClimberCharacter, climberCharacter } = await withIbexArt();
    expect(resolveClimberCharacter("ibex")).toBe("ibex");
    expect(climberCharacter("ibex")).toMatchObject({ kind: "sheets", poses: "/climb/ibex-poses-192.png" });
  });

  it("resolves every catalogue avatar without art to the plain Wraith", async () => {
    const { resolveClimberCharacter, climberCharacter } = await load();
    const { CLIMBER_CHARACTERS, WRAITH } = await import("../../src/components/Game/climberCharacters");
    let checked = 0;
    for (const { id } of AVATARS) {
      if (CLIMBER_CHARACTERS[id].kind !== "base") continue;
      expect(resolveClimberCharacter(id)).toBe("wraith");
      expect(climberCharacter(id)).toBe(WRAITH);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("resolves a tint (recolour feature) to its own entry", async () => {
    const { resolveClimberCharacter } = await withTints();
    expect(resolveClimberCharacter("yak")).toBe("yak");
  });

  it("falls back to the Wraith for null, unknown and prototype-key ids", async () => {
    const { resolveClimberCharacter } = await load();
    const bad: unknown[] = [
      null,
      undefined,
      "",
      "Ibex",
      "dragon",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      42,
      { id: "ibex" },
    ];
    for (const id of bad) expect(resolveClimberCharacter(id)).toBe("wraith");
  });
});

describe("lazy loading", () => {
  it("requests nothing until a character is drawn", async () => {
    await load();
    expect(FakeImage.all).toHaveLength(0);
  });

  it("an avatar without art draws the Wraith's sheets and loads no extra sheet", async () => {
    vi.stubGlobal("document", { createElement: () => new FakeCanvas() });
    const { climberFrame } = await withoutArt();
    expect(climberFrame("idle", 0, 0, false, "ibex")).toBeNull();
    climberFrame("idle", 0, 0, false, "wraith");
    climberFrame("idle", 0, 0, false, "yak");
    // One request per Wraith sheet, shared by every avatar without art.
    expect(requested()).toEqual(["/climb/wraith-climb-192.png", "/climb/wraith-poses-192.png"]);
    sheet("wraith-poses-192.png").decode();
    const f = climberFrame("idle", 0, 0, false, "ibex")!;
    expect(f.img).toBe(sheet("wraith-poses-192.png")); // the plain sheet, not a recolour
    expect(f.character).toBe("wraith");
    expect(FakeCanvas.all).toHaveLength(0);
  });

  it("a tint (recolour feature) loads only the Wraith sheets", async () => {
    const { climberFrame } = await withTints();
    expect(climberFrame("idle", 0, 0, false, "ibex")).toBeNull();
    expect(requested()).toEqual(["/climb/wraith-climb-192.png", "/climb/wraith-poses-192.png"]);
  });

  it("a character with art loads its own sheets, and only when drawn", async () => {
    const { climberFrame } = await withIbexArt();
    climberFrame("idle", 0, 0, false, "wraith");
    expect(requested()).toEqual(["/climb/wraith-climb-192.png", "/climb/wraith-poses-192.png"]);
    climberFrame("idle", 0, 0, false, "ibex");
    expect(requested()).toEqual([
      "/climb/ibex-climb-192.png",
      "/climb/ibex-poses-192.png",
      "/climb/wraith-climb-192.png",
      "/climb/wraith-poses-192.png",
    ]);
    // Drawing ibex again requests nothing new.
    climberFrame("walk", 3, 0, false, "ibex");
    expect(FakeImage.all).toHaveLength(4);
  });

  it("draws a character's own frames once its poses decode (vector until then)", async () => {
    const { climberFrame } = await withIbexArt();
    expect(climberFrame("idle", 0, 0, false, "ibex")).toBeNull();
    sheet("ibex-poses-192.png").decode();
    const f = climberFrame("idle", 0, 0, false, "ibex")!;
    expect(f.img).toBe(sheet("ibex-poses-192.png"));
    expect(f.character).toBe("ibex");
    // Climb strip still loading: the reach frames from its own poses sheet.
    expect(climberFrame("climb", 0, 0.3, false, "ibex")!.img).toBe(sheet("ibex-poses-192.png"));
  });

  it("draws the Wraith when a character's own poses sheet fails", async () => {
    const { climberFrame } = await withIbexArt();
    climberFrame("idle", 0, 0, false, "ibex");
    sheet("ibex-poses-192.png").fail();
    expect(climberFrame("idle", 0, 0, false, "ibex")).toBeNull(); // Wraith not decoded yet
    sheet("wraith-poses-192.png").decode();
    const f = climberFrame("idle", 0, 0, false, "ibex")!;
    expect(f.img).toBe(sheet("wraith-poses-192.png"));
    expect(f.character).toBe("wraith");
  });

  it("setClimberSpriteSrc re-points one character and leaves the others alone", async () => {
    const { climberFrame, setClimberSpriteSrc } = await withIbexArt();
    climberFrame("idle", 0, 0, false, "wraith");
    sheet("wraith-poses-192.png").decode();
    setClimberSpriteSrc({ poses: "./assets/ibex-p.png" }, "ibex");
    climberFrame("idle", 0, 0, false, "ibex");
    expect(requested()).toContain("./assets/ibex-p.png");
    expect(requested()).not.toContain("/climb/ibex-poses-192.png");
    // The Wraith's decode was kept.
    expect(climberFrame("idle", 0, 0, false, "wraith")!.img).toBe(sheet("wraith-poses-192.png"));
  });

  it("setClimberSpriteSrc ignores avatars without art and ids outside the registry", async () => {
    const { climberFrame, setClimberSpriteSrc } = await withoutArt();
    setClimberSpriteSrc({ poses: "./assets/x.png" }, "ibex");
    setClimberSpriteSrc({ poses: "./assets/y.png" }, "__proto__");
    setClimberSpriteSrc({ poses: "./assets/z.png" }, "dragon");
    climberFrame("idle", 0, 0, false, "ibex");
    climberFrame("idle", 0, 0, false, "wraith");
    expect(requested()).toEqual(["/climb/wraith-climb-192.png", "/climb/wraith-poses-192.png"]);
  });
});

describe("tint cache (recolour feature, via a registry override)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeCanvas() });
  });

  it("renders each tinted sheet once per character, however often it draws", async () => {
    const { climberFrame } = await withTints();
    climberFrame("idle", 0, 0, false, "ibex");
    sheet("wraith-poses-192.png").decode();
    sheet("wraith-climb-192.png").decode();

    const first = climberFrame("idle", 0, 0, false, "ibex")!.img;
    expect(first).toBeInstanceOf(FakeCanvas);
    expect(first).not.toBe(sheet("wraith-poses-192.png"));
    for (let k = 0; k < 20; k++) {
      expect(climberFrame(k % 2 ? "walk" : "air", k, 0, false, "ibex")!.img).toBe(first);
    }
    expect(FakeCanvas.reads).toBe(1);

    // The climb strip is its own sheet: one more render, then cached too.
    const climb = climberFrame("climb", 0, 0.3, false, "ibex")!.img;
    climberFrame("climb", 0, 1.3, false, "ibex");
    expect(climb).not.toBe(first);
    expect(FakeCanvas.reads).toBe(2);

    // Another character gets its own canvas; the Wraith never renders a tint.
    const yak = climberFrame("idle", 0, 0, false, "yak")!.img;
    expect(yak).not.toBe(first);
    expect(climberFrame("idle", 0, 0, false, "wraith")!.img).toBe(sheet("wraith-poses-192.png"));
    expect(FakeCanvas.reads).toBe(3);
  });

  it("re-renders when the Wraith base sheet is replaced (native bundle override)", async () => {
    const { climberFrame, setClimberSpriteSrc } = await withTints();
    climberFrame("idle", 0, 0, false, "ibex");
    sheet("wraith-poses-192.png").decode();
    const before = climberFrame("idle", 0, 0, false, "ibex")!.img;
    setClimberSpriteSrc({ poses: "./assets/wp.png" });
    climberFrame("idle", 0, 0, false, "ibex");
    sheet("wp.png").decode();
    const after = climberFrame("idle", 0, 0, false, "ibex")!.img;
    expect(after).not.toBe(before);
    expect(FakeCanvas.reads).toBe(2);
  });

  it("an override aimed at a tint neither loads anything nor drops its rendered canvas", async () => {
    const { climberFrame, setClimberSpriteSrc } = await withTints();
    climberFrame("idle", 0, 0, false, "ibex");
    sheet("wraith-poses-192.png").decode();
    const before = climberFrame("idle", 0, 0, false, "ibex")!.img;
    setClimberSpriteSrc({ poses: "./assets/ibex.png" }, "ibex");
    expect(climberFrame("idle", 0, 0, false, "ibex")!.img).toBe(before);
    expect(FakeCanvas.reads).toBe(1);
    expect(requested()).not.toContain("./assets/ibex.png");
  });

  it("draws the Wraith untinted when no canvas can be made", async () => {
    vi.stubGlobal("document", undefined);
    const { climberFrame } = await withTints();
    climberFrame("idle", 0, 0, false, "ibex");
    sheet("wraith-poses-192.png").decode();
    expect(climberFrame("idle", 0, 0, false, "ibex")!.img).toBe(sheet("wraith-poses-192.png"));
  });
});

describe("tintPixels", () => {
  const rgba = (...px: number[][]) => new Uint8ClampedArray(px.flatMap((p) => [...p]));

  it("maps the Wraith lime to the accent and leaves greys alone without a body tone", async () => {
    const { tintPixels, tintSpec } = await import("../../src/components/Game/climberTint");
    const spec = tintSpec({ kind: "tint", accent: "#ecba55", body: null })!;
    const data = rgba([198, 242, 77, 255], [40, 40, 40, 255], [198, 242, 77, 0]);
    tintPixels(data, spec);
    const [r, g, b] = data.slice(0, 3);
    expect(Math.abs(r - 0xec)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 0xba)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 0x55)).toBeLessThanOrEqual(2);
    expect([...data.slice(4, 8)]).toEqual([40, 40, 40, 255]);
    expect([...data.slice(8, 12)]).toEqual([198, 242, 77, 0]); // transparent: untouched
  });

  it("leans dark greys toward the body tone at about the same brightness", async () => {
    const { tintPixels, tintSpec } = await import("../../src/components/Game/climberTint");
    const spec = tintSpec({ kind: "tint", accent: "#f1442a", body: "#321412" })!;
    const data = rgba([40, 40, 40, 255]);
    tintPixels(data, spec);
    const [r, g, b] = data;
    expect(r).toBeGreaterThan(g); // reddish
    expect(r).toBeGreaterThan(b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(Math.abs(luma - 40)).toBeLessThan(3);
  });

  it("builds a tint spec for every RECOLOR_PALETTE entry that moves the Wraith lime", async () => {
    const { tintPixels, tintSpec } = await import("../../src/components/Game/climberTint");
    const { RECOLOR_PALETTE, tint } = await import("../../src/components/Game/climberCharacters");
    let checked = 0;
    for (const { accent, body } of Object.values(RECOLOR_PALETTE)) {
      const spec = tintSpec(tint(accent, body));
      expect(spec).not.toBeNull();
      const data = rgba([198, 242, 77, 255]);
      tintPixels(data, spec!);
      expect([...data]).not.toEqual([198, 242, 77, 255]);
      checked++;
    }
    expect(checked).toBe(18);
  });

  it("does not treat other saturated hues as accent", async () => {
    const { tintPixels, tintSpec } = await import("../../src/components/Game/climberTint");
    const spec = tintSpec({ kind: "tint", accent: "#1982f5", body: null })!;
    const data = rgba([220, 40, 40, 255]); // red: far from lime
    tintPixels(data, spec);
    expect([...data]).toEqual([220, 40, 40, 255]);
  });
});

describe("avatar id reaches the draw call", () => {
  async function paintWith(opts: {
    playerIds: string[];
    myId?: string;
    avatarIds?: Record<string, string | null>;
    myAvatarId?: string | null;
  }) {
    const sprite = await withIbexArt();
    // Decode every sheet the first paint requests, then paint again.
    const { paintClimbFrame } = await import("../../src/components/Game/paintClimbFrame");
    const { createMatch } = await import("../../src/game/simulation");
    const { buildTower } = await import("../../src/game/towers");
    const m = createMatch({
      seed: "avatars",
      mode: opts.playerIds.length > 1 ? "multiplayer" : "solo",
      tower: buildTower("indie-games"),
      playerIds: opts.playerIds,
    });
    const images: unknown[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (prop === "drawImage") return (img: unknown) => images.push(img);
        if (prop === "measureText") return () => ({ width: 10 });
        if (typeof prop === "string" && prop.startsWith("create")) return () => ({ addColorStop() {} });
        return () => {};
      },
      set(t, prop, v) {
        t[prop] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    const paint = () =>
      paintClimbFrame(ctx, m, {
        width: 360,
        height: 640,
        includeHud: false,
        myId: opts.myId,
        avatarIds: opts.avatarIds,
        myAvatarId: opts.myAvatarId,
        climberMotion: sprite.createClimberMotionBag(),
      });
    paint();
    FakeImage.all.forEach((i) => i.decode());
    images.length = 0;
    paint();
    const drawn = (name: string) => FakeImage.all.filter((i) => i.src.endsWith(name)).some((i) => images.includes(i));
    return { drawn, requestedNow: requested() };
  }

  it("draws each duellist as their own avatar, keyed by player id", async () => {
    const { drawn } = await paintWith({
      playerIds: ["p1", "p2"],
      myId: "p1",
      avatarIds: { p1: "ibex", p2: "wraith" },
    });
    expect(drawn("ibex-poses-192.png")).toBe(true);
    expect(drawn("wraith-poses-192.png")).toBe(true);
  });

  it("draws the Wraith for an opponent with no avatar, and never loads unused art", async () => {
    const { drawn, requestedNow } = await paintWith({
      playerIds: ["p1", "p2"],
      myId: "p1",
      avatarIds: { p1: null, p2: "dragon" },
    });
    expect(drawn("wraith-poses-192.png")).toBe(true);
    expect(requestedNow.some((s) => s.includes("ibex"))).toBe(false);
  });

  it("uses myAvatarId for the local climber on solo screens", async () => {
    const { drawn } = await paintWith({ playerIds: ["solo"], myAvatarId: "ibex" });
    expect(drawn("ibex-poses-192.png")).toBe(true);
    expect(drawn("wraith-poses-192.png")).toBe(false);
  });

  it("climberAvatarId reads own keys only", async () => {
    const { climberAvatarId } = await import("../../src/components/Game/paintClimbFrame");
    const inherited = Object.create({ p2: "ibex" }) as Record<string, string | null>;
    expect(climberAvatarId({ avatarIds: inherited }, "p2", false)).toBeNull();
    expect(climberAvatarId({ avatarIds: { p2: "ibex" } }, "p2", false)).toBe("ibex");
    expect(climberAvatarId({ avatarIds: {}, myAvatarId: "yak" }, "me", true)).toBe("yak");
    expect(climberAvatarId({ avatarIds: {}, myAvatarId: "yak" }, "them", false)).toBeNull();
    // An explicit entry for the local player wins over myAvatarId.
    expect(climberAvatarId({ avatarIds: { me: "ibex" }, myAvatarId: "yak" }, "me", true)).toBe("ibex");
  });
});
