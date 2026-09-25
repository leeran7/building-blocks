import { climberHandle } from "@app/lib/handle";
import type { DashboardData, SettingsData } from "../contexts/AppDataContext";

/**
 * The name the player is shown under: profile name, else leaderboard handle,
 * else email.
 *
 * With no profile name the leaderboard handle is the pseudonym, whose animal
 * follows the avatar. The dashboard's copy was derived from the avatar at its
 * last fetch, so it is re-derived here from the settings slice (updated the
 * moment an avatar saves) with the same function the server used. Saving Wolf
 * then renames the header at once instead of after the dashboard refetch.
 */
export function identityNameFor(settings: SettingsData | null, dash: DashboardData | null): string {
  if (settings?.displayName) return settings.displayName;
  const handle = dash?.freeClimb?.handle;
  if (handle && settings && dash?.user) return climberHandle(dash.user.id, settings.avatarId);
  return handle || dash?.user.email || "Player";
}
