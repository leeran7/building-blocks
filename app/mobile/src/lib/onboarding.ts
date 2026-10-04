/**
 * Whether this device has been through the first-run tutorial (training
 * climb, then the tour of the level map). Stored per device, like the level
 * tutorials: a lost flag only means the tutorial is offered again.
 *
 * Accounts and guests keep separate flags: a guest who trains and later signs
 * in still gets the account's map tour (Leeran, 2026-10-04).
 */

export const ONBOARDING_KEY = "doomstack:onboarding-done";
export const GUEST_ONBOARDING_KEY = "doomstack:guest:onboarding-done";

export interface OnboardingFlag {
  done(): boolean;
  markDone(): void;
  /**
   * Whether a player starting out should get the tutorial: not yet done on
   * this device, not already offered this launch, and no level cleared (a
   * returning player on a new device already knows the game).
   */
  needs(frontier: number): boolean;
  /** The tutorial was opened: not again until the next launch. */
  markOffered(): void;
  /** Tests only: forget the in-memory state along with storage. */
  reset(): void;
}

function createOnboardingFlag(key: string): OnboardingFlag {
  /** Done this launch, for when storage refuses the write: never offer it twice in a row. */
  let doneThisLaunch = false;
  /**
   * Already opened this launch. Leaving it with Back (Android) lands on the
   * screen that opened it, which must not send the player straight back in;
   * the next launch offers it again.
   */
  let offeredThisLaunch = false;
  const flag: OnboardingFlag = {
    done() {
      if (doneThisLaunch) return true;
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        // No storage: never trap a player in the tutorial on every launch.
        return true;
      }
    },
    markDone() {
      doneThisLaunch = true;
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* storage unavailable: nothing to remember */
      }
    },
    needs(frontier) {
      return frontier <= 1 && !offeredThisLaunch && !flag.done();
    },
    markOffered() {
      offeredThisLaunch = true;
    },
    reset() {
      doneThisLaunch = false;
      offeredThisLaunch = false;
    },
  };
  return flag;
}

/** The signed-in player's tutorial: training, then the map tour with tabs. */
export const accountOnboarding = createOnboardingFlag(ONBOARDING_KEY);
/** The guest's tutorial: training only, back to where the guest was going. */
export const guestOnboarding = createOnboardingFlag(GUEST_ONBOARDING_KEY);

export function onboardingDone(): boolean {
  return accountOnboarding.done();
}

export function markOnboardingDone(): void {
  accountOnboarding.markDone();
}

export function needsOnboarding(frontier: number): boolean {
  return accountOnboarding.needs(frontier);
}

export function markOnboardingOffered(): void {
  accountOnboarding.markOffered();
}

/** Tests only: forget the in-memory flags along with storage. */
export function resetOnboardingForTests(): void {
  accountOnboarding.reset();
  guestOnboarding.reset();
}

/** Router state that asks the level map to run its tour. */
export const TOUR_STATE = { tour: true } as const;

export function wantsTour(state: unknown): boolean {
  return typeof state === "object" && state !== null && "tour" in state && (state as { tour: unknown }).tour === true;
}
