import { climberHandle } from "@app/lib/handle";
import type { DashboardData, SettingsData } from "../contexts/AppDataContext";

/** Shown only when no user id is known at all (neither dashboard nor auth). */
const NO_IDENTITY_NAME = "Player";

/**
 * The name the player is shown under: profile name, else their pseudonym.
 * Never the email; Profile shows that on its own line as the account email.
 *
 * With no profile name the name is the pseudonym, whose animal follows the
 * avatar. It is derived here from the settings slice (updated the moment an
 * avatar saves) with the same function the server uses, so the name matches the
 * picture these screens draw from `settings.avatarId`. That holds whether or not
 * the player has climbed: a brand-new account has no free-climb record, but its
 * default avatar already matches its pseudonym.
 *
 * Settings not loaded yet: the dashboard carries no avatar id, only the server's
 * name (display name or avatar-aware pseudonym) once the player has climbed, so
 * that is used; before a climb, the pseudonym without an avatar, which is what
 * the initials badge these screens draw with no settings spells.
 *
 * `uid` is the signed-in user's id, used when the dashboard is not loaded.
 */
export function identityNameFor(
  settings: SettingsData | null,
  dash: DashboardData | null,
  uid?: string | null,
): string {
  if (settings?.displayName) return settings.displayName;
  const id = dash?.user.id || uid;
  if (!id) return NO_IDENTITY_NAME;
  if (settings) return climberHandle(id, settings.avatarId);
  return dash?.freeClimb?.handle || climberHandle(id, null);
}
