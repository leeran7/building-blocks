/**
 * GET  /api/settings — the signed-in user's display name + social handles.
 * PUT  /api/settings — update display name, username, social handles, leaderboard
 *                      consent, and/or avatar (`avatarId`: catalogue id or null).
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { withAuth } from "../../../src/lib/api/withAuth";
import { ensureUser } from "../../../src/db/user";
import {
  getUserSettings,
  updateUserSettings,
  updateUserSocialHandles,
  type SocialHandleMap,
} from "../../../src/db/settings";
import { LEADERBOARD_CACHE_TAG } from "../../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../../src/db/duel";
import { normalizeHandle, isSocialPlatform } from "../../../src/lib/socialHandle";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { sanitizeDisplayName } from "../../../src/lib/sanitizeName";
import { isHatefulName } from "../../../src/lib/nameModeration";
import { normalizeUsername } from "../../../src/lib/username";
import { setUsername, clearUsername } from "../../../src/db/creator";
import { parseAvatarId } from "../../../src/lib/avatars";

export const runtime = "nodejs";

const MAX_NAME = 60;

// Per-user cap on settings writes. Fails OPEN so a Redis outage never blocks a
// legitimate save (UX path).
const SETTINGS_RATE_MAX = 30;
const SETTINGS_RATE_WINDOW_SECONDS = 60;

// revalidateTag profile that expires the tag now, so the next read misses the
// cache instead of getting one more stale response.
const IMMEDIATE_EXPIRY = { expire: 0 } as const;

export const GET = withAuth(async (_request: NextRequest, uid: string) => {
  try {
    return NextResponse.json(await getUserSettings(uid));
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ error: "Could not load your settings. Please try again." }, { status: 500 });
  }
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit per verified UID. Fails OPEN (UX path) so a Redis outage never
  // blocks a legitimate settings save.
  const rl = await checkRateLimit({
    namespace: "settings",
    identifier: decoded.uid,
    max: SETTINGS_RATE_MAX,
    windowSeconds: SETTINGS_RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    console.warn(
      JSON.stringify({
        type: "rate_limit_hit",
        path: "/api/settings",
        uid: decoded.uid,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let body: {
    displayName?: unknown;
    username?: unknown;
    social?: unknown;
    leaderboardConsent?: unknown;
    avatarId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { displayName?: string | null; leaderboardConsent?: boolean; avatarId?: string | null } = {};

  if (body.leaderboardConsent !== undefined) {
    if (typeof body.leaderboardConsent !== "boolean") {
      return NextResponse.json({ error: "leaderboardConsent must be a boolean" }, { status: 400 });
    }
    patch.leaderboardConsent = body.leaderboardConsent;
  }

  // Allow-list only: an unknown id is rejected (never mapped to null/default),
  // and validation runs before any write so a bad id saves nothing at all.
  if (body.avatarId !== undefined) {
    if (body.avatarId === null) {
      patch.avatarId = null;
    } else if (typeof body.avatarId !== "string") {
      return NextResponse.json({ error: "avatarId must be a string or null", code: "INVALID_AVATAR" }, { status: 400 });
    } else {
      const avatarId = parseAvatarId(body.avatarId);
      if (avatarId === null) {
        return NextResponse.json({ error: "Unknown avatar", code: "UNKNOWN_AVATAR" }, { status: 400 });
      }
      patch.avatarId = avatarId;
    }
  }

  // Social handles: a { platform: handle } map. Normalize + moderate each;
  // an empty/null value clears that platform. Built here, applied after the
  // user row is ensured below.
  let socialPatch: SocialHandleMap | undefined;
  if (body.social !== undefined) {
    if (
      typeof body.social !== "object" ||
      body.social === null ||
      Array.isArray(body.social)
    ) {
      return NextResponse.json({ error: "social must be an object" }, { status: 400 });
    }
    const out: SocialHandleMap = {};
    for (const [platform, raw] of Object.entries(body.social)) {
      if (!isSocialPlatform(platform)) {
        return NextResponse.json(
          { error: `Unknown platform: ${platform}`, field: "social" },
          { status: 400 }
        );
      }
      const value = raw == null ? "" : String(raw).trim();
      if (!value) {
        out[platform] = ""; // cleared
        continue;
      }
      const norm = normalizeHandle(platform, value);
      if (!norm.valid || !norm.handle) {
        return NextResponse.json(
          { error: norm.error, field: "social", platform },
          { status: 400 }
        );
      }
      if (isHatefulName(norm.handle)) {
        return NextResponse.json(
          { error: "That handle isn’t allowed.", field: "social", platform },
          { status: 400 }
        );
      }
      out[platform] = norm.handle;
    }
    socialPatch = out;
  }

  if (body.displayName !== undefined) {
    if (body.displayName !== null && typeof body.displayName !== "string") {
      return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
    }
    // Sanitise before length-capping: the display name is now shown publicly on
    // the leaderboard, so strip invisible / bidi-spoofing characters and
    // normalise whitespace. Cap after cleaning so the 60-char budget reflects
    // visible characters. Empty-after-clean becomes null (falls back to the
    // pseudonym).
    if (typeof body.displayName === "string") {
      const clean = sanitizeDisplayName(body.displayName).slice(0, MAX_NAME);
      // Reject racist / hateful names before they can reach the public
      // leaderboard. Checked on the cleaned string so evasion via invisible
      // chars is already stripped. Generic message — don't echo the term back.
      if (clean && isHatefulName(clean)) {
        return NextResponse.json(
          { error: "That display name isn’t allowed." },
          { status: 400 }
        );
      }
      patch.displayName = clean || null;
    } else {
      patch.displayName = null;
    }
  }

  try {
    // Provision the user row if needed (social handles / creator FK to users(id)).
    if (decoded.email) {
      await ensureUser({
        id: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified ?? false,
      });
    }

    // Public creator username (optional). Empty string / null clears it; any
    // other value is normalised, moderated, and set with a uniqueness check.
    if (body.username !== undefined) {
      if (body.username !== null && typeof body.username !== "string") {
        return NextResponse.json({ error: "Invalid username" }, { status: 400 });
      }
      const raw = typeof body.username === "string" ? body.username.trim() : "";
      if (!raw) {
        await clearUsername(decoded.uid);
      } else {
        const norm = normalizeUsername(raw);
        if (!norm.valid || !norm.username) {
          return NextResponse.json(
            { error: norm.error, field: "username" },
            { status: 400 }
          );
        }
        const res = await setUsername(decoded.uid, norm.username);
        if (!res.ok) {
          return NextResponse.json(
            { error: "That username is already taken", field: "username" },
            { status: 409 }
          );
        }
      }
    }

    if (socialPatch) {
      await updateUserSocialHandles(decoded.uid, socialPatch);
    }

    const settings = await updateUserSettings(decoded.uid, patch);
    // Consent decides whether this player's record shows on the public
    // leaderboard, and each row renders the player's avatar. topFreeClimbers'
    // unstable_cache otherwise lives up to 60s. `expire: 0` expires the tag
    // immediately, so the next read is a cache miss: revoking consent removes
    // the player on the very next fetch. Any non-zero profile (e.g.
    // `{ expire: 60 }`) is stale-while-revalidate in Next 16, which serves the
    // old body once more. updateTag() would be immediate too, but it throws
    // outside Server Actions.
    if (patch.leaderboardConsent !== undefined || patch.avatarId !== undefined) {
      revalidateTag(LEADERBOARD_CACHE_TAG, IMMEDIATE_EXPIRY);
    }
    if (patch.displayName !== undefined) {
      // topDuelStats gates visibility on display_name being non-null, so
      // clearing it must drop the player from the duel board on the next
      // fetch too, same immediate expiry as the consent tag above.
      revalidateTag(DUEL_LEADERBOARD_CACHE_TAG, IMMEDIATE_EXPIRY);
      // Audit trail: the name is public and impersonation-capable, so keep
      // it traceable. Log uid + timestamp only — never the raw value, to
      // avoid logging PII.
      console.info(
        JSON.stringify({
          type: "display_name_changed",
          uid: decoded.uid,
          cleared: patch.displayName === null,
          timestamp: new Date().toISOString(),
        })
      );
    }
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[PUT /api/settings]", err);
    return NextResponse.json({ error: "Could not save your settings. Please try again." }, { status: 500 });
  }
}
