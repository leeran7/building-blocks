/**
 * Skin Details' action button (skinAction in the mobile SkinDetailsScreen):
 * what the player can do with the selected look, from the server's unlock
 * list, owned ids and gem balance.
 */

import { describe, expect, it } from "vitest";
import { avatarEntry } from "@app/lib/avatars";
import { skinAction } from "../../mobile/src/screens/SkinDetailsScreen";

const LYNX = avatarEntry("lynx")!;
const LYNX_VOID = avatarEntry("lynx-void")!;
const WRAITH = avatarEntry("wraith")!;
const base = { savedAvatarId: null, unlockedIds: [] as string[], ownedIds: [] as string[], gems: 0 };

describe("skinAction", () => {
  it("reads Equipped for the saved look, even before the Shop loads", () => {
    expect(skinAction(LYNX_VOID, { ...base, savedAvatarId: "lynx-void", ownedIds: null, gems: null })).toEqual({
      kind: "equipped",
    });
  });

  it("waits for both the Shop and settings before offering anything else", () => {
    expect(skinAction(LYNX_VOID, { ...base, ownedIds: null })).toEqual({ kind: "loading" });
    expect(skinAction(LYNX_VOID, { ...base, unlockedIds: null })).toEqual({ kind: "loading" });
  });

  it("offers Equip for anything unlocked or owned", () => {
    expect(skinAction(LYNX, { ...base, unlockedIds: ["lynx"] })).toEqual({ kind: "equip" });
    expect(skinAction(LYNX_VOID, { ...base, ownedIds: ["lynx-void"] })).toEqual({ kind: "equip" });
  });

  it("asks for the character before selling its skin", () => {
    expect(skinAction(LYNX_VOID, { ...base, gems: 5000 })).toEqual({ kind: "character-required", character: LYNX });
  });

  it("sells with the balance after purchase, or asks for more gems", () => {
    expect(skinAction(LYNX_VOID, { ...base, unlockedIds: ["lynx"], gems: 1500 })).toEqual({
      kind: "buy",
      price: 1200,
      balanceAfter: 300,
    });
    expect(skinAction(LYNX_VOID, { ...base, unlockedIds: ["lynx"], gems: 1000 })).toEqual({
      kind: "need-gems",
      price: 1200,
      short: 200,
    });
    expect(skinAction(WRAITH, { ...base, gems: 2000 })).toEqual({ kind: "buy", price: 2000, balanceAfter: 0 });
  });

  it("explains a classic look locked by stars, which is never sold", () => {
    expect(skinAction(LYNX, { ...base, gems: 100000 })).toEqual({
      kind: "locked",
      message: "Earn 30 stars to unlock Lynx.",
    });
  });
});
