/**
 * Who may select which avatar. Pure and client-safe (the mobile SPA imports
 * it); the server feeds it values it derived itself, never request input.
 *
 * An avatar is selectable when either holds:
 *   - its rule is met: a star rule by the player's level stars, a tutorial
 *     rule once they have cleared level 1, a season rule once they have
 *     cleared a season's last level, a purchase rule once the player
 *     owns it (a server-side purchase record, never level data). A premium
 *     rule is never met (not on sale);
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
  /** Whether they have cleared a season's last level, read by the server. Absent means no. */
  seasonDone?: boolean;
  /** The stored avatar id (any string; anything outside the catalogue is ignored). */
  savedAvatarId: string | null;
  /**
   * Catalogue ids the player has bought with gems (owned_characters, read by
   * the server). Absent means none.
   */
  ownedIds?: readonly string[];
}

/** The unlock state the settings API returns for the picker. */
export interface AvatarUnlockState {
  stars: number;
  /** Absent from an API build older than tutorial unlocks. */
  tutorialDone?: boolean;
  /** Absent from an API build older than the season unlock. */
  seasonDone?: boolean;
  /** Every catalogue id this player may select, in catalogue order. */
  unlockedIds: string[];
  /** Catalogue ids bought with gems. Absent from an API build older than the Shop. */
  ownedIds?: string[];
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
    case "season":
      return input.seasonDone ?? false;
    case "premium":
      return false;
    case "purchase":
      return input.ownedIds?.includes(entry.id) ?? false;
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
    seasonDone: input.seasonDone ?? false,
    unlockedIds: AVATARS.filter((a) => selectable(a, input)).map((a) => a.id),
    ownedIds: AVATARS.filter((a) => input.ownedIds?.includes(a.id)).map((a) => a.id),
    grandfatheredId: saved && !earned(saved, input) ? saved.id : null,
  };
}

/**
 * Avatars a run made newly selectable: star rules its stars crossed (from
 * `before` to `after`), the stick figures when it was the player's first
 * clear of level 1, and the Gecko when it was their first clear of a season's
 * last level. Minus the saved avatar, which they could already select.
 */
export function avatarsNewlyUnlocked(
  before: number,
  after: number,
  player: { savedAvatarId: string | null; tutorialJustDone: boolean; seasonJustDone?: boolean }
): string[] {
  const saved = parseAvatarId(player.savedAvatarId);
  const ofKind = (kind: AvatarEntry["unlock"]["kind"]) => AVATARS.filter((a) => a.unlock.kind === kind).map((a) => a.id);
  const sticks = player.tutorialJustDone ? ofKind("tutorial") : [];
  const finale = player.seasonJustDone ? ofKind("season") : [];
  return [...sticks, ...avatarsUnlockedBetween(before, after), ...finale].filter((id) => id !== saved);
}

/** Why the Shop refuses to sell an entry to this player. */
export type PurchaseRefusal =
  /** Not a purchase rule (stars, tutorial, season, premium): never sold for gems. */
  | "NOT_FOR_SALE"
  /** The player already owns it. */
  | "OWNED"
  /** A skin whose character the player cannot select yet ("Character required"). */
  | "CHARACTER_REQUIRED";

/**
 * Whether the Shop may sell `entry` to this player, or why not. A skin needs
 * its character selectable first (earned, owned, or the saved one), like the
 * store design's "Character required".
 */
export function purchaseRefusal(entry: AvatarEntry, input: AvatarUnlockInput): PurchaseRefusal | null {
  if (entry.unlock.kind !== "purchase") return "NOT_FOR_SALE";
  if (input.ownedIds?.includes(entry.id)) return "OWNED";
  if (entry.skinOf !== undefined) {
    const character = AVATARS.find((a) => a.id === entry.skinOf);
    if (character === undefined || !selectable(character, input)) return "CHARACTER_REQUIRED";
  }
  return null;
}
