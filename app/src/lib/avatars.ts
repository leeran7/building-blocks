/**
 * Profile avatar catalogue — the single source of truth for which avatar ids
 * a player may save. Shared by the settings API (validation), the leaderboard
 * reads, and the mobile picker. Image files live in
 * mobile/src/assets/avatars/<id>.webp.
 *
 * Removing an entry is safe: every read goes through parseAvatarId, so a
 * stored retired id renders the initials fallback instead of a broken image.
 */

export interface AvatarEntry {
  readonly id: string;
  readonly name: string;
  /** Reserved for a future unlock rule; every avatar is free today. */
  readonly unlock?: never;
}

export const AVATARS: readonly AvatarEntry[] = [
  { id: "ibex", name: "Ibex" },
  { id: "falcon", name: "Falcon" },
  { id: "marmot", name: "Marmot" },
  { id: "gecko", name: "Gecko" },
  { id: "panther", name: "Panther" },
  { id: "otter", name: "Otter" },
  { id: "raven", name: "Raven" },
  { id: "lynx", name: "Lynx" },
  { id: "heron", name: "Heron" },
  { id: "cobra", name: "Cobra" },
  { id: "badger", name: "Badger" },
  { id: "wolf", name: "Wolf" },
  { id: "kestrel", name: "Kestrel" },
  { id: "mantis", name: "Mantis" },
  { id: "bison", name: "Bison" },
  { id: "wraith", name: "Wraith" },
  { id: "viking", name: "Viking" },
  { id: "sentinel", name: "Sentinel" },
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
