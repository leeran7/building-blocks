/**
 * Who may select which avatar. Pure and client-safe (the mobile SPA imports
 * it); the server feeds it values it derived itself, never request input.
 *
 * An avatar is selectable when either holds:
 *   - its rule is met: a star rule by the player's level stars, a tutorial
 *     rule once they have cleared level 1. A premium rule is never met (not
 *     on sale yet);
 *   - it is the player's saved avatar (grandfathered). This lasts only while
 *     it stays saved: switching to another avatar locks it again until its
 *     rule is met, and the picker warns before that switch. This keeps
 *     players who saved a character before the rules changed (the Wraith,
 *     a starter animal) on it.
 *
 * No character is free outright: a player with none climbs as the Green Stick.
 */

import {
  AVATARS,
  avatarsUnlockedBetween,
  lockedMessage,
  parseAvatarId,
  requiredStars,
  type AvatarEntry,
} from "./avatars";

export interface AvatarUnlockInput {
  /** The player's level stars, counted by the server (src/db/avatarUnlocks.ts). */
  stars: number;
  /** Whether they have cleared level 1, read by the server from stored rows. */
  tutorialDone: boolean;
  /** The stored avatar id (any string; anything outside the catalogue is ignored). */
  savedAvatarId: string | null;
}

/** The unlock state the settings API returns for the picker. */
export interface AvatarUnlockState {
  stars: number;
  /** Absent from an API build older than tutorial unlocks. */
  tutorialDone?: boolean;
  /** Every catalogue id this player may select, in catalogue order. */
  unlockedIds: string[];
  /**
   * The saved avatar when it is selectable only because it is saved (its
   * rule unmet), else null. Switching away locks it.
   */
  grandfatheredId: string | null;
}

/** Why an avatar cannot be selected: its rule is still unmet. */
export interface AvatarLock {
  avatarId: string;
  name: string;
  kind: AvatarEntry["unlock"]["kind"];
  /** The star rule, or null for a tutorial or premium rule. */
  requiredStars: number | null;
  stars: number;
  /** "Earn 30 stars to unlock Falcon", safe to show as-is. */
  message: string;
}

/** Unlocked on its own merits: its rule is met. */
function earned(entry: AvatarEntry, input: AvatarUnlockInput): boolean {
  switch (entry.unlock.kind) {
    case "stars":
      return input.stars >= entry.unlock.stars;
    case "tutorial":
      return input.tutorialDone;
    case "premium":
      return false;
  }
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
  if (selectable(entry, input)) return null;
  return {
    avatarId: entry.id,
    name: entry.name,
    kind: entry.unlock.kind,
    requiredStars: requiredStars(entry),
    stars: input.stars,
    message: lockedMessage(entry),
  };
}

/** Every avatar the player may select, with the star count behind it. */
export function avatarUnlockState(input: AvatarUnlockInput): AvatarUnlockState {
  const saved = AVATARS.find((a) => a.id === parseAvatarId(input.savedAvatarId));
  return {
    stars: input.stars,
    tutorialDone: input.tutorialDone,
    unlockedIds: AVATARS.filter((a) => selectable(a, input)).map((a) => a.id),
    grandfatheredId: saved && !earned(saved, input) ? saved.id : null,
  };
}

/**
 * Avatars a run made newly selectable: star rules its stars crossed (from
 * `before` to `after`) and, when it was the player's first clear of level 1,
 * the stick figures. Minus the saved avatar, which they could already select.
 */
export function avatarsNewlyUnlocked(
  before: number,
  after: number,
  player: { savedAvatarId: string | null; tutorialJustDone: boolean }
): string[] {
  const saved = parseAvatarId(player.savedAvatarId);
  const sticks = player.tutorialJustDone ? AVATARS.filter((a) => a.unlock.kind === "tutorial").map((a) => a.id) : [];
  return [...sticks, ...avatarsUnlockedBetween(before, after)].filter((id) => id !== saved);
}
