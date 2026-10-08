/**
 * Sign-in for builds hosted inside another platform (Telegram Mini App,
 * Discord Activity). The platform's own login is verified server-side by its
 * route (POST /api/auth/telegram, /api/auth/discord); this turns that verified
 * platform user id into a Doomstack account and a Firebase custom token. The
 * client signs in with the token, so every existing route's Firebase auth
 * (requireAuth / withAuth) works unchanged for these accounts.
 *
 * Server-only: imports Firebase Admin.
 */

import { randomBytes } from "crypto";
import { adminAuth } from "./firebaseAdmin";
import { ensurePlatformUser } from "../db/user";

export type SignInPlatform = "telegram" | "discord";

/**
 * Telegram user ids and Discord snowflakes are positive integers. Anything
 * else is rejected, never coerced: the id becomes part of a uid.
 */
const PLATFORM_ID = /^[1-9][0-9]{0,19}$/;

/** The uid for a verified platform user id, or null when the id is malformed. */
export function platformUid(platform: SignInPlatform, platformUserId: unknown): string | null {
  if (typeof platformUserId !== "string" || !PLATFORM_ID.test(platformUserId)) return null;
  return `${platform}:${platformUserId}`;
}

/**
 * The account's address: these platforms give no email, but the API reads
 * the ID token's email claim (users.email is NOT NULL/unique, and most routes
 * treat a token without one as anonymous). The address is non-deliverable
 * (`.invalid`) and carries a random suffix, so nobody can register it first
 * with Firebase email sign-up and block the real player's sign-in.
 */
export function newPlatformEmail(uid: string): string {
  return `${uid.replace(":", "-")}-${randomBytes(12).toString("hex")}@platform.invalid`;
}

/**
 * The Firebase Auth user for `uid`, created on first sign-in with a fresh
 * platform address (and given one if it somehow has none). Returns its email,
 * which then rides in every ID token the account signs in with.
 */
async function ensureFirebasePlatformUser(uid: string): Promise<string> {
  try {
    const existing = await adminAuth.getUser(uid);
    if (existing.email) return existing.email;
    const email = newPlatformEmail(uid);
    await adminAuth.updateUser(uid, { email, emailVerified: false });
    return email;
  } catch (err) {
    if ((err as { code?: unknown })?.code !== "auth/user-not-found") throw err;
  }
  const email = newPlatformEmail(uid);
  await adminAuth.createUser({ uid, email, emailVerified: false });
  return email;
}

/**
 * Provision the account and mint its Firebase custom token. Call ONLY with an
 * id the caller verified against the platform (a checked signature or an
 * OAuth exchange the server made itself), never with a request value.
 */
export async function signInPlatformUser(
  platform: SignInPlatform,
  verifiedPlatformUserId: string,
): Promise<{ uid: string; customToken: string }> {
  const uid = platformUid(platform, verifiedPlatformUserId);
  if (uid === null) throw new Error(`signInPlatformUser: malformed ${platform} user id`);
  const email = await ensureFirebasePlatformUser(uid);
  await ensurePlatformUser(uid, email);
  const customToken = await adminAuth.createCustomToken(uid, { platform });
  return { uid, customToken };
}
