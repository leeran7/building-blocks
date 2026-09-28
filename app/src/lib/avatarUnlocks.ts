/**
 * Who may select which avatar. Pure and client-safe (the mobile SPA imports
 * it); the server feeds it values it derived itself, never request input.
 *
 * An avatar is selectable when any of these holds:
 *   - its rule is free, or the player's level stars meet its star rule;
 *   - it is the player's saved avatar (grandfathered: a pick made before
 *     unlocks existed stays theirs and can be saved again);
 *   - it is the player's starter, the animal new accounts are given by
 *     defaultAvatarFor (src/db/user.ts ensureUser). Otherwise a new player
 *     who tried another avatar could never get their first one back.
 */

import { AVATARS, parseAvatarId, starsToUnlock, type AvatarEntry } from "./avatars";
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

function selectable(entry: AvatarEntry, input: AvatarUnlockInput): boolean {
  return (
    starsToUnlock(entry, input.stars) === 0 ||
    entry.id === parseAvatarId(input.savedAvatarId) ||
    entry.id === defaultAvatarFor(input.userId)
  );
}

/**
 * The lock on a catalogue entry for this player, or null when they may select
 * it. Takes an entry, not a raw id, so an unknown id can never read as
 * "unlocked": the caller resolves it with avatarEntry and rejects a null.
 */
export function avatarLockFor(entry: AvatarEntry, input: AvatarUnlockInput): AvatarLock | null {
  if (entry.unlock.kind === "free" || selectable(entry, input)) return null;
  return {
    avatarId: entry.id,
    name: entry.name,
    requiredStars: entry.unlock.stars,
    stars: input.stars,
    message: `Earn ${entry.unlock.stars} stars to unlock ${entry.name}`,
  };
}

/** Every avatar the player may select, with the star count behind it. */
export function avatarUnlockState(input: AvatarUnlockInput): AvatarUnlockState {
  return {
    stars: input.stars,
    unlockedIds: AVATARS.filter((a) => selectable(a, input)).map((a) => a.id),
  };
}
