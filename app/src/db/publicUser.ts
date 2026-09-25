/**
 * The public projection of a user row: the one allow-listed shape that friends,
 * challenge and user-search payloads carry. Clients name the player from it
 * with climberDisplay, so every payload must select and map the same fields.
 * Never add email or any other private column here.
 */

import { parseAvatarId } from "../lib/avatars";

/** Prisma `select` for exactly the columns publicUserJson reads. */
export const publicUserSelect = {
  id: true,
  display_name: true,
  username: true,
  avatar_id: true,
} as const;

/** A user row as selected by publicUserSelect. */
export interface PublicUserRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_id: string | null;
}

/** A user as API clients see it. */
export interface PublicUserJson {
  id: string;
  displayName: string | null;
  username: string | null;
  /**
   * Catalogue avatar id or null (also for a retired id). Clients pass it to
   * climberDisplay so a pseudonymous player's animal follows their avatar.
   */
  avatarId: string | null;
}

/** The single mapping from a selected user row to API JSON. */
export function publicUserJson(u: PublicUserRow): PublicUserJson {
  return {
    id: u.id,
    displayName: u.display_name,
    username: u.username,
    avatarId: parseAvatarId(u.avatar_id),
  };
}
