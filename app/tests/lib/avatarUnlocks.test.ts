/**
 * Avatar unlock rules (src/lib/avatars.ts) and who may select what
 * (src/lib/avatarUnlocks.ts). Callers: the settings route and db layer, the
 * level result route, and the mobile picker.
 */

import { describe, expect, it } from "vitest";
import { LEVELS_PER_SEASON } from "../../src/game/levels/season";
import {
  AVATARS,
  avatarEntry,
  avatarsUnlockedBetween,
  earnStarsText,
  parseAvatarIdList,
  starsToUnlock,
  switchAwayWarning,
  unlockMessage,
  unlockRequirementText,
} from "../../src/lib/avatars";
import { avatarLockFor, avatarUnlockState, avatarsNewlyUnlocked } from "../../src/lib/avatarUnlocks";
import { defaultAvatarFor } from "../../src/lib/handle";

const MAX_STARS_PER_SEASON = LEVELS_PER_SEASON * 3;
const starRules = AVATARS.flatMap((a) => (a.unlock.kind === "stars" ? [{ id: a.id, stars: a.unlock.stars }] : []));

describe("catalogue unlock rules", () => {
  it("keeps Wraith, Viking and Sentinel free and gives every other avatar a star rule", () => {
    expect(AVATARS.filter((a) => a.unlock.kind === "free").map((a) => a.id)).toEqual(["wraith", "viking", "sentinel"]);
    expect(starRules).toHaveLength(AVATARS.length - 3);
  });

  it("rises strictly in catalogue order and stays within one season's stars", () => {
    expect(starRules.length).toBeGreaterThan(0);
    for (let i = 1; i < starRules.length; i++) expect(starRules[i].stars).toBeGreaterThan(starRules[i - 1].stars);
    expect(starRules[0].stars).toBeGreaterThan(0);
    expect(starRules.at(-1)!.stars).toBeLessThanOrEqual(MAX_STARS_PER_SEASON);
  });

  it("words the requirement and counts the stars still needed", () => {
    const falcon = avatarEntry("falcon")!;
    expect(unlockRequirementText(falcon)).toBe("Earn 30 stars");
    expect(unlockRequirementText(avatarEntry("wraith")!)).toBeNull();
    expect(starsToUnlock(falcon, 12)).toBe(18);
    expect(starsToUnlock(falcon, 29)).toBe(1);
    expect(starsToUnlock(falcon, 30)).toBe(0);
    expect(starsToUnlock(falcon, 400)).toBe(0);
  });

  it("avatarEntry allow-lists like parseAvatarId", () => {
    for (const bad of ["__proto__", "constructor", "toString", "Falcon", "", 42, null]) expect(avatarEntry(bad)).toBeNull();
    expect(avatarEntry("falcon")?.name).toBe("Falcon");
  });
});

describe("avatarsUnlockedBetween", () => {
  it("includes a threshold reached exactly and excludes one a star short", () => {
    expect(avatarsUnlockedBetween(12, 15)).toEqual(["ibex"]);
    expect(avatarsUnlockedBetween(11, 14)).toEqual([]);
  });

  it("excludes a threshold already met before, and lists several crossed at once in order", () => {
    expect(avatarsUnlockedBetween(15, 18)).toEqual([]);
    expect(avatarsUnlockedBetween(0, 50)).toEqual(["ibex", "falcon", "marmot"]);
  });

  it("never lists a free avatar", () => {
    expect(avatarsUnlockedBetween(-1, MAX_STARS_PER_SEASON)).toEqual(starRules.map((r) => r.id));
  });
});

