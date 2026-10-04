import { useCallback } from "react";
import { apiFetch } from "../lib/api";
import { setLeaderboardConsent } from "../lib/consent";
import {
  echoedSetting,
  useInvalidateAppData,
  useSetSettings,
  type SliceKey,
} from "../contexts/AppDataContext";

/** Every board whose visibility changes when the player turns consent on or off. */
export const CONSENT_STALE_SLICES: SliceKey[] = [
  "leaderboard",
  "friendsLeaderboard",
  "dailyLeaderboard",
  "friendsDailyLeaderboard",
];

/**
 * The one leaderboard-consent save (RV-DC-6), used by the consent sheet on
 * Climb results and on Ranks (always `true`) and by the Settings switch.
 * PUTs /api/settings and trusts it only when the server answers 2xx AND echoes
 * the value sent. Only then does it record consent on the device, store the
 * confirmed settings and mark the boards stale. Resolves true on a confirmed
 * save, false otherwise; never throws. The caller decides what a failure looks
 * like on its screen.
 */
export function useSaveLeaderboardConsent(): (consent: boolean) => Promise<boolean> {
  const setSettings = useSetSettings();
  const invalidate = useInvalidateAppData();
  return useCallback(
    async (consent: boolean) => {
      try {
        const res = await apiFetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaderboardConsent: consent }),
        });
        if (!res.ok) return false;
        const next = echoedSetting(await res.json().catch(() => null), "leaderboardConsent", consent);
        if (!next) return false;
        setLeaderboardConsent(consent);
        setSettings(next);
        invalidate(CONSENT_STALE_SLICES);
        return true;
      } catch {
        return false;
      }
    },
    [setSettings, invalidate],
  );
}

/** Turn consent on: the consent sheet's accept. */
export function useAcceptLeaderboardConsent(): () => Promise<boolean> {
  const save = useSaveLeaderboardConsent();
  return useCallback(() => save(true), [save]);
}
