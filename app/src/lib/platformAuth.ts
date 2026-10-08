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
  await ensurePlatformUser(uid);
  const customToken = await adminAuth.createCustomToken(uid, { platform });
  return { uid, customToken };
}
