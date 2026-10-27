/**
 * Whether this device has been through the first-run tour of the level map.
 * Stored per device, like the level tutorials: a lost flag only means the
 * tour is offered again.
 *
 * A new player is not sent through the training climb any more: the map's
 * Play starts level 1 straight away, and level 1's intro (its basics demo and,
 * on touch screens, the controls picker) teaches the game. The tour runs on
 * the map once they have cleared level 1, so it explains a map they have
 * already used. The training stays under Profile, How to play.
 *
 * Accounts and guests keep separate flags: a guest who plays and later signs
 * in still gets the account's map tour (Leeran, 2026-10-04).
 */

export const ONBOARDING_KEY = "doomstack:onboarding-done";
export const GUEST_ONBOARDING_KEY = "doomstack:guest:onboarding-done";

export interface OnboardingFlag {
  done(): boolean;
  markDone(): void;
  /**
   * Whether a player is starting out: not yet done on this device and no
   * level cleared (a returning player on a new device already knows the
   * game).
   */
  needs(frontier: number): boolean;
  /** A new player was seen on the map: their tour comes once level 1 is cleared. */
  markPending(): void;
  /** Whether the tour is owed now: a new player was seen and has since cleared level 1. */
  tourDue(frontier: number): boolean;
  /** Tests only: forget the in-memory state along with storage. */
  reset(): void;
}

function createOnboardingFlag(key: string): OnboardingFlag {
  const pendingKey = `${key}:pending`;
  /** Done this launch, for when storage refuses the write: never offer it twice in a row. */
  let doneThisLaunch = false;
  /** Seen as new this launch, for when storage refuses the pending write. */
  let pendingThisLaunch = false;
  const flag: OnboardingFlag = {
    done() {
      if (doneThisLaunch) return true;
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        // No storage: never trap a player in the tour on every launch.
        return true;
      }
    },
    markDone() {
      doneThisLaunch = true;
      pendingThisLaunch = false;
      try {
        localStorage.setItem(key, "1");
        localStorage.removeItem(pendingKey);
      } catch {
        /* storage unavailable: nothing to remember */
      }
    },
    needs(frontier) {
      return frontier <= 1 && !flag.done();
    },
    markPending() {
      pendingThisLaunch = true;
      try {
        localStorage.setItem(pendingKey, "1");
      } catch {
        /* storage unavailable: this launch still remembers */
      }
    },
    tourDue(frontier) {
      if (frontier <= 1 || flag.done()) return false;
      if (pendingThisLaunch) return true;
      try {
        return localStorage.getItem(pendingKey) === "1";
      } catch {
        return false;
      }
    },
    reset() {
      doneThisLaunch = false;
      pendingThisLaunch = false;
    },
  };
  return flag;
}

/** The signed-in player's map tour, with the tabs. */
export const accountOnboarding = createOnboardingFlag(ONBOARDING_KEY);
/** The guest's map tour: the map's own readouts only. */
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
