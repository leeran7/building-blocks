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
  DEFAULT_STICK_ID,
  earnStarsText,
  lockedMessage,
  parseAvatarIdList,
  requiredStars,
  starsToUnlock,
  stickColorOf,
  switchAwayWarning,
  unlockMessage,
  unlockRequirementText,
} from "../../src/lib/avatars";
import {
  avatarLockFor,
  avatarUnlockState,
  avatarsNewlyUnlocked,
  purchaseRefusal,
  type AvatarUnlockInput,
} from "../../src/lib/avatarUnlocks";

const MAX_STARS_PER_SEASON = LEVELS_PER_SEASON * 3;
const starRules = AVATARS.flatMap((a) => (a.unlock.kind === "stars" ? [{ id: a.id, stars: a.unlock.stars }] : []));
const STICK_IDS = ["stick-green", "stick-ember", "stick-amber", "stick-sky", "stick-violet", "stick-pink"];
/** Free after the tutorial: the six sticks. */
const TUTORIAL_IDS = STICK_IDS;
/** The final unlock, for clearing a season's last level: the Gecko. */
const SEASON_IDS = ["gecko"];
/** Bought with gems: the Wraith, then every character's Void skin. */
const SHOP_IDS = AVATARS.filter((a) => a.unlock.kind === "purchase").map((a) => a.id);
const SKIN_IDS = AVATARS.filter((a) => a.skinOf !== undefined).map((a) => a.id);
const fresh = (over: Partial<AvatarUnlockInput> = {}): AvatarUnlockInput => ({
  stars: 0,
  tutorialDone: false,
  savedAvatarId: null,
  ...over,
});

