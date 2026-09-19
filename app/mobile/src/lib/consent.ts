const CONSENT_KEY = "doomstack:leaderboard-consent";

export function hasLeaderboardConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLeaderboardConsent(v: boolean): void {
  try {
    if (v) localStorage.setItem(CONSENT_KEY, "1");
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* storage unavailable */
  }
}
