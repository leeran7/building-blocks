import type { SocialState } from "../contexts/AppDataContext";

/**
 * Unsaved Edit Profile fields, kept while the user visits a screen pushed from
 * Edit Profile (the avatar picker). That push unmounts Edit Profile, which
 * would otherwise drop whatever was typed but not yet saved.
 *
 * Module memory only: nothing is persisted, and the draft is keyed by uid so
 * one account's typing can never seed another account's form. Edit Profile
 * takes (and so clears) it on mount, so it never outlives the round-trip.
 */
export interface EditProfileDraft {
  displayName: string;
  username: string;
  social: SocialState;
}

let stored: { uid: string; draft: EditProfileDraft } | null = null;

export function stashEditProfileDraft(uid: string, draft: EditProfileDraft): void {
  stored = { uid, draft: { ...draft, social: { ...draft.social } } };
}

/**
 * Returns this user's draft and clears it, so it re-seeds the form only once.
 * A draft left by a different account is discarded, never returned.
 */
export function takeEditProfileDraft(uid: string): EditProfileDraft | null {
  const hit = stored?.uid === uid ? stored.draft : null;
  stored = null;
  return hit;
}
