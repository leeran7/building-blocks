/**
 * Profile avatar catalogue — the single source of truth for which avatar ids
 * a player may save, and what each one takes to unlock. Shared by the settings
 * API (validation), the leaderboard reads, and the mobile picker. Image files
 * live in mobile/src/assets/avatars/<id>.webp.
 *
 * Removing an entry is safe: every read goes through parseAvatarId, so a
 * stored retired id renders the initials fallback instead of a broken image.
 * Stick figures have no image file: their badge is drawn from stickColor.
 *
 * Unlock rules are data only and independent of any sprite. The in-game
 * climber art keys off the same id (src/components/Game/climberCharacters.ts,
 * contract in public/climb/README.md). Who may select what is decided in
 * src/lib/avatarUnlocks.ts; the server counts stars in src/db/avatarUnlocks.ts.
 * Level stars are self-reported by the device (context/trust.md), so an
 * unlock is cosmetic and must never gate money or ranking.
 *
 * Paid characters and skins (`purchase` rule) are bought with gems in the
 * Shop and owned per account (owned_characters, src/db/gems.ts). A skin is
 * its own catalogue id (`<character>-void`) with `skinOf` naming the
 * character it dresses; it plays exactly like every other climber
 * (context/trust.md item 9). The picker lists characters only; skins are
 * bought and equipped from the Shop.
 */

import { LEVELS_PER_SEASON } from "../levels/rules";

/** What a player needs before they may newly select an avatar. */
export type AvatarUnlock =
  /** Selectable after the tutorial: the player has cleared level 1 (any season). */
  | { readonly kind: "tutorial" }
  /** Best stars summed over every level of every season, at least `stars`. */
  | { readonly kind: "stars"; readonly stars: number }
  /** The final unlock: the player has cleared a season's last level (level 300, any season). */
  | { readonly kind: "season" }
  /** Sold later; nobody can newly select one yet. Never earned by stars. */
  | { readonly kind: "premium" }
  /** Bought in the Shop for `gems`; selectable once owned (a server purchase record). */
  | { readonly kind: "purchase"; readonly gems: number };

export interface AvatarEntry {
  readonly id: string;
  readonly name: string;
  readonly unlock: AvatarUnlock;
  /** Stick figures only: the "#rrggbb" the vector climber is drawn in. */
  readonly stickColor?: string;
  /** Skins only: the character id this skin dresses. Buying it needs that character. */
  readonly skinOf?: string;
}

const TUTORIAL: AvatarUnlock = { kind: "tutorial" };
const SEASON: AvatarUnlock = { kind: "season" };
const purchase = (gems: number): AvatarUnlock => ({ kind: "purchase", gems });
const stars = (n: number): AvatarUnlock => ({ kind: "stars", stars: n });
const stick = (key: string, name: string, color: string): AvatarEntry => ({
  id: `stick-${key}`,
  name: `${name} Stick`,
  unlock: TUTORIAL,
  stickColor: color,
});

/** The stick figure every player without a character climbs as. */
export const DEFAULT_STICK_ID = "stick-green";

/** Gems for the Wraith, the one character sold outright. */
export const WRAITH_GEMS = 2000;
/** Gems for any character's Void skin (the Wraith-style paid version). */
export const SKIN_GEMS = 1200;

/** The id suffix and name of the paid Wraith-style skin every character gets. */
export const VOID_SKIN_SUFFIX = "-void";

/**
 * Picker order: the paid Wraith, the stick figures (free once the tutorial
 * is done), the star ladder cheapest first, and last the Gecko, the final
 * unlock for finishing a season. No character is free outright; a player
 * with no avatar climbs as the Green Stick. A season is 300 levels of up to
 * 3 stars (900), so the last star step (840) asks for most of a season at
 * close to 3 stars a level. The Void skins follow, one per character with
 * art, in the same order.
 */
