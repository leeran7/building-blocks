import type { DashboardData, SettingsData } from "../contexts/AppDataContext";

/** The name the player is shown under: profile name, else leaderboard handle, else email. */
export function identityNameFor(settings: SettingsData | null, dash: DashboardData | null): string {
  return settings?.displayName || dash?.freeClimb?.handle || dash?.user.email || "Player";
}
