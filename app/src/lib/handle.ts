/**
 * Deterministic, privacy-safe display handles for climbers.
 *
 * The public skill leaderboard must not leak a player's email. Since the User
 * row only stores an email + Firebase UID, we derive a stable pseudonym from the
 * UID: the same user always shows the same handle, but it reveals nothing about
 * their identity. Pure + deterministic so it is trivially testable.
 *
 * The animal can follow the player's avatar: a player without a display name
 * who picks the Wolf avatar is "Golden Wolf 31", not "Golden Heron 31". The
 * adjective and number always come from the hash, so the handle stays stable
 * and recognisable across avatar changes.
 */

import { parseAvatarId } from "./avatars";

const ADJECTIVES = [
  "Swift", "Bold", "Silent", "Crimson", "Golden", "Nimble", "Fearless", "Lucky",
  "Iron", "Cosmic", "Rapid", "Shadow", "Blazing", "Frost", "Vivid", "Steady",
];

/** Every entry, lowercased, is an avatar id in the catalogue (src/lib/avatars.ts). */
export const ANIMALS = [
  "Ibex", "Falcon", "Marmot", "Gecko", "Panther", "Otter", "Raven", "Lynx",
  "Bison", "Heron", "Cobra", "Badger", "Wolf", "Kestrel", "Mantis", "Yak",
] as const;

// Avatar id -> animal word. A Map, not an object literal, so a key such as
// "__proto__" or "toString" can never resolve to an inherited value.
const ANIMAL_BY_AVATAR: ReadonlyMap<string, string> = new Map(ANIMALS.map((a) => [a.toLowerCase(), a]));

/** Simple, portable 32-bit string hash (deterministic across server + client). */
export function hashId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashAnimal(h: number): string {
  return ANIMALS[(h >>> 8) % ANIMALS.length];
}

/**
 * The animal word for an avatar id, or null when the avatar is not one of the
 * animals (wraith / viking / sentinel), is absent, or is not a catalogue id.
 * The input is untrusted (DB column, API response), so it goes through the
 * catalogue's allow-list parser first.
 */
function avatarAnimal(avatarId: string | null | undefined): string | null {
  const id = parseAvatarId(avatarId);
  return id === null ? null : ANIMAL_BY_AVATAR.get(id) ?? null;
}

/**
 * A stable pseudonym like "Swift Ibex 42" for a user id. When `avatarId` is an
 * animal avatar, that animal replaces the hash-derived one; any other value
 * leaves the pseudonym exactly as the id alone would produce it.
 */
export function climberHandle(id: string, avatarId?: string | null): string {
  const h = hashId(id);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const animal = avatarAnimal(avatarId) ?? hashAnimal(h);
  const num = (h >>> 16) % 100;
  return `${adj} ${animal} ${num}`;
}

/**
 * The avatar a new account starts with: the animal in its hash-derived
 * pseudonym, as a catalogue id. Saving it changes nothing about the name.
 */
export function defaultAvatarFor(id: string): string {
  return hashAnimal(hashId(id)).toLowerCase();
}

/**
 * The name to show for a climber. If they've set a profile display name we use
 * it; otherwise we fall back to the deterministic pseudonym, whose animal
 * follows their avatar. Either way we never expose the email. Keep this the
 * single source of truth for "what do we call this climber" so the leaderboard,
 * friends, challenges and post-climb readout always agree: every caller that
 * has the user's avatar must pass it.
 */
export function climberDisplay(id: string, displayName?: string | null, avatarId?: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : climberHandle(id, avatarId);
}
