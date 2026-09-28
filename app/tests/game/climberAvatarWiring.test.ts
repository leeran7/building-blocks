import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avatarIdsByPlayer } from "../../src/lib/avatars";
import { BUNDLED_SHEET_FILES, climberSheetsFromFiles } from "../../mobile/src/lib/climberSheets";

/**
 * The plumbing that gets avatar ids to the climb view: duel API bodies, the
 * client-side player-id map, and the native bundle's per-character sheets.
 */

describe("avatarIdsByPlayer", () => {
  it("maps each present player id to a parsed avatar id", () => {
    expect(
      avatarIdsByPlayer([
        { id: "u1", avatarId: "ibex" },
        { id: "u2", avatarId: "dragon" },
        { id: "u3" },
        null,
        { id: "", avatarId: "yak" },
      ])
    ).toEqual({ u1: "ibex", u2: null, u3: null });
  });

  it("keeps a '__proto__' player id as an own key without touching the prototype", () => {
    const out = avatarIdsByPlayer([{ id: "__proto__", avatarId: "yak" }]);
    expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).yak).toBeUndefined();
  });
});

describe("mobile bundled climber sheets", () => {
  it("parses <id>-poses-192.png / <id>-climb-192.png paths into per-character URLs", () => {
    const sheets = climberSheetsFromFiles({
      "../../../public/climb/wraith-poses-192.png": "/assets/wp.png",
      "../../../public/climb/wraith-climb-192.png": "/assets/wc.png",
      "../../../public/climb/ibex-poses-192.png": "/assets/ip.png",
      "../../../public/climb/volcano-tile.jpg": "/assets/v.jpg",
      "../../../public/climb/yak-poses-96.png": "/assets/y.png",
      "../../../public/climb/lynx-poses-192.png": 42,
    });
    expect([...sheets.entries()].sort()).toEqual([
      ["ibex", { poses: "/assets/ip.png" }],
      ["wraith", { poses: "/assets/wp.png", climb: "/assets/wc.png" }],
    ]);
  });

  it("the real glob finds the shipped Wraith sheets", () => {
    const sheets = climberSheetsFromFiles(BUNDLED_SHEET_FILES);
    const wraith = sheets.get("wraith");
    expect(wraith?.poses).toMatch(/wraith-poses-192\.png/);
    expect(wraith?.climb).toMatch(/wraith-climb-192\.png/);
  });

  describe("applyBundledClimberSheets", () => {
    class FakeImage {
      static all: FakeImage[] = [];
      src = "";
      complete = false;
      naturalWidth = 0;
      onerror: (() => void) | null = null;
      constructor() {
        FakeImage.all.push(this);
      }
    }
    beforeEach(() => {
      FakeImage.all = [];
      vi.resetModules();
      vi.stubGlobal("Image", FakeImage);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("points each character's sheets at the bundled URLs", async () => {
      const { applyBundledClimberSheets: apply } = await import("../../mobile/src/lib/climberSheets");
      const { climberFrame } = await import("../../src/components/Game/climberSprite");
      expect(
        apply({
          "/x/wraith-poses-192.png": "bundle://wp.png",
          "/x/wraith-climb-192.png": "bundle://wc.png",
        })
      ).toBe(1);
      climberFrame("idle", 0, 0, false, "wraith");
      expect(FakeImage.all.map((i) => i.src).sort()).toEqual(["bundle://wc.png", "bundle://wp.png"]);
    });
  });
});

describe("duel replay API carries each player's avatar id", () => {
  afterEach(() => {
    vi.doUnmock("../../src/db/duel");
    vi.resetModules();
  });

  it("parses stored ids and drops retired ones", async () => {
    vi.resetModules();
    vi.doMock("../../src/db/duel", () => ({
      getDuel: vi.fn(async () => ({
        id: "d1",
        status: "completed",
        seed: "s",
        category_slug: "indie-games",
        player1: { id: "u1", display_name: "Ann", avatar_id: "ibex" },
        player2: { id: "u2", display_name: null, avatar_id: "retired-dragon" },
        player1_peak: 10,
        player2_peak: 5,
        player1_replay: null,
        player2_replay: null,
        winner_id: "u1",
        tiebreak_rule: null,
        forfeit: false,
      })),
    }));
    const { GET } = await import("../../app/api/duel/[id]/replay/route");
    const res = await GET({} as never, { params: Promise.resolve({ id: "d1" }) });
    const body = (await res.json()) as {
      player1: { avatarId: unknown };
      player2: { avatarId: unknown };
    };
    expect(body.player1.avatarId).toBe("ibex");
    expect(body.player2.avatarId).toBeNull();
    expect(avatarIdsByPlayer([
      { id: "u1", avatarId: body.player1.avatarId },
      { id: "u2", avatarId: body.player2.avatarId },
    ])).toEqual({ u1: "ibex", u2: null });
  });
});
