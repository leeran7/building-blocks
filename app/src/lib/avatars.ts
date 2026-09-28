/**
 * Profile avatar catalogue — the single source of truth for which avatar ids
 * a player may save, and what each one takes to unlock. Shared by the settings
 * API (validation), the leaderboard reads, and the mobile picker. Image files
 * live in mobile/src/assets/avatars/<id>.webp.
 *
 * Removing an entry is safe: every read goes through parseAvatarId, so a
 * stored retired id renders the initials fallback instead of a broken image.
 *
 * Unlock rules are data only and independent of any sprite, so per-character
 * art can key off the same id later. Who may select what is decided in
 * src/lib/avatarUnlocks.ts; the server counts stars in src/db/avatarUnlocks.ts.
 * Level stars are self-reported by the device (context/trust.md), so an
 * unlock is cosmetic and must never gate money or ranking.
 */

/** What a player needs before they may newly select an avatar. */
export type AvatarUnlock =
  | { readonly kind: "free" }
  /** Best stars summed over every level of every season, at least `stars`. */
  | { readonly kind: "stars"; readonly stars: number };

export interface AvatarEntry {
  readonly id: string;
  readonly name: string;
  readonly unlock: AvatarUnlock;
}

const FREE: AvatarUnlock = { kind: "free" };
const stars = (n: number): AvatarUnlock => ({ kind: "stars", stars: n });

/**
 * The three non-animal starters are free; the 16 animals unlock at rising
 * star totals. A season is 300 levels of up to 3 stars (900), so the last
 * animal (750) asks for a full season at 2.5 stars a level.
 */
export const AVATARS: readonly AvatarEntry[] = [
  { id: "wraith", name: "Wraith", unlock: FREE },
  { id: "viking", name: "Viking", unlock: FREE },
  { id: "sentinel", name: "Sentinel", unlock: FREE },
  { id: "ibex", name: "Ibex", unlock: stars(15) },
  { id: "falcon", name: "Falcon", unlock: stars(30) },
  { id: "marmot", name: "Marmot", unlock: stars(50) },
  { id: "gecko", name: "Gecko", unlock: stars(75) },
  { id: "panther", name: "Panther", unlock: stars(100) },
  { id: "otter", name: "Otter", unlock: stars(130) },
  { id: "raven", name: "Raven", unlock: stars(165) },
  { id: "lynx", name: "Lynx", unlock: stars(200) },
  { id: "bison", name: "Bison", unlock: stars(250) },
  { id: "heron", name: "Heron", unlock: stars(300) },
  { id: "cobra", name: "Cobra", unlock: stars(360) },
  { id: "badger", name: "Badger", unlock: stars(420) },
  { id: "wolf", name: "Wolf", unlock: stars(500) },
  { id: "kestrel", name: "Kestrel", unlock: stars(580) },
  { id: "mantis", name: "Mantis", unlock: stars(660) },
  { id: "yak", name: "Yak", unlock: stars(750) },
];

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

/**
 * A list of catalogue ids, or null unless `v` is an array whose every
 * element is one. Never drops or substitutes an element.
 */
export function parseAvatarIdList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.map(parseAvatarId);
  return ids.every((id): id is string => id !== null) ? ids : null;
}

/** The star total an entry needs, or null for a free avatar. */
export function requiredStars(entry: AvatarEntry): number | null {
  return entry.unlock.kind === "free" ? null : entry.unlock.stars;
}

/** Stars still needed for `entry` at `earned` stars; 0 once its rule is met. */
export function starsToUnlock(entry: AvatarEntry, earned: number): number {
  const need = requiredStars(entry);
  return need === null ? 0 : Math.max(0, need - earned);
}

/** "Earn 30 stars": the one place the requirement is worded. */
export function earnStarsText(stars: number): string {
  return `Earn ${stars} stars`;
}

/** "Earn 30 stars" for a star rule; null for a free avatar. */
export function unlockRequirementText(entry: AvatarEntry): string | null {
  const need = requiredStars(entry);
  return need === null ? null : earnStarsText(need);
}

/** "Earn 30 stars to unlock Falcon". */
export function unlockMessage(name: string, stars: number): string {
  return `${earnStarsText(stars)} to unlock ${name}`;
}

/** "Switching will lock Yak until you earn 750 stars." (leaving a grandfathered avatar) */
export function switchAwayWarning(name: string, stars: number): string {
  return `Switching will lock ${name} until you earn ${stars} stars.`;
}

/**
 * Ids whose star rule was not met at `before` stars and is met at `after`, in
 * catalogue order. Free avatars are never "newly" unlocked.
 */
export function avatarsUnlockedBetween(before: number, after: number): string[] {
  return AVATARS.filter((a) => a.unlock.kind === "stars" && a.unlock.stars > before && a.unlock.stars <= after).map(
    (a) => a.id
  );
}
