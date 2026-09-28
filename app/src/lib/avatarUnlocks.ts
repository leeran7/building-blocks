/**
 * Who may select which avatar. Pure and client-safe (the mobile SPA imports
 * it); the server feeds it values it derived itself, never request input.
 *
 * An avatar is selectable when any of these holds:
 *   - its rule is free, or the player's level stars meet its star rule;
 *   - it is the player's starter, the animal new accounts are given by
 *     defaultAvatarFor (src/db/user.ts ensureUser). Otherwise a new player
 *     who tried another avatar could never get their first one back;
 *   - it is the player's saved avatar (grandfathered). This lasts only while
 *     it stays saved: switching to another avatar locks it again until its
 *     star rule is met, and the picker warns before that switch.
 */

import {
  AVATARS,
  avatarsUnlockedBetween,
  parseAvatarId,
  requiredStars,
  starsToUnlock,
  unlockMessage,
  type AvatarEntry,
} from "./avatars";
import { defaultAvatarFor } from "./handle";

export interface AvatarUnlockInput {
  /** The player's level stars, counted by the server (src/db/avatarUnlocks.ts). */
  stars: number;
  /** The stored avatar id (any string; anything outside the catalogue is ignored). */
  savedAvatarId: string | null;
  userId: string;
}

/** The unlock state the settings API returns for the picker. */
export interface AvatarUnlockState {
  stars: number;
  /** Every catalogue id this player may select, in catalogue order. */
  unlockedIds: string[];
  /**
   * The saved avatar when it is selectable only because it is saved (its
   * star rule unmet, not the starter), else null. Switching away locks it.
   */
  grandfatheredId: string | null;
}

/** Why an avatar cannot be selected: the star rule still unmet. */
export interface AvatarLock {
  avatarId: string;
  name: string;
  requiredStars: number;
  stars: number;
  /** "Earn 30 stars to unlock Falcon", safe to show as-is. */
  message: string;
}

/** Unlocked on its own merits: free, earned by stars, or the starter. */
function earned(entry: AvatarEntry, input: AvatarUnlockInput): boolean {
  return starsToUnlock(entry, input.stars) === 0 || entry.id === defaultAvatarFor(input.userId);
}

function selectable(entry: AvatarEntry, input: AvatarUnlockInput): boolean {
  return earned(entry, input) || entry.id === parseAvatarId(input.savedAvatarId);
}

/**
 * The lock on a catalogue entry for this player, or null when they may select
 * it. Takes an entry, not a raw id, so an unknown id can never read as
 * "unlocked": the caller resolves it with avatarEntry and rejects a null.
 */
export function avatarLockFor(entry: AvatarEntry, input: AvatarUnlockInput): AvatarLock | null {
  const need = requiredStars(entry);
  if (need === null || selectable(entry, input)) return null;
  return {
    avatarId: entry.id,
    name: entry.name,
    requiredStars: need,
    stars: input.stars,
    message: unlockMessage(entry.name, need),
  };
}

/** Every avatar the player may select, with the star count behind it. */
export function avatarUnlockState(input: AvatarUnlockInput): AvatarUnlockState {
  const saved = AVATARS.find((a) => a.id === parseAvatarId(input.savedAvatarId));
  return {
    stars: input.stars,
    unlockedIds: AVATARS.filter((a) => selectable(a, input)).map((a) => a.id),
    grandfatheredId: saved && !earned(saved, input) ? saved.id : null,
  };
}

/**
 * Avatars a rise from `before` to `after` stars made newly selectable: their
 * threshold crossed, minus any the player could already select without stars
 * (the starter and the saved avatar), which would not be news.
 */
export function avatarsNewlyUnlocked(
  before: number,
  after: number,
  player: { userId: string; savedAvatarId: string | null }
): string[] {
  const owned = new Set([defaultAvatarFor(player.userId), parseAvatarId(player.savedAvatarId)]);
  return avatarsUnlockedBetween(before, after).filter((id) => !owned.has(id));
}