const CHARACTERS: readonly AvatarEntry[] = [
  { id: "wraith", name: "Wraith", unlock: purchase(WRAITH_GEMS) },
  stick("green", "Green", "#cbf24d"),
  stick("ember", "Ember", "#ff5a2c"),
  stick("amber", "Amber", "#ffb020"),
  stick("sky", "Sky", "#4dd6f2"),
  stick("violet", "Violet", "#b07cd6"),
  stick("pink", "Pink", "#ff6b9d"),
  { id: "kestrel", name: "Kestrel", unlock: stars(15) },
  { id: "lynx", name: "Lynx", unlock: stars(30) },
  { id: "raven", name: "Raven", unlock: stars(50) },
  { id: "panther", name: "Panther", unlock: stars(75) },
  { id: "wolf", name: "Wolf", unlock: stars(100) },
  { id: "otter", name: "Otter", unlock: stars(130) },
  { id: "heron", name: "Heron", unlock: stars(165) },
  { id: "yak", name: "Yak", unlock: stars(200) },
  { id: "mantis", name: "Mantis", unlock: stars(250) },
  { id: "cobra", name: "Cobra", unlock: stars(300) },
  { id: "badger", name: "Badger", unlock: stars(360) },
  { id: "falcon", name: "Falcon", unlock: stars(420) },
  { id: "marmot", name: "Marmot", unlock: stars(500) },
  { id: "bison", name: "Bison", unlock: stars(580) },
  { id: "ibex", name: "Ibex", unlock: stars(660) },
  { id: "sentinel", name: "Sentinel", unlock: stars(750) },
  { id: "viking", name: "Viking", unlock: stars(840) },
  { id: "gecko", name: "Gecko", unlock: SEASON },
];

/** The Void skin's display name: the Wraith's is "Void Walker", every other "Void <Name>". */
function voidSkinName(character: AvatarEntry): string {
  return character.id === "wraith" ? "Void Walker" : `Void ${character.name}`;
}

/**
 * The paid Wraith-style version of every character with art (stick figures
 * have none). Priced alike; owning one needs its character selectable first.
 */
const SKINS: readonly AvatarEntry[] = CHARACTERS.filter((c) => c.stickColor === undefined).map((c) => ({
  id: `${c.id}${VOID_SKIN_SUFFIX}`,
  name: voidSkinName(c),
  unlock: purchase(SKIN_GEMS),
  skinOf: c.id,
}));

export const AVATARS: readonly AvatarEntry[] = [...CHARACTERS, ...SKINS];

const BY_ID: Readonly<Record<string, AvatarEntry>> = Object.fromEntries(AVATARS.map((a) => [a.id, a]));

// Own-property check, never `in` (which accepts "__proto__", "toString"...).
// Same semantics as Object.hasOwn, which this file cannot use: the mobile SPA
// compiles it with lib ES2020 (hasOwn is ES2022, a TS2550 there) and ships to
// iOS WebViews that can predate Safari 15.4, where hasOwn would throw.
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The catalogue id if `v` is exactly one, else null. Never substitutes a default. */
export function parseAvatarId(v: unknown): string | null {
  return typeof v === "string" && hasOwn(BY_ID, v) ? v : null;
}

/** Display name for a catalogue id; null for anything not in the catalogue. */
export function avatarName(id: string | null): string | null {
  const valid = parseAvatarId(id);
  return valid === null ? null : BY_ID[valid].name;
}

/** The catalogue entry for `id`, or null for anything not in the catalogue. */
export function avatarEntry(id: unknown): AvatarEntry | null {
  const valid = parseAvatarId(id);
  return valid === null ? null : BY_ID[valid];
}

/** Every character (not skin) in picker order. */
export const CHARACTER_ENTRIES: readonly AvatarEntry[] = CHARACTERS;

/** The skins that dress `characterId`, in catalogue order (empty for a stick or unknown id). */
export function skinsOf(characterId: string): AvatarEntry[] {
  return SKINS.filter((s) => s.skinOf === characterId);
}

/** The character an id draws as: a skin's `skinOf`, else the id itself; null outside the catalogue. */
export function characterIdOf(id: unknown): string | null {
  const entry = avatarEntry(id);
  return entry === null ? null : (entry.skinOf ?? entry.id);
}

/** Gems a purchase rule costs, or null for any other rule. */
export function gemPrice(entry: AvatarEntry): number | null {
  return entry.unlock.kind === "purchase" ? entry.unlock.gems : null;
}

/** "1,200" — gem amounts, grouped with commas like the Shop design. */
export function formatGems(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * A list of catalogue ids, or null unless `v` is an array whose every
 * element is one. Never drops or substitutes an element.
 */
export function parseAvatarIdList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.map(parseAvatarId);
  return ids.every((id): id is string => id !== null) ? ids : null;
}

