/**
 * POST /api/social/accounts/:platform/connect — starts the official OAuth
 * flow for a platform (§4.2). Returns an `authorizeUrl` the browser must
 * navigate to directly (never fetched via XHR/fetch, since TikTok/X/YouTube
 * expect a real top-level navigation for their consent screens).
 */

import { NextRequest } from "next/server";
import {
  withSocialAdminParams,
  jsonOk,
  jsonError,
  enforceRateLimit,
} from "../../../../../../src/api/social/routeHelpers";
import { issueOAuthState } from "../../../../../../src/social/oauth/oauthState";
import { getProvider } from "../../../../../../src/social/providers/registry";
import { SOCIAL_PLATFORMS } from "../../../../../../src/social/types";
import type { SocialPlatform } from "../../../../../../src/social/types";

export const runtime = "nodejs";

function parsePlatform(raw: string): SocialPlatform | null {
  const upper = raw.toUpperCase();
  return (SOCIAL_PLATFORMS as string[]).includes(upper) ? (upper as SocialPlatform) : null;
}

function redirectUriFor(platform: SocialPlatform): string {
  const envName = `${platform}_REDIRECT_URI`;
  const value = process.env[envName];
  if (!value) throw new Error(`${envName} is not configured`);
  return value;
}

export const POST = withSocialAdminParams<{ platform: string }>(async (request, decoded, params) => {
  const platform = parsePlatform(params.platform);
  if (!platform) return jsonError("Unknown platform", 404, "UNKNOWN_PLATFORM");

  // CSRF-state creation is a security path — fail closed per §4/NFR.
  const limited = await enforceRateLimit(request, {
    namespace: "social:accounts:connect",
    identifier: decoded.uid,
    max: 10,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let redirectAfter: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.redirectAfter === "string") redirectAfter = body.redirectAfter;
  } catch {
    // no body is fine — redirectAfter is optional
  }

  const state = await issueOAuthState(platform, decoded.uid, redirectAfter);
  const provider = getProvider(platform);
  const authorizeUrl = provider.getAuthorizationUrl(state, redirectUriFor(platform));

  return jsonOk({ authorizeUrl });
});
