/**
 * parseAvatarId is the allow-list every avatar write (PUT /api/settings) and
 * read (settings, leaderboards) passes through. It must accept exactly the
 * catalogue ids and reject everything else — including keys every plain
 * object inherits, which an `in` check would let through to the database.
 */

import { describe, expect, it } from "vitest";
import {
  AVATARS,
  CHARACTER_ENTRIES,
  avatarName,
  characterIdOf,
  formatGems,
  gemPrice,
  parseAvatarId,
  skinsOf,
} from "../../src/lib/avatars";

describe("parseAvatarId", () => {
  it("accepts every catalogue id as itself", () => {
    expect(AVATARS.length).toBeGreaterThan(0);
    for (const a of AVATARS) expect(parseAvatarId(a.id)).toBe(a.id);
  });

  it("rejects ids that are not in the catalogue, including near misses", () => {
    expect(parseAvatarId("unknown-avatar")).toBeNull();
    expect(parseAvatarId("")).toBeNull();
    expect(parseAvatarId(`${AVATARS[0].id} `)).toBeNull();
    expect(parseAvatarId(AVATARS[0].id.toUpperCase())).toBeNull();
  });

  it("rejects inherited object keys rather than treating them as avatars", () => {
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
      expect(parseAvatarId(key)).toBeNull();
    }
  });

  it("rejects non-strings instead of coercing them", () => {
    for (const v of [null, undefined, 0, 1, true, {}, [], [AVATARS[0].id], { id: AVATARS[0].id }]) {
      expect(parseAvatarId(v)).toBeNull();
    }
  });
});

describe("AVATARS catalogue", () => {
  // Ids are persisted in users.avatar_id: renaming or dropping one silently
  // retires every player who picked it, so the list is a stored contract.
  it("is the approved gallery, in order: Wraith, the stick figures, the star ladder, Gecko last, then the Void skins", () => {
    const characters = [
      "Wraith",
      "Green Stick", "Ember Stick", "Amber Stick", "Sky Stick", "Violet Stick", "Pink Stick",
      "Kestrel", "Lynx", "Raven", "Panther", "Wolf", "Otter", "Heron", "Yak", "Mantis", "Cobra",
      "Badger", "Falcon", "Marmot", "Bison", "Ibex", "Sentinel", "Viking", "Gecko",
    ];
    const withArt = characters.filter((n) => !n.endsWith(" Stick"));
    expect(AVATARS.map((a) => a.name)).toEqual([
      ...characters,
      "Void Walker",
      ...withArt.slice(1).map((n) => `Void ${n}`),
    ]);
    expect(CHARACTER_ENTRIES.map((a) => a.name)).toEqual(characters);
    let sticks = 0;
    let skins = 0;
    for (const a of AVATARS) {
      if (a.skinOf !== undefined) {
        skins++;
        // "lynx-void" dresses "lynx"
        expect(a.id).toBe(`${a.skinOf}-void`);
        expect(skinsOf(a.skinOf).map((s) => s.id)).toEqual([a.id]);
      } else if (a.stickColor !== undefined) {
        sticks++;
        // "Green Stick" -> "stick-green"
        expect(a.id).toBe(`stick-${a.name.replace(/ Stick$/, "").toLowerCase()}`);
        expect(a.stickColor).toMatch(/^#[0-9a-f]{6}$/);
      } else {
        expect(a.id).toBe(a.name.toLowerCase());
      }
    }
    expect(sticks).toBe(6);
    expect(skins).toBe(withArt.length);
    expect(skinsOf("stick-green")).toEqual([]);
  });

  it("has unique, filename-safe ids and non-empty names", () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of AVATARS) {
      expect(a.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(a.name.trim()).not.toBe("");
    }
  });
});

describe("avatarName", () => {
  it("names catalogue ids and returns null for anything else", () => {
    expect(avatarName(AVATARS[0].id)).toBe(AVATARS[0].name);
    expect(avatarName(null)).toBeNull();
    expect(avatarName("toString")).toBeNull();
  });
});

describe("Shop helpers", () => {
  it("maps a skin to its character and a character to itself, and nothing else to anything", () => {
    expect(characterIdOf("lynx-void")).toBe("lynx");
    expect(characterIdOf("wraith-void")).toBe("wraith");
    expect(characterIdOf("lynx")).toBe("lynx");
    for (const bad of ["lynx-gold", "__proto__", "", null, 3]) expect(characterIdOf(bad)).toBeNull();
  });

  it("prices only purchase rules", () => {
    expect(gemPrice(AVATARS.find((a) => a.id === "wraith")!)).toBe(2000);
    expect(gemPrice(AVATARS.find((a) => a.id === "lynx-void")!)).toBe(1200);
    expect(gemPrice(AVATARS.find((a) => a.id === "lynx")!)).toBeNull();
  });

  it("groups gem amounts with commas", () => {
    expect(formatGems(0)).toBe("0");
    expect(formatGems(999)).toBe("999");
    expect(formatGems(1200)).toBe("1,200");
    expect(formatGems(1234567)).toBe("1,234,567");
  });
});