describe("avatarLockFor / avatarUnlockState", () => {
  const uid = "player-7";
  const starter = defaultAvatarFor(uid);
  const target = AVATARS.find((a) => a.unlock.kind === "stars" && a.id !== starter)!;
  const need = target.unlock.kind === "stars" ? target.unlock.stars : NaN;

  it("locks one star short and unlocks at the threshold", () => {
    expect(avatarLockFor(target, { stars: need - 1, savedAvatarId: null, userId: uid })).toEqual({
      avatarId: target.id,
      name: target.name,
      requiredStars: need,
      stars: need - 1,
      message: `Earn ${need} stars to unlock ${target.name}`,
    });
    expect(avatarLockFor(target, { stars: need, savedAvatarId: null, userId: uid })).toBeNull();
  });

  it("grandfathers the saved avatar but no other locked one", () => {
    const input = { stars: 0, savedAvatarId: target.id, userId: uid };
    expect(avatarLockFor(target, input)).toBeNull();
    const other = AVATARS.find((a) => a.unlock.kind === "stars" && a.id !== starter && a.id !== target.id)!;
    expect(avatarLockFor(other, input)).not.toBeNull();
  });

  it("ignores a saved id outside the catalogue", () => {
    const state = avatarUnlockState({ stars: 0, savedAvatarId: "__proto__", userId: uid });
    expect(state.unlockedIds).toEqual(["wraith", "viking", "sentinel", starter]);
  });

  it("always unlocks the account's starter animal and never a free one via stars", () => {
    expect(avatarLockFor(avatarEntry(starter)!, { stars: 0, savedAvatarId: null, userId: uid })).toBeNull();
    expect(avatarLockFor(avatarEntry("sentinel")!, { stars: 0, savedAvatarId: null, userId: uid })).toBeNull();
  });

  it("lists every avatar at a full season of stars, in catalogue order", () => {
    const state = avatarUnlockState({ stars: MAX_STARS_PER_SEASON, savedAvatarId: null, userId: uid });
    expect(state).toEqual({ stars: MAX_STARS_PER_SEASON, unlockedIds: AVATARS.map((a) => a.id), grandfatheredId: null });
  });

  it("marks the saved avatar grandfathered only while its star rule is unmet and it is not the starter", () => {
    expect(avatarUnlockState({ stars: need - 1, savedAvatarId: target.id, userId: uid }).grandfatheredId).toBe(target.id);
    expect(avatarUnlockState({ stars: need, savedAvatarId: target.id, userId: uid }).grandfatheredId).toBeNull();
    expect(avatarUnlockState({ stars: 0, savedAvatarId: starter, userId: uid }).grandfatheredId).toBeNull();
    expect(avatarUnlockState({ stars: 0, savedAvatarId: "wraith", userId: uid }).grandfatheredId).toBeNull();
    expect(avatarUnlockState({ stars: 0, savedAvatarId: "__proto__", userId: uid }).grandfatheredId).toBeNull();
  });
});

describe("avatarsNewlyUnlocked (the level result's note)", () => {
  // Ibex (15) and Falcon (30) are the first two star rules.
  const uid = ["p1", "p2", "p3", "p4"].find((id) => !["ibex", "falcon"].includes(defaultAvatarFor(id)))!;

  it("names a threshold reached exactly, and none a star short", () => {
    expect(avatarsNewlyUnlocked(12, 15, { userId: uid, savedAvatarId: null })).toEqual(["ibex"]);
    expect(avatarsNewlyUnlocked(11, 14, { userId: uid, savedAvatarId: null })).toEqual([]);
  });

  it("leaves out the saved avatar, which the player already has", () => {
    expect(avatarsNewlyUnlocked(0, 30, { userId: uid, savedAvatarId: "ibex" })).toEqual(["falcon"]);
  });

  it("leaves out the account's starter animal", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `starter-${i}`);
    const ibexStarter = ids.find((id) => defaultAvatarFor(id) === "ibex");
    expect(ibexStarter).toBeDefined();
    expect(avatarsNewlyUnlocked(0, 30, { userId: ibexStarter!, savedAvatarId: null })).toEqual(["falcon"]);
  });
});

describe("wording and id lists", () => {
  it("words each message from one requirement string", () => {
    expect(earnStarsText(30)).toBe("Earn 30 stars");
    expect(unlockMessage("Falcon", 30)).toBe("Earn 30 stars to unlock Falcon");
    expect(switchAwayWarning("Yak", 750)).toBe("Switching will lock Yak until you earn 750 stars.");
  });

  it("parseAvatarIdList keeps only an all-catalogue array", () => {
    expect(parseAvatarIdList(["ibex", "falcon"])).toEqual(["ibex", "falcon"]);
    expect(parseAvatarIdList([])).toEqual([]);
    expect(parseAvatarIdList(["ibex", "__proto__"])).toBeNull();
    expect(parseAvatarIdList(["ibex", 3])).toBeNull();
    expect(parseAvatarIdList("ibex")).toBeNull();
    expect(parseAvatarIdList(undefined)).toBeNull();
  });
});
