/**
 * Whether this device has been through the first-run tutorial (training
 * climb, then the tour of the level map). Stored per device, like the level
 * tutorials: a lost flag only means the tutorial is offered again.
 */

const KEY = "doomstack:onboarding-done";

export function onboardingDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // No storage: never trap a player in the tutorial on every launch.
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

/**
 * Whether a player opening the map should get the first-run tutorial: not
 * yet done on this device, and no level cleared (a returning player on a new
 * device already knows the game).
 */
export function needsOnboarding(frontier: number): boolean {
  return frontier <= 1 && !onboardingDone();
}

/** Router state that asks the level map to run its tour. */
export const TOUR_STATE = { tour: true } as const;

export function wantsTour(state: unknown): boolean {
  return typeof state === "object" && state !== null && "tour" in state && (state as { tour: unknown }).tour === true;
}
