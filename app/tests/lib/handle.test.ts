/**
 * Climber pseudonym tests — the public skill leaderboard must never leak an
 * email, and a given user must always show the same handle. With no display
 * name, the pseudonym's animal follows an animal avatar; the adjective and
 * number never move, and without an avatar the handle is exactly what it was
 * before avatars could rename anyone.
 */

import { describe, it, expect } from "vitest";
import { ANIMALS, climberHandle, climberDisplay, defaultAvatarFor } from "../../src/lib/handle";
import { AVATARS, parseAvatarId } from "../../src/lib/avatars";

// Captured from climberHandle before the avatar parameter existed (HEAD
// 63650b9). Existing players' names must not change for anyone who has not
// picked an animal avatar.
const PINNED: Readonly<Record<string, string>> = {
  "uid-1": "Crimson Cobra 76",
  "firebase-uid-abc": "Rapid Badger 73",
  "alice@example.com": "Fearless Otter 52",
  "sender-1": "Vivid Ibex 29",
  "guest:abc123": "Shadow Badger 2",
  zQ9xLm2PqR7sT4vW: "Rapid Raven 83",
  "": "Nimble Kestrel 52",
  "user-0": "Lucky Badger 59",
  "user-49": "Fearless Bison 52",
  "🧗": "Silent Bison 52",
};
const PINNED_IDS = Object.keys(PINNED);

const ANIMAL_AVATARS = AVATARS.filter((a) => ANIMALS.some((w) => w.toLowerCase() === a.id));
const NON_ANIMAL_AVATARS = AVATARS.filter((a) => !ANIMAL_AVATARS.includes(a));

/** The pinned handle with its middle word swapped for `animal`. */
function withAnimal(id: string, animal: string): string {
  const [adj, , num] = PINNED[id].split(" ");
  return `${adj} ${animal} ${num}`;
}

describe("climberHandle", () => {
  it("is deterministic for the same id", () => {
    expect(climberHandle("firebase-uid-abc")).toBe(climberHandle("firebase-uid-abc"));
  });

  it("does not contain the raw id or an email", () => {
    const h = climberHandle("alice@example.com");
    expect(h).not.toContain("alice");
    expect(h).not.toContain("@");
  });

  it("produces a readable 'Adjective Animal N' handle", () => {
    expect(climberHandle("uid-1")).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,2}$/);
  });

  it("varies across different ids (no single constant handle)", () => {
    const handles = new Set(
      Array.from({ length: 50 }, (_, i) => climberHandle(`user-${i}`))
    );
    expect(handles.size).toBeGreaterThan(10);
  });
});

describe("climberDisplay", () => {
  it("uses the profile display name when set", () => {
    expect(climberDisplay("uid-1", "Acme Labs")).toBe("Acme Labs");
  });

  it("trims the display name", () => {
    expect(climberDisplay("uid-1", "  Acme Labs  ")).toBe("Acme Labs");
  });

  it("falls back to the pseudonym when the name is missing or blank", () => {
    const fallback = climberHandle("uid-1");
    expect(climberDisplay("uid-1")).toBe(fallback);
    expect(climberDisplay("uid-1", null)).toBe(fallback);
    expect(climberDisplay("uid-1", "")).toBe(fallback);
    expect(climberDisplay("uid-1", "   ")).toBe(fallback);
  });
});

describe("climberHandle without an avatar (regression pin)", () => {
  it.each(PINNED_IDS)("is unchanged for %j", (id) => {
    expect(climberHandle(id)).toBe(PINNED[id]);
    expect(climberHandle(id, null)).toBe(PINNED[id]);
    expect(climberHandle(id, undefined)).toBe(PINNED[id]);
  });
});