describe("catalogue unlock rules", () => {
  it("sells the Wraith and every Void skin, frees the six sticks after the tutorial, star-locks the ladder, and saves Gecko for the season", () => {
    expect(AVATARS.filter((a) => a.unlock.kind === "premium")).toEqual([]);
    expect(AVATARS.filter((a) => a.unlock.kind === "tutorial").map((a) => a.id)).toEqual(TUTORIAL_IDS);
    expect(AVATARS.filter((a) => a.unlock.kind === "season").map((a) => a.id)).toEqual(SEASON_IDS);
    expect(SHOP_IDS).toEqual(["wraith", ...SKIN_IDS]);
    expect(starRules).toHaveLength(AVATARS.length - SHOP_IDS.length - TUTORIAL_IDS.length - SEASON_IDS.length);
    expect(starRules.map((r) => [r.id, r.stars])).toEqual([
      ["kestrel", 15], ["lynx", 30], ["raven", 50], ["panther", 75], ["wolf", 100], ["otter", 130],
      ["heron", 165], ["yak", 200], ["mantis", 250], ["cobra", 300], ["badger", 360], ["falcon", 420],
      ["marmot", 500], ["bison", 580], ["ibex", 660], ["sentinel", 750], ["viking", 840],
    ]);
  });

  it("lists Gecko as the last character, after the whole star ladder", () => {
    const characters = AVATARS.filter((a) => a.skinOf === undefined).map((a) => a.id);
    expect(characters.at(-1)).toBe("gecko");
    expect(characters.indexOf("gecko")).toBeGreaterThan(characters.indexOf("viking"));
  });

  it("frees no avatar outright: a fresh player with no tutorial can select nothing", () => {
    expect(avatarUnlockState(fresh()).unlockedIds).toEqual([]);
  });

  it("rises strictly in catalogue order and stays within one season's stars", () => {
    expect(starRules.length).toBeGreaterThan(0);
    for (let i = 1; i < starRules.length; i++) expect(starRules[i].stars).toBeGreaterThan(starRules[i - 1].stars);
    expect(starRules[0].stars).toBeGreaterThan(0);
    expect(starRules.at(-1)!.stars).toBeLessThanOrEqual(MAX_STARS_PER_SEASON);
  });

  it("words the requirement for every kind and counts the stars still needed for a star rule only", () => {
    const lynx = avatarEntry("lynx")!;
    expect(unlockRequirementText(lynx)).toBe("Earn 30 stars");
    expect(unlockRequirementText(avatarEntry("stick-sky")!)).toBe("Finish the tutorial");
    expect(unlockRequirementText(avatarEntry("wraith")!)).toBe("Buy in the Shop");
    expect(unlockRequirementText(avatarEntry("gecko")!)).toBe("Finish the season");
    expect(starsToUnlock(lynx, 12)).toBe(18);
    expect(starsToUnlock(lynx, 29)).toBe(1);
    expect(starsToUnlock(lynx, 30)).toBe(0);
    expect(starsToUnlock(lynx, 400)).toBe(0);
    expect(starsToUnlock(avatarEntry("wraith")!, 900)).toBeNull();
    expect(starsToUnlock(avatarEntry("stick-green")!, 0)).toBeNull();
    expect(requiredStars(avatarEntry("gecko")!)).toBeNull();
    expect(requiredStars(lynx)).toBe(30);
  });

  it("words the locked sentence per kind", () => {
    expect(lockedMessage(avatarEntry("lynx")!)).toBe("Earn 30 stars to unlock Lynx");
    expect(lockedMessage(avatarEntry("stick-pink")!)).toBe("Finish the tutorial on level 1 to unlock Pink Stick");
    expect(lockedMessage(avatarEntry("gecko")!)).toBe("Clear all 300 levels of the season to unlock Gecko");
    expect(lockedMessage(avatarEntry("wraith")!)).toBe("Buy Wraith in the Shop for 2,000 gems");
    expect(lockedMessage(avatarEntry("lynx-void")!)).toBe("Buy Void Lynx in the Shop for 1,200 gems");
  });

  it("gives a stick colour to the stick figures only", () => {
    expect(DEFAULT_STICK_ID).toBe("stick-green");
    expect(stickColorOf("stick-green")).toBe("#cbf24d");
    let checked = 0;
    for (const id of STICK_IDS) {
      expect(stickColorOf(id)).toMatch(/^#[0-9a-f]{6}$/);
      checked++;
    }
    expect(checked).toBe(6);
    for (const bad of ["wraith", "lynx", "stick-", "stick-red", "__proto__", null, 7]) expect(stickColorOf(bad)).toBeNull();
  });

  it("avatarEntry allow-lists like parseAvatarId", () => {
    for (const bad of ["__proto__", "constructor", "toString", "Falcon", "", 42, null]) expect(avatarEntry(bad)).toBeNull();
    expect(avatarEntry("falcon")?.name).toBe("Falcon");
  });
});

describe("avatarsUnlockedBetween", () => {
  it("includes a threshold reached exactly and excludes one a star short", () => {
    expect(avatarsUnlockedBetween(12, 15)).toEqual(["kestrel"]);
    expect(avatarsUnlockedBetween(11, 14)).toEqual([]);
  });

  it("excludes a threshold already met before, and lists several crossed at once in order", () => {
    expect(avatarsUnlockedBetween(15, 18)).toEqual([]);
    expect(avatarsUnlockedBetween(0, 50)).toEqual(["kestrel", "lynx", "raven"]);
  });

  it("never lists a Shop or tutorial avatar", () => {
    expect(avatarsUnlockedBetween(-1, 100_000)).toEqual(starRules.map((r) => r.id));
  });
});

describe("avatarLockFor / avatarUnlockState", () => {
  const target = avatarEntry("lynx")!;
  const need = 30;

  it("locks one star short and unlocks at the threshold", () => {
    expect(avatarLockFor(target, fresh({ stars: need - 1 }))).toEqual({
      avatarId: "lynx",
      name: "Lynx",
      kind: "stars",
      requiredStars: need,
      stars: need - 1,
      message: "Earn 30 stars to unlock Lynx",
    });
    expect(avatarLockFor(target, fresh({ stars: need }))).toBeNull();
  });

  it("locks every Shop entry at any star count until it is owned, whatever the stars or tutorial", () => {
    let checked = 0;
    for (const id of SHOP_IDS) {
      const entry = avatarEntry(id)!;
      for (const input of [fresh(), fresh({ stars: 100_000, tutorialDone: true })]) {
        expect(avatarLockFor(entry, input)).toEqual({
          avatarId: id,
          name: entry.name,
          kind: "purchase",
          requiredStars: null,
          stars: input.stars,
          message: lockedMessage(entry),
        });
        expect(avatarLockFor(entry, { ...input, ownedIds: [id] })).toBeNull();
        checked++;
      }
    }
    expect(checked).toBe(SHOP_IDS.length * 2);
    expect(avatarUnlockState(fresh({ stars: 100_000, tutorialDone: true })).unlockedIds).not.toContain("wraith");
  });

  it("unlocks exactly what the player owns, and reports it", () => {
    const state = avatarUnlockState(fresh({ ownedIds: ["gecko-void", "wraith", "__proto__"] }));
    expect(state.unlockedIds).toEqual(["wraith", "gecko-void"]);
    expect(state.ownedIds).toEqual(["wraith", "gecko-void"]);
  });

  it("keeps a saved Shop character selectable (grandfathered) but no other Shop one", () => {
    const input = fresh({ savedAvatarId: "wraith" });
    expect(avatarLockFor(avatarEntry("wraith")!, input)).toBeNull();
    expect(avatarLockFor(avatarEntry("wraith-void")!, input)?.kind).toBe("purchase");
    const state = avatarUnlockState(input);
    expect(state.unlockedIds).toEqual(["wraith"]);
    expect(state.grandfatheredId).toBe("wraith");
  });

  it("locks every stick figure until the tutorial is done, then unlocks all six at 0 stars", () => {
    let checked = 0;
    for (const id of TUTORIAL_IDS) {
      const entry = avatarEntry(id)!;
      expect(avatarLockFor(entry, fresh({ stars: 900 }))).toEqual({
        avatarId: id,
        name: entry.name,
        kind: "tutorial",
        requiredStars: null,
        stars: 900,
        message: `Finish the tutorial on level 1 to unlock ${entry.name}`,
      });
      expect(avatarLockFor(entry, fresh({ tutorialDone: true }))).toBeNull();
      checked++;
    }
    expect(checked).toBe(6);
    expect(avatarUnlockState(fresh({ tutorialDone: true })).unlockedIds).toEqual(TUTORIAL_IDS);
  });

  it("locks Gecko at any star count after the tutorial until a season is finished, then unlocks it", () => {
    const gecko = avatarEntry("gecko")!;
    for (const input of [fresh(), fresh({ stars: MAX_STARS_PER_SEASON, tutorialDone: true })]) {
      expect(avatarLockFor(gecko, input)).toEqual({
        avatarId: "gecko",
        name: "Gecko",
        kind: "season",
        requiredStars: null,
        stars: input.stars,
        message: "Clear all 300 levels of the season to unlock Gecko",
      });
    }
    expect(avatarLockFor(gecko, fresh({ seasonDone: true }))).toBeNull();
    expect(avatarUnlockState(fresh({ tutorialDone: true, seasonDone: true })).unlockedIds).toEqual([
      ...TUTORIAL_IDS,
      "gecko",
    ]);
  });

  it("keeps a saved Gecko selectable (grandfathered) before the season is finished", () => {
    const input = fresh({ tutorialDone: true, savedAvatarId: "gecko" });
    expect(avatarLockFor(avatarEntry("gecko")!, input)).toBeNull();
    expect(avatarUnlockState(input).grandfatheredId).toBe("gecko");
    expect(avatarUnlockState({ ...input, seasonDone: true }).grandfatheredId).toBeNull();
  });

  it("grandfathers the saved avatar but no other locked one", () => {
    const input = fresh({ savedAvatarId: "lynx" });
    expect(avatarLockFor(target, input)).toBeNull();
    expect(avatarLockFor(avatarEntry("raven")!, input)).not.toBeNull();
  });

  it("ignores a saved id outside the catalogue", () => {
    expect(avatarUnlockState(fresh({ savedAvatarId: "__proto__" })).unlockedIds).toEqual([]);
    expect(avatarUnlockState(fresh({ savedAvatarId: "__proto__", tutorialDone: true })).unlockedIds).toEqual(
      TUTORIAL_IDS
    );
  });

  it("lists every avatar not sold in the Shop once the season is finished, in catalogue order", () => {
    const state = avatarUnlockState(fresh({ stars: MAX_STARS_PER_SEASON, tutorialDone: true, seasonDone: true }));
    expect(state).toEqual({
      stars: MAX_STARS_PER_SEASON,
      tutorialDone: true,
      seasonDone: true,
      unlockedIds: AVATARS.filter((a) => a.unlock.kind !== "purchase").map((a) => a.id),
      ownedIds: [],
      grandfatheredId: null,
    });
  });

  it("leaves only Gecko locked at a full season of stars when the last level is not cleared", () => {
    const state = avatarUnlockState(fresh({ stars: MAX_STARS_PER_SEASON, tutorialDone: true }));
    expect(state.seasonDone).toBe(false);
    expect(state.unlockedIds).toEqual(
      AVATARS.filter((a) => a.unlock.kind !== "purchase" && a.unlock.kind !== "season").map((a) => a.id)
    );
  });

  it("marks the saved avatar grandfathered only while its rule is unmet", () => {
    expect(avatarUnlockState(fresh({ stars: need - 1, savedAvatarId: "lynx" })).grandfatheredId).toBe("lynx");
    expect(avatarUnlockState(fresh({ stars: need, savedAvatarId: "lynx" })).grandfatheredId).toBeNull();
    expect(avatarUnlockState(fresh({ savedAvatarId: "stick-sky" })).grandfatheredId).toBe("stick-sky");
    expect(avatarUnlockState(fresh({ savedAvatarId: "stick-sky", tutorialDone: true })).grandfatheredId).toBeNull();
    expect(avatarUnlockState(fresh({ stars: 900, tutorialDone: true, savedAvatarId: "wraith" })).grandfatheredId).toBe(
      "wraith"
    );
    expect(
      avatarUnlockState(fresh({ savedAvatarId: "wraith", ownedIds: ["wraith"] })).grandfatheredId
    ).toBeNull();
    expect(avatarUnlockState(fresh({ savedAvatarId: "__proto__" })).grandfatheredId).toBeNull();
  });
});

describe("avatarsNewlyUnlocked (the level result's note)", () => {
  const none = { savedAvatarId: null, tutorialJustDone: false };

  it("names a threshold reached exactly, and none a star short", () => {
    expect(avatarsNewlyUnlocked(12, 15, none)).toEqual(["kestrel"]);
    expect(avatarsNewlyUnlocked(11, 14, none)).toEqual([]);
  });

  it("leaves out the saved avatar, which the player already has", () => {
    expect(avatarsNewlyUnlocked(0, 30, { ...none, savedAvatarId: "kestrel" })).toEqual(["lynx"]);
  });

  it("adds the six stick figures, first, when the run finished the tutorial", () => {
    expect(avatarsNewlyUnlocked(0, 3, { savedAvatarId: null, tutorialJustDone: true })).toEqual(TUTORIAL_IDS);
    expect(avatarsNewlyUnlocked(0, 3, none)).toEqual([]);
    expect(avatarsNewlyUnlocked(12, 15, { savedAvatarId: null, tutorialJustDone: true })).toEqual([
      ...TUTORIAL_IDS,
      "kestrel",
    ]);
  });

  it("adds Gecko, last, when the run finished the season, and not otherwise", () => {
    expect(avatarsNewlyUnlocked(837, 840, { ...none, seasonJustDone: true })).toEqual(["viking", "gecko"]);
    expect(avatarsNewlyUnlocked(837, 840, none)).toEqual(["viking"]);
    expect(avatarsNewlyUnlocked(0, 3, { ...none, savedAvatarId: "gecko", seasonJustDone: true })).toEqual([]);
  });

  it("leaves a saved stick figure out of the tutorial unlock", () => {
    expect(avatarsNewlyUnlocked(0, 3, { savedAvatarId: "stick-sky", tutorialJustDone: true })).toEqual(
      TUTORIAL_IDS.filter((id) => id !== "stick-sky")
    );
  });

  it("never names a Shop character or skin", () => {
    const all = avatarsNewlyUnlocked(-1, 100_000, { savedAvatarId: null, tutorialJustDone: true });
    expect(all.length).toBeGreaterThan(0);
    expect(SHOP_IDS.length).toBeGreaterThan(0);
    for (const id of SHOP_IDS) expect(all).not.toContain(id);
  });
});

describe("wording and id lists", () => {
  it("words each message from one requirement string", () => {
    expect(earnStarsText(30)).toBe("Earn 30 stars");
    expect(unlockMessage("Falcon", 30)).toBe("Earn 30 stars to unlock Falcon");
  });

  it("warns before leaving a grandfathered avatar, per kind", () => {
    expect(switchAwayWarning(avatarEntry("sentinel")!)).toBe("Switching will lock Sentinel until you earn 750 stars.");
    expect(switchAwayWarning(avatarEntry("stick-amber")!)).toBe(
      "Switching will lock Amber Stick until you finish the tutorial."
    );
    expect(switchAwayWarning(avatarEntry("wraith")!)).toBe("Switching will lock Wraith until you buy it in the Shop.");
    expect(switchAwayWarning(avatarEntry("gecko")!)).toBe(
      "Switching will lock Gecko until you clear all 300 levels of the season."
    );
  });

  it("parseAvatarIdList keeps only an all-catalogue array", () => {
    expect(parseAvatarIdList(["ibex", "falcon", "stick-green"])).toEqual(["ibex", "falcon", "stick-green"]);
    expect(parseAvatarIdList([])).toEqual([]);
    expect(parseAvatarIdList(["ibex", "__proto__"])).toBeNull();
    expect(parseAvatarIdList(["ibex", 3])).toBeNull();
    expect(parseAvatarIdList("ibex")).toBeNull();
    expect(parseAvatarIdList(undefined)).toBeNull();
  });
});

describe("purchaseRefusal (what the Shop may sell)", () => {
  it("sells an unowned Shop character, and never a star, tutorial, season or unknown rule", () => {
    expect(purchaseRefusal(avatarEntry("wraith")!, fresh())).toBeNull();
    expect(purchaseRefusal(avatarEntry("lynx")!, fresh())).toBe("NOT_FOR_SALE");
    expect(purchaseRefusal(avatarEntry("gecko")!, fresh())).toBe("NOT_FOR_SALE");
  });

  it("refuses what the player already owns", () => {
    expect(purchaseRefusal(avatarEntry("wraith")!, fresh({ ownedIds: ["wraith"] }))).toBe("OWNED");
  });

  it("sells a skin only once its character is selectable: earned, owned or saved", () => {
    const lynxVoid = avatarEntry("lynx-void")!;
    expect(purchaseRefusal(lynxVoid, fresh({ stars: 29 }))).toBe("CHARACTER_REQUIRED");
    expect(purchaseRefusal(lynxVoid, fresh({ stars: 30 }))).toBeNull();
    expect(purchaseRefusal(lynxVoid, fresh({ savedAvatarId: "lynx" }))).toBeNull();
    const walker = avatarEntry("wraith-void")!;
    expect(purchaseRefusal(walker, fresh({ stars: 900, tutorialDone: true }))).toBe("CHARACTER_REQUIRED");
    expect(purchaseRefusal(walker, fresh({ ownedIds: ["wraith"] }))).toBeNull();
    expect(purchaseRefusal(avatarEntry("gecko-void")!, fresh())).toBe("CHARACTER_REQUIRED");
    expect(purchaseRefusal(avatarEntry("gecko-void")!, fresh({ stars: 900, tutorialDone: true }))).toBe(
      "CHARACTER_REQUIRED"
    );
    expect(purchaseRefusal(avatarEntry("gecko-void")!, fresh({ seasonDone: true }))).toBeNull();
    expect(purchaseRefusal(avatarEntry("gecko-void")!, fresh({ savedAvatarId: "gecko" }))).toBeNull();
  });
});
