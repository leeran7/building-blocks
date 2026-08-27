/**
 * Deterministic, privacy-safe display handles for climbers.
 *
 * The public skill leaderboard must not leak a player's email. Since the User
 * row only stores an email + Firebase UID, we derive a stable pseudonym from the
 * UID: the same user always shows the same handle, but it reveals nothing about
 * their identity. Pure + deterministic so it is trivially testable.
 */

const ADJECTIVES = [
  "Swift", "Bold", "Silent", "Crimson", "Golden", "Nimble", "Fearless", "Lucky",
  "Iron", "Cosmic", "Rapid", "Shadow", "Blazing", "Frost", "Vivid", "Steady",
];

const ANIMALS = [
  "Ibex", "Falcon", "Marmot", "Gecko", "Panther", "Otter", "Raven", "Lynx",
  "Bison", "Heron", "Cobra", "Badger", "Wolf", "Kestrel", "Mantis", "Yak",
];

/** Simple, portable 32-bit string hash (deterministic across server + client). */
function hashId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A stable pseudonym like "Swift Ibex 42" for a user id. */
export function climberHandle(id: string): string {
  const h = hashId(id);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const animal = ANIMALS[(h >>> 8) % ANIMALS.length];
  const num = (h >>> 16) % 100;
  return `${adj} ${animal} ${num}`;
}

/**
 * The name to show for a climber. If they've set a profile display name we use
 * it; otherwise we fall back to the deterministic pseudonym. Either way we never
 * expose the email. Keep this the single source of truth for "what do we call
 * this climber" so the leaderboard and post-climb readout always agree.
 */
export function climberDisplay(id: string, displayName?: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : climberHandle(id);
}