describe("climberHandle with an avatar", () => {
  it("has one animal avatar per pseudonym animal, and three that are not animals", () => {
    expect(ANIMAL_AVATARS).toHaveLength(ANIMALS.length);
    expect(NON_ANIMAL_AVATARS.map((a) => a.id).sort()).toEqual(["sentinel", "viking", "wraith"]);
  });

  it.each(ANIMAL_AVATARS.map((a) => [a.id, a.name]))(
    "uses the %s avatar's animal and keeps the hash adjective and number",
    (avatarId, name) => {
      for (const id of PINNED_IDS) {
        expect(climberHandle(id, avatarId)).toBe(withAnimal(id, name));
      }
    }
  );

  it("renames 'Crimson Cobra 76' to 'Crimson Wolf 76' for the Wolf avatar", () => {
    expect(climberHandle("uid-1", "wolf")).toBe("Crimson Wolf 76");
  });

  it.each(NON_ANIMAL_AVATARS.map((a) => a.id))("keeps the hash animal for the non-animal avatar %s", (avatarId) => {
    for (const id of PINNED_IDS) expect(climberHandle(id, avatarId)).toBe(PINNED[id]);
  });

  it.each([
    "retired-avatar",
    "",
    "Wolf",
    "WOLF",
    " wolf",
    "wolf ",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ])("keeps the hash animal for the unknown or prototype-key avatar %j", (avatarId) => {
    for (const id of PINNED_IDS) expect(climberHandle(id, avatarId)).toBe(PINNED[id]);
  });

  it.each<unknown>([42, true, {}, ["wolf"], { id: "wolf" }])(
    "keeps the hash animal for a non-string avatar %j (untrusted client JSON)",
    (avatarId) => {
      expect(climberHandle("uid-1", avatarId as string)).toBe(PINNED["uid-1"]);
    }
  );
});

describe("climberDisplay with an avatar", () => {
  it("lets the animal avatar rename a player with no display name", () => {
    expect(climberDisplay("uid-1", null, "wolf")).toBe("Crimson Wolf 76");
    expect(climberDisplay("uid-1", undefined, "wolf")).toBe("Crimson Wolf 76");
    expect(climberDisplay("uid-1", "   ", "wolf")).toBe("Crimson Wolf 76");
  });

  it("never changes a custom display name, whatever the avatar", () => {
    for (const a of AVATARS) expect(climberDisplay("uid-1", "Acme Labs", a.id)).toBe("Acme Labs");
    expect(climberDisplay("uid-1", "  Acme Labs ", "wolf")).toBe("Acme Labs");
  });

  it("falls back to the unchanged pseudonym for a non-animal or unknown avatar", () => {
    expect(climberDisplay("uid-1", null, "wraith")).toBe(PINNED["uid-1"]);
    expect(climberDisplay("uid-1", null, "__proto__")).toBe(PINNED["uid-1"]);
    expect(climberDisplay("uid-1", null, null)).toBe(PINNED["uid-1"]);
  });
});

describe("ANIMALS and the avatar catalogue", () => {
  it.each([...ANIMALS])("%s lowercased is a catalogue avatar id", (animal) => {
    expect(parseAvatarId(animal.toLowerCase())).toBe(animal.toLowerCase());
  });
});

describe("defaultAvatarFor", () => {
  const ids = [...PINNED_IDS, ...Array.from({ length: 200 }, (_, i) => `firebase-${i}-${i * 7919}`)];

  it("is always a catalogue animal avatar id", () => {
    let checked = 0;
    for (const id of ids) {
      const avatar = defaultAvatarFor(id);
      expect(parseAvatarId(avatar)).toBe(avatar);
      expect(ANIMAL_AVATARS.map((a) => a.id)).toContain(avatar);
      checked++;
    }
    expect(checked).toBe(ids.length);
  });

  it("is the pseudonym's own animal, so saving it leaves the name unchanged", () => {
    for (const id of PINNED_IDS) {
      expect(climberHandle(id, defaultAvatarFor(id))).toBe(PINNED[id]);
      expect(PINNED[id].split(" ")[1].toLowerCase()).toBe(defaultAvatarFor(id));
    }
  });

  it("spreads across many animals rather than one constant", () => {
    expect(new Set(ids.map(defaultAvatarFor)).size).toBeGreaterThan(8);
  });
});
