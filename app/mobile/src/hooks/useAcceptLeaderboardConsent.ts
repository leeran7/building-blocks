import { useCallback } from "react";
import { apiFetch } from "../lib/api";
import { setLeaderboardConsent } from "../lib/consent";
import {
  echoedSetting,
  useInvalidateAppData,
  useSetSettings,
  type SliceKey,
} from "../contexts/AppDataContext";

/** Every board whose visibility changes when the player turns consent on. */
export const CONSENT_STALE_SLICES: SliceKey[] = [
  "leaderboard",
  "friendsLeaderboard",
  "dailyLeaderboard",
  "friendsDailyLeaderboard",
];

/**
 * The one "turn on leaderboard consent" flow (RV-DC-6), used by the consent
 * sheet on Climb results and on Ranks. PUTs /api/settings and trusts it only
 * when the server answers 2xx AND echoes leaderboardConsent: true. Only then
 * does it record consent on the device, store the confirmed settings and mark
 * the boards stale. Resolves true on a confirmed save, false otherwise; never
 * throws. The caller decides what a failure looks like on its screen.
 */
export function useAcceptLeaderboardConsent(): () => Promise<boolean> {
  const setSettings = useSetSettings();
  const invalidate = useInvalidateAppData();
  return useCallback(async () => {
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderboardConsent: true }),
      });
      if (!res.ok) return false;
      const next = echoedSetting(await res.json().catch(() => null), "leaderboardConsent", true);
      if (!next) return false;
      setLeaderboardConsent(true);
      setSettings(next);
      invalidate(CONSENT_STALE_SLICES);
      return true;
    } catch {
      return false;
    }
  }, [setSettings, invalidate]);
}