/**
 * Player id → parsed avatar id, for drawing each climber as their avatar
 * (unknown or missing ids become null, which draws the Green Stick). Absent players
 * and empty ids are skipped. Built with Object.fromEntries so a player id of
 * "__proto__" stays an own key instead of setting the prototype.
 */
export function avatarIdsByPlayer(
  players: readonly ({ readonly id: string; readonly avatarId?: unknown } | null | undefined)[]
): Record<string, string | null> {
  return Object.fromEntries(
    players.flatMap((p) => (p && p.id ? [[p.id, parseAvatarId(p.avatarId)] as const] : []))
  );
}

/** The star total an entry needs, or null when its rule is not a star count. */
export function requiredStars(entry: AvatarEntry): number | null {
  return entry.unlock.kind === "stars" ? entry.unlock.stars : null;
}

/** Stars still needed for a star rule at `earned` stars; 0 once met, null for any other rule. */
export function starsToUnlock(entry: AvatarEntry, earned: number): number | null {
  const need = requiredStars(entry);
  return need === null ? null : Math.max(0, need - earned);
}

/** The stick figure colour for a catalogue id, or null for anything else. */
export function stickColorOf(id: unknown): string | null {
  return avatarEntry(id)?.stickColor ?? null;
}

/** "Earn 30 stars": the one place the requirement is worded. */
export function earnStarsText(stars: number): string {
  return `Earn ${stars} stars`;
}

export const TUTORIAL_REQUIREMENT = "Finish the tutorial";
export const PREMIUM_REQUIREMENT = "Premium";
export const SHOP_REQUIREMENT = "Buy in the Shop";
export const SEASON_REQUIREMENT = "Finish the season";

/** What an entry asks for, for a lock label: "Earn 30 stars", "Finish the tutorial", "Buy in the Shop". */
export function unlockRequirementText(entry: AvatarEntry): string {
  switch (entry.unlock.kind) {
    case "stars":
      return earnStarsText(entry.unlock.stars);
    case "tutorial":
      return TUTORIAL_REQUIREMENT;
    case "season":
      return SEASON_REQUIREMENT;
    case "premium":
      return PREMIUM_REQUIREMENT;
    case "purchase":
      return SHOP_REQUIREMENT;
  }
}

/** The full sentence for a locked entry: "Earn 30 stars to unlock Falcon". */
export function lockedMessage(entry: AvatarEntry): string {
  switch (entry.unlock.kind) {
    case "stars":
      return unlockMessage(entry.name, entry.unlock.stars);
    case "tutorial":
      return `Finish the tutorial on level 1 to unlock ${entry.name}`;
    case "season":
      return `Clear all ${LEVELS_PER_SEASON} levels of the season to unlock ${entry.name}`;
    case "premium":
      return `${entry.name} is a premium character. It is not on sale yet`;
    case "purchase":
      return `Buy ${entry.name} in the Shop for ${formatGems(entry.unlock.gems)} gems`;
  }
}

/** "Earn 30 stars to unlock Falcon". */
export function unlockMessage(name: string, stars: number): string {
  return `${earnStarsText(stars)} to unlock ${name}`;
}

/** The warning before leaving a grandfathered avatar, which locks it again. */
export function switchAwayWarning(entry: AvatarEntry): string {
  switch (entry.unlock.kind) {
    case "stars":
      return `Switching will lock ${entry.name} until you earn ${entry.unlock.stars} stars.`;
    case "tutorial":
      return `Switching will lock ${entry.name} until you finish the tutorial.`;
    case "season":
      return `Switching will lock ${entry.name} until you clear all ${LEVELS_PER_SEASON} levels of the season.`;
    case "premium":
      return `Switching will lock ${entry.name}. It is a premium character and you can't pick it again yet.`;
    case "purchase":
      return `Switching will lock ${entry.name} until you buy it in the Shop.`;
  }
}

/**
 * Ids whose star rule was not met at `before` stars and is met at `after`, in
 * catalogue order. Only star rules are ever unlocked by stars.
 */
export function avatarsUnlockedBetween(before: number, after: number): string[] {
  return AVATARS.filter((a) => a.unlock.kind === "stars" && a.unlock.stars > before && a.unlock.stars <= after).map(
    (a) => a.id
  );
}
