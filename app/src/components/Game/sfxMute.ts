/**
 * The saved sound preference: one device-local flag that mutes both the
 * power-up cues and the climb music. The in-run mute button and the mobile
 * Settings screen read and write the same key, so either one sticks.
 */

const MUTE_KEY = "doomstack:sfx-muted";

/** True when the player turned sound off. False when nothing is saved or storage is unavailable. */
export function isSfxMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSfxMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}
